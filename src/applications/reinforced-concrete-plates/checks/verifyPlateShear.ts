import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import type { ResultStatus } from "../../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import { ReinforcedConcreteShearVerification } from "../../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";
import type { RcShearVerificationData } from "../../reinforced-concrete-sections/checks/shear/types.js";
import type { ReinforcedConcretePlateModel } from "../ReinforcedConcretePlateModel.js";
import type { RcPlateDirection, RcPlateFace, TransformedRcPlateState } from "../types.js";
import { createPlateStripSection } from "../sections/createPlateStripSection.js";
import { enrichPlateCheck } from "./plateCheckUtils.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const METHOD_WITH = "ntc2018-4.1.2.3.5.2-wood-armer-strip-s-links";
const METHOD_WITHOUT = "ntc2018-4.1.2.3.5.1-wood-armer-strip";
const MOMENT_TOLERANCE = 1e-9;

interface FaceSelection {
  faces: RcPlateFace[];
  ambiguous: boolean;
}

interface FaceCandidate {
  face: RcPlateFace;
  result: RcShearVerificationData;
}

export interface PlateShearVerification {
  stateId: string;
  direction: RcPlateDirection;
  face: string;
  analysisType: string;
  combinationType: string | null;
  method: string;
  vEd: number;
  capacity: number | null;
  utilizationRatio: number | null;
  status: ResultStatus;
  evaluatedFaces: RcPlateFace[];
  governingFace: RcPlateFace | null;
  shearReinforcement: Record<string, unknown> | null;
  vRdWithTransverseReinforcement: unknown;
  vRdWithoutTransverseReinforcement: unknown;
  vRsd: unknown;
  vRcd: unknown;
  selectedMechanism: unknown;
  candidates: Array<Record<string, unknown>>;
  check: VerificationCheck;
  warnings: string[];
  assumptions: string[];
}

function candidateFaces(
  woodArmer: TransformedRcPlateState["woodArmer"],
  direction: RcPlateDirection,
): FaceSelection {
  const bottom = woodArmer[`bottom-${direction}`];
  const top = woodArmer[`top-${direction}`];
  const bottomActive = Math.abs(bottom) > MOMENT_TOLERANCE;
  const topActive = Math.abs(top) > MOMENT_TOLERANCE;

  if (bottomActive && !topActive) {
    return { faces: ["bottom"], ambiguous: false };
  }

  if (topActive && !bottomActive) {
    return { faces: ["top"], ambiguous: false };
  }

  return { faces: ["bottom", "top"], ambiguous: true };
}

function transverseReinforcementForDirection(
  model: ReinforcedConcretePlateModel,
  direction: RcPlateDirection,
): Record<string, unknown> | null {
  const reinforcement = model.reinforcement.shear;

  if (!reinforcement) {
    return null;
  }

  const longitudinalSpacing = direction === "x" ? reinforcement.spacingX : reinforcement.spacingY;
  const transverseSpacing = direction === "x" ? reinforcement.spacingY : reinforcement.spacingX;

  return {
    type: reinforcement.type,
    diameter: reinforcement.diameter,
    angle: reinforcement.angle,
    legs: model.geometry.unitWidth / transverseSpacing,
    spacing: longitudinalSpacing,
  };
}

function verifyFace({
  model,
  transformedState,
  direction,
  face,
  section,
}: {
  model: ReinforcedConcretePlateModel;
  transformedState: TransformedRcPlateState;
  direction: RcPlateDirection;
  face: RcPlateFace;
  section: ReinforcedConcreteSection;
}): RcShearVerificationData {
  const layer = model.reinforcement[face][direction];
  const effectiveDepth = face === "bottom" ? model.geometry.thickness - layer.axis : layer.axis;
  const mEd = transformedState.woodArmer[`${face}-${direction}`] * model.geometry.unitWidth;
  const vEd = Math.abs(transformedState.shear[`q${direction}`]) * model.geometry.unitWidth;
  const transverseReinforcement = transverseReinforcementForDirection(model, direction);

  return new ReinforcedConcreteShearVerification().verifySectionActions({
    nEd: 0,
    vEd,
    mEd,
    section,
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    shear: {
      mode: transverseReinforcement
        ? "with-transverse-reinforcement"
        : "without-transverse-reinforcement",
      bw: model.geometry.unitWidth,
      effectiveDepth,
      longitudinalReinforcementArea: layer.area,
      tensionFace: face,
      transverseReinforcement,
    },
    units: INTERNAL_UNITS,
  });
}

function outputValue(result: RcShearVerificationData, key: string): unknown {
  return result.outputs[key];
}

export function verifyPlateShear({
  model,
  transformedState,
}: {
  model?: ReinforcedConcretePlateModel;
  transformedState?: TransformedRcPlateState;
} = {}): PlateShearVerification[] {
  if (!model || !transformedState) {
    throw new Error("verifyPlateShear requires a plate model and transformed state.");
  }

  return (["x", "y"] as const).map((direction) => {
    const strip = createPlateStripSection({ model, direction });
    const selection = candidateFaces(transformedState.woodArmer, direction);
    const candidates: FaceCandidate[] = selection.faces.map((face) => ({
      face,
      result: verifyFace({
        model,
        transformedState,
        direction,
        face,
        section: strip.section,
      }),
    }));
    const available = candidates.filter(({ result }) => Number.isFinite(result.capacity));
    const governing = available.reduce<FaceCandidate | null>(
      (selected, candidate) =>
        selected == null ||
        (candidate.result.capacity as number) < (selected.result.capacity as number)
          ? candidate
          : selected,
      null,
    );
    const vEd = Math.abs(transformedState.shear[`q${direction}`]) * model.geometry.unitWidth;
    const capacity = governing?.result.capacity ?? null;
    const utilizationRatio =
      Number.isFinite(capacity) && (capacity as number) > 0 ? vEd / (capacity as number) : null;
    const sourceCheck = governing?.result.checks[0] ?? {};
    const reinforced = model.reinforcement.shear != null;
    const method = reinforced ? METHOD_WITH : METHOD_WITHOUT;
    const check = enrichPlateCheck(
      {
        ...sourceCheck,
        id: reinforced ? "rc-shear-resistance" : "rc-shear-without-transverse-reinforcement",
        description: `Shear resistance of the ${direction.toUpperCase()} Wood-Armer equivalent strip`,
        demand: vEd,
        capacity,
        utilizationRatio,
        ok: Number.isFinite(utilizationRatio) && (utilizationRatio as number) <= 1,
        metadata: {
          evaluatedFaces: selection.faces,
          ambiguousTensionFace: selection.ambiguous,
        },
      },
      {
        id: `rc-plate-uls-shear-${transformedState.id}-${direction}`,
        direction,
        face: governing?.face ?? selection.faces.join("/"),
        analysisType: model.analysis.type,
        combinationType: transformedState.combinationType,
        stateId: transformedState.id,
        method,
      },
    );
    const ambiguityWarning = selection.ambiguous
      ? `Plate shear direction ${direction.toUpperCase()}: the tensile face is null or ambiguous; both reinforcement faces were evaluated and the lower resistance governs.`
      : null;
    const shearReinforcement = model.reinforcement.shear;

    return {
      stateId: transformedState.id,
      direction,
      face: String(check.face),
      analysisType: model.analysis.type,
      combinationType: transformedState.combinationType,
      method,
      vEd,
      capacity,
      utilizationRatio,
      status: check.ok ? "ok" : "not-verified",
      evaluatedFaces: selection.faces,
      governingFace: governing?.face ?? null,
      shearReinforcement:
        reinforced && shearReinforcement
          ? {
              ...shearReinforcement,
              longitudinalSpacing:
                direction === "x" ? shearReinforcement.spacingX : shearReinforcement.spacingY,
              transverseSpacing:
                direction === "x" ? shearReinforcement.spacingY : shearReinforcement.spacingX,
              effectiveLinksAcrossUnitWidth:
                model.geometry.unitWidth /
                (direction === "x" ? shearReinforcement.spacingY : shearReinforcement.spacingX),
            }
          : null,
      vRdWithTransverseReinforcement:
        governing == null
          ? null
          : (outputValue(governing.result, "vRdWithTransverseReinforcement") ?? null),
      vRdWithoutTransverseReinforcement:
        governing == null
          ? capacity
          : (outputValue(governing.result, "vRdWithoutTransverseReinforcement") ?? capacity),
      vRsd: governing == null ? null : (outputValue(governing.result, "vRsd") ?? null),
      vRcd: governing == null ? null : (outputValue(governing.result, "vRcd") ?? null),
      selectedMechanism:
        governing == null
          ? "without-transverse-reinforcement"
          : (outputValue(governing.result, "selectedMechanism") ??
            "without-transverse-reinforcement"),
      candidates: candidates.map(({ face, result }) => ({
        face,
        capacity: result.capacity,
        utilizationRatio: result.utilizationRatio,
        status: result.status,
        outputs: result.outputs,
      })),
      check,
      warnings: [ambiguityWarning, ...candidates.flatMap(({ result }) => result.warnings)].filter(
        (value): value is string => typeof value === "string",
      ),
      assumptions: [
        ...candidates.flatMap(({ result }) => result.assumptions),
        ...(reinforced
          ? [
              "Each vertical S-link is modeled as one effective shear leg, properly anchored around the top and bottom longitudinal reinforcement.",
              "The regular S-link grid is converted to Asw/s on the 1000 mm strip and is checked independently in X and Y without a vector interaction law.",
            ]
          : []),
      ],
    };
  });
}
