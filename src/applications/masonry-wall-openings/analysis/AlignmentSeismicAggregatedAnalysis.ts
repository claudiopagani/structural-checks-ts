import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { createUnitResolver } from "../../../domain/units/UnitSystem.js";
import {
  calculateNTC2018MasonryPierElasticStiffness,
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierIrregularDiagonalCapacity,
  calculateNTC2018MasonryPierRegularDiagonalCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
  calculateNTC2018MasonryPierUltimateDisplacement,
  selectNTC2018MasonryPierGoverningCapacity,
} from "../../../norms/ntc2018/masonry/index.js";
import { SteelRingFramePushoverAnalysis } from "../../steel-frames/analysis/SteelRingFramePushoverAnalysis.js";
import type {
  SteelRingFrameMemberOrientationInput,
  SteelRingFrameMemberSectionsInput,
  SteelRingFrameMemberOrientationsInput,
  SteelRingFramePushoverModelOptions,
  SteelRingFrameSectionInput,
  SteelRingFrameSolverInput,
} from "../../steel-frames/models/SteelRingFramePushoverModel.js";
import {
  extractEquivalentFrameMembers,
  type EquivalentFrameMembersResult,
} from "../geometry/extractEquivalentFrameMembers.js";
import {
  sanitizeAlignmentOpenings,
  type SanitizedAlignmentOpening,
} from "../geometry/sanitizeAlignmentOpenings.js";
import {
  resolveAlignmentMechanicalState,
  type AlignmentMechanicalStateOptions,
  type AlignmentMechanicalStateResolution,
} from "../materials/resolveAlignmentMechanicalState.js";
import { resolveMasonryMaterialProperty } from "../materials/resolveMasonryMaterialProperty.js";
import { bilinearizeCapacityCurve } from "./AlignmentCapacityBilinearization.js";
import {
  AlignmentStaticAnalysis,
  type AlignmentStaticAnalysisOptions,
  type AlignmentStaticAnalysisResult,
} from "./AlignmentStaticAnalysis.js";
import type { MasonryWallOpeningsModel } from "../models/MasonryWallOpeningsModel.js";
import type { MasonryWallPierModel } from "../models/MasonryWallPierModel.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";

type JsonRecord = Record<string, unknown>;
type CurvePoint = { id: string; displacement: number; baseShear: number };
type RawCurvePoint = JsonRecord & {
  id?: string;
  displacement?: unknown;
  controlDisplacement?: unknown;
  baseShear?: unknown;
  force?: unknown;
};
type TopRotation = "free" | "fixed";
type StaticPierResult = AlignmentStaticAnalysisResult["outputs"]["piers"][number];

interface SeismicAnalysisOptions extends JsonRecord {
  topRotation?: string;
  crackedStiffnessFactor?: number | null;
  materialResolution?: AlignmentMechanicalStateOptions;
  includeSpandrels?: boolean;
  staticOptions?: AlignmentStaticAnalysisOptions;
  verticalCombinationType?: string;
  capacityDropRatio?: number;
}

export interface AlignmentSeismicAggregatedAnalysisInput {
  alignment?: MasonryWallOpeningsModel | null;
  stage?: string;
  options?: SeismicAnalysisOptions;
  sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
  extractedMembers?: EquivalentFrameMembersResult | null;
  staticResult?: AlignmentStaticAnalysisResult | null;
  resolvedAlignmentState?: AlignmentMechanicalStateResolution | null;
}

interface PierContribution extends JsonRecord {
  id: string;
  contributorType: "pier";
  wallId: string;
  topRotation: TopRotation;
  curvePoints: CurvePoint[];
  stiffness: number;
  yieldDisplacement: number;
  ultimateDisplacement: number;
  peakBaseShear: number;
  governingFamily: "flexural" | "shear";
  governingMode: string;
  axialForces: { base: number; midHeight: number };
  mechanics: {
    flexural: JsonRecord;
    bedJointSliding: JsonRecord;
    diagonalCracking: JsonRecord;
    confidenceFactor: number;
    stiffness: JsonRecord;
  };
  driftCapacity: number;
}

interface RingFrameInput extends JsonRecord {
  frameCount?: unknown;
  parallelFrameCount?: unknown;
  framesInThickness?: unknown;
  parallelFrames?: unknown;
  count?: unknown;
  memberSections?: SteelRingFrameMemberSectionsInput;
  profileName?: SteelRingFrameSectionInput;
  profile?: SteelRingFrameSectionInput;
  sectionProfileName?: SteelRingFrameSectionInput;
  columnProfileName?: SteelRingFrameSectionInput;
  topBeamProfileName?: SteelRingFrameSectionInput;
  columns?: SteelRingFrameSectionInput;
  column?: SteelRingFrameSectionInput;
  topBeam?: SteelRingFrameSectionInput;
  architrave?: SteelRingFrameSectionInput;
  bottomBeam?: SteelRingFrameSectionInput;
  bottomChord?: SteelRingFrameSectionInput;
  leftColumn?: SteelRingFrameSectionInput;
  rightColumn?: SteelRingFrameSectionInput;
  memberOrientations?: string | SteelRingFrameMemberOrientationsInput;
  memberOrientation?: string | SteelRingFrameMemberOrientationsInput;
  sectionOrientations?: string | SteelRingFrameMemberOrientationsInput;
  sectionOrientation?: string | SteelRingFrameMemberOrientationsInput;
  orientations?: string | SteelRingFrameMemberOrientationsInput;
  orientation?: string | SteelRingFrameMemberOrientationsInput;
  columnOrientation?: string;
  columnsOrientation?: string;
  leftColumnOrientation?: string;
  rightColumnOrientation?: string;
  topBeamOrientation?: string;
  architraveOrientation?: string;
  bottomBeamOrientation?: string;
  bottomChordOrientation?: string;
  material?: SteelRingFramePushoverModelOptions["material"];
  materialGrade?: string;
  grade?: string;
  baseCondition?: string;
  includeBottomBeam?: boolean;
  controlNode?: string;
  referenceHorizontalForce?: number;
  horizontalForce?: number;
  Fh?: number;
  solver?: SteelRingFrameSolverInput;
  maxControlDisplacement?: number;
  maxDisplacement?: number;
  controlDisplacementIncrement?: number;
  controlIncrement?: number;
}

interface RingFrameContribution extends JsonRecord {
  id: string;
  contributorType: "ring-frame";
  openingId: string;
  status: string;
  frameCount: number;
  curvePoints: CurvePoint[];
  maxBaseShear?: number;
  ultimateDisplacement?: number;
  analysisWarnings?: string[];
  assumptions?: string[];
  metadata?: JsonRecord;
}

type Contributor = PierContribution | RingFrameContribution;

interface AlignmentSeismicAggregatedAnalysisOutputs extends JsonRecord {
  stage: string;
  topRotation: TopRotation;
  includeSpandrels: boolean;
  verticalCombinationType?: string;
  capacityCurve: {
    units: { displacement: string; baseShear: string };
    points: CurvePoint[];
    maxBaseShear: number;
    ultimateDisplacement: number;
  };
  bilinearization?: JsonRecord;
  piers?: JsonRecord[];
  ringFrames?: JsonRecord[];
  staticReference?: JsonRecord;
}

export type AlignmentSeismicAggregatedAnalysisResult =
  CalculationResult<AlignmentSeismicAggregatedAnalysisOutputs>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOrUndefined(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compatibilityString(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "undefined";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => compatibilityString(item)).join(",");
  }

  return Object.prototype.toString.call(value);
}

function asRingFrame(value: unknown): RingFrameInput | null {
  return isRecord(value) ? value : null;
}

function isMemberOrientations(value: unknown): value is SteelRingFrameMemberOrientationsInput {
  return value !== null && typeof value === "object";
}

function orientationInput(value: unknown): SteelRingFrameMemberOrientationInput {
  return typeof value === "string" || value === null || isRecord(value) ? value : undefined;
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

const DEFAULT_TOP_ROTATION = "free";
const DEFAULT_RING_FRAME_MAX_DISPLACEMENT = 0.03;
const DEFAULT_RING_FRAME_MAX_STEPS = 60;
const DEFAULT_RING_FRAME_MAX_ITERATIONS = 60;
const DEFAULT_RING_FRAME_CONTROL_INCREMENT_RATIO = 1 / 20;
const SHEAR_CORRECTION_FACTOR = 5 / 6;
const STEEL_RING_FRAME_USER_UNITS = Object.freeze({ force: "kN", length: "m" });
const EPS = 1e-9;

function normalizeTopRotation(value: unknown = DEFAULT_TOP_ROTATION): TopRotation {
  const normalized = compatibilityString(value ?? "")
    .trim()
    .toLowerCase();

  const aliases = new Map([
    ["free", "free"],
    ["libera", "free"],
    ["hinged", "free"],
    ["fixed", "fixed"],
    ["fissa", "fixed"],
    ["incastrata", "fixed"],
    ["clamped", "fixed"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported pier topRotation option: ${String(value)}.`);
  }

  if (resolved !== "free" && resolved !== "fixed") {
    throw new Error(`Unsupported pier topRotation option: ${String(value)}.`);
  }

  return resolved;
}

function maxFinite(values: readonly number[] = []): number | null {
  const finiteValues = values.filter(Number.isFinite);

  return finiteValues.length > 0 ? Math.max(...finiteValues) : null;
}

function postFailureDisplacement(displacement: number): number {
  return displacement + Math.max(displacement * 1e-6, 1e-6);
}

function normalizeCurvePoint(
  point: RawCurvePoint,
  index: number,
): { id: string; displacement: number | undefined; baseShear: number | undefined } {
  return {
    id: point.id ?? `point-${index + 1}`,
    displacement: isFiniteNumber(point.displacement)
      ? point.displacement
      : finiteOrUndefined(point.controlDisplacement),
    baseShear: isFiniteNumber(point.baseShear) ? point.baseShear : finiteOrUndefined(point.force),
  };
}

function interpolateCurve(points: readonly CurvePoint[] = [], displacement: number): number {
  if (!Number.isFinite(displacement) || points.length === 0) {
    return 0;
  }

  const firstPoint = points[0];
  if (!firstPoint) {
    return 0;
  }

  if (displacement <= firstPoint.displacement + EPS) {
    return firstPoint.baseShear;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const startPoint = points[index];
    const endPoint = points[index + 1];

    if (!startPoint || !endPoint) {
      continue;
    }

    if (displacement > endPoint.displacement + EPS) {
      continue;
    }

    const deltaDisplacement = endPoint.displacement - startPoint.displacement;

    if (deltaDisplacement <= EPS) {
      return endPoint.baseShear;
    }

    const ratio = (displacement - startPoint.displacement) / deltaDisplacement;

    return startPoint.baseShear + ratio * (endPoint.baseShear - startPoint.baseShear);
  }

  return points.at(-1)?.baseShear ?? 0;
}

function roundCurvePoints(points: readonly CurvePoint[] = []): CurvePoint[] {
  return points.map((point) => ({
    id: point.id,
    displacement: round(point.displacement),
    baseShear: round(point.baseShear),
  }));
}

function buildPierContribution({
  alignment,
  pier,
  staticPier,
  topRotation,
  crackedStiffnessFactor,
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  pier: MasonryWallPierModel;
  staticPier: StaticPierResult | undefined;
  topRotation: TopRotation;
  crackedStiffnessFactor: number;
  warnings: string[];
}): PierContribution | null {
  if (!staticPier) {
    warnings.push(
      `Pier ${pier.id} was skipped in the seismic aggregation because no seismic axial-force state was available.`,
    );
    return null;
  }

  const length =
    Number.isFinite(pier.effectiveLength) && pier.effectiveLength > EPS
      ? pier.effectiveLength
      : pier.length;
  const height = pier.height;
  const mechanismHeight = topRotation === "fixed" ? height / 2 : height;
  const baseAxialForce = Math.max(0, staticPier.baseReaction ?? 0);
  const midHeightAxialForce = Math.max(
    0,
    (staticPier.axialForce ?? 0) + (staticPier.selfWeight ?? 0) / 2,
  );
  const material = isRecord(pier.material) ? pier.material : {};
  const materialMetadata = isRecord(material.metadata) ? material.metadata : {};
  const confidenceFactor =
    isFiniteNumber(material.confidenceFactor) && material.confidenceFactor > EPS
      ? material.confidenceFactor
      : 1;
  const resolveStrength = (aliases: readonly string[]): number | undefined => {
    const value = resolveMasonryMaterialProperty({
      material: material,
      aliases,
      targetUnits: alignment.units,
    });

    return isFiniteNumber(value) ? value / confidenceFactor : undefined;
  };
  const compressiveStrength = resolveStrength(["fm"]);
  const bedJointCohesion = resolveStrength(["fv0"]);
  const shearStrength = resolveStrength(["tau0"]);
  const blockCompressiveStrength = resolveStrength(["fb", "blockCompressiveStrength"]);
  const explicitBlockTensileStrength = resolveStrength(["fbt", "blockTensileStrength"]);
  const blockTensileStrength =
    explicitBlockTensileStrength ??
    (isFiniteNumber(blockCompressiveStrength) ? 0.1 * blockCompressiveStrength : undefined);
  const explicitShearStrengthLimit = resolveStrength(["fvlim", "shearStrengthLimit"]);
  const shearStrengthLimit =
    explicitShearStrengthLimit ??
    (isFiniteNumber(blockCompressiveStrength)
      ? (0.065 * blockCompressiveStrength) / 0.7
      : undefined);
  const masonryTexture = compatibilityString(
    materialMetadata.masonryTexture ?? material.masonryTexture ?? "irregular",
  )
    .trim()
    .toLowerCase();
  const interlockingCoefficient = finiteOrUndefined(
    material.interlockingCoefficient ?? materialMetadata.interlockingCoefficient,
  );
  const localFrictionCoefficient =
    finiteOrUndefined(
      material.localFrictionCoefficient ?? materialMetadata.localFrictionCoefficient,
    ) ?? 0.577;
  const elasticModulus = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["E", "elasticModulus"],
    targetUnits: alignment.units,
  });
  const shearModulus = resolveMasonryMaterialProperty({
    material: pier.material,
    aliases: ["G", "shearModulus"],
    targetUnits: alignment.units,
  });

  if (!isFiniteNumber(compressiveStrength) || compressiveStrength <= EPS) {
    warnings.push(
      `Pier ${pier.id} was skipped in the seismic aggregation because no finite masonry compressive strength fm could be resolved.`,
    );
    return null;
  }

  const flexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: baseAxialForce,
    compressiveStrength,
    thickness: pier.thickness,
    length,
    shearSpan: mechanismHeight,
  });
  const bedJointSliding = calculateNTC2018MasonryPierSlidingCapacity({
    cohesion: bedJointCohesion,
    shearStrengthLimit,
    axialCompression: midHeightAxialForce,
    thickness: pier.thickness,
    length,
    shearSpan: mechanismHeight,
  });
  const diagonalCracking =
    masonryTexture === "regular"
      ? calculateNTC2018MasonryPierRegularDiagonalCapacity({
          axialCompression: midHeightAxialForce,
          cohesion: bedJointCohesion,
          interlockingCoefficient,
          localFrictionCoefficient,
          blockTensileStrength,
          thickness: pier.thickness,
          length,
          height,
        })
      : calculateNTC2018MasonryPierIrregularDiagonalCapacity({
          axialCompression: midHeightAxialForce,
          referenceShearStrength: shearStrength,
          thickness: pier.thickness,
          length,
          height,
        });

  for (const capacity of [flexural, bedJointSliding, diagonalCracking]) {
    if (!capacity.available) {
      warnings.push(
        `Pier ${pier.id} could not evaluate ${capacity.mechanism} with the strict NTC model because ${capacity.missing.join(", ")} is missing. The alignment envelope uses only the available mechanisms.`,
      );
    }
  }

  const governing = selectNTC2018MasonryPierGoverningCapacity([
    flexural,
    bedJointSliding,
    diagonalCracking,
  ]);
  if (!governing || !isFiniteNumber(governing.capacity) || governing.capacity <= EPS) {
    warnings.push(
      `Pier ${pier.id} produced no positive in-plane seismic resistance and was excluded from the aggregated capacity curve.`,
    );
    return null;
  }

  const governingForce = governing.capacity;

  const governingFamily = governing.mechanism === "flexural" ? "flexural" : "shear";
  const governingMode =
    governing.mechanism === "flexural"
      ? "rocking-toe-crushing"
      : governing.mechanism.startsWith("diagonal-cracking")
        ? "diagonal-cracking"
        : governing.mechanism;
  const deformation = calculateNTC2018MasonryPierUltimateDisplacement({
    height,
    mechanism: governing.mechanism,
    scope: "existing",
    modernPerforatedBlocks: Boolean(
      materialMetadata.modernPerforatedBlocks ?? material.modernPerforatedBlocks,
    ),
  });
  const driftCapacity = deformation.driftCapacity;

  if (!Number.isFinite(driftCapacity) || driftCapacity <= EPS) {
    warnings.push(
      `Pier ${pier.id} produced a non-positive drift capacity and was excluded from the aggregated capacity curve.`,
    );
    return null;
  }

  const ultimateDisplacement = deformation.ultimateDisplacement;

  if (
    !isFiniteNumber(elasticModulus) ||
    elasticModulus <= EPS ||
    !isFiniteNumber(shearModulus) ||
    shearModulus <= EPS
  ) {
    warnings.push(
      `Pier ${pier.id} was skipped because the strict NTC stiffness requires finite positive E and G; no force/displacement fallback was introduced.`,
    );
    return null;
  }

  const stiffnessResult = calculateNTC2018MasonryPierElasticStiffness({
    elasticModulus,
    shearModulus,
    length,
    thickness: pier.thickness,
    deformableHeight:
      Number.isFinite(pier.deformableHeight) && pier.deformableHeight > EPS
        ? pier.deformableHeight
        : height,
    boundaryCondition: topRotation === "fixed" ? "fixed-fixed" : "cantilever",
    shearCorrectionFactor: SHEAR_CORRECTION_FACTOR,
    crackedStiffnessFactor,
  });
  const stiffness = stiffnessResult.totalStiffness;
  const yieldDisplacement = governingForce / stiffness;

  if (yieldDisplacement >= ultimateDisplacement) {
    warnings.push(
      `Pier ${pier.id} was skipped because its elastic yield displacement is not below the normative ultimate displacement; no artificial stiffness correction was introduced.`,
    );
    return null;
  }

  const curvePoints = [
    {
      id: `${pier.id}-origin`,
      displacement: 0,
      baseShear: 0,
    },
    {
      id: `${pier.id}-yield`,
      displacement: yieldDisplacement,
      baseShear: governingForce,
    },
    {
      id: `${pier.id}-ultimate`,
      displacement: ultimateDisplacement,
      baseShear: governingForce,
    },
    {
      id: `${pier.id}-failure`,
      displacement: postFailureDisplacement(ultimateDisplacement),
      baseShear: 0,
    },
  ];

  return {
    id: pier.id,
    contributorType: "pier",
    wallId: pier.wallId,
    topRotation,
    curvePoints,
    stiffness,
    yieldDisplacement,
    ultimateDisplacement,
    peakBaseShear: governingForce,
    governingFamily,
    governingMode,
    axialForces: {
      base: baseAxialForce,
      midHeight: midHeightAxialForce,
    },
    mechanics: {
      flexural: {
        V: flexural.capacity,
        MRd: flexural.available ? flexural.momentCapacity : undefined,
        compressionRatio: flexural.available ? flexural.compressionRatio : undefined,
      },
      bedJointSliding: {
        V: bedJointSliding.capacity,
        compressedLength: bedJointSliding.available ? bedJointSliding.compressedLength : undefined,
        eccentricity: bedJointSliding.available ? bedJointSliding.eccentricity : undefined,
        shearStrengthLimit: bedJointSliding.available
          ? bedJointSliding.shearStrengthLimit
          : undefined,
        governingLimit: bedJointSliding.available ? bedJointSliding.governingLimit : undefined,
      },
      diagonalCracking: {
        V: diagonalCracking.capacity,
        aspectFactor: diagonalCracking.available ? diagonalCracking.aspectFactor : undefined,
        model: diagonalCracking.mechanism,
      },
      confidenceFactor,
      stiffness: { ...stiffnessResult },
    },
    driftCapacity,
  };
}

function resolveRingFrameCount(ringFrame: RingFrameInput = {}): number {
  const candidates = [
    ringFrame?.frameCount,
    ringFrame?.parallelFrameCount,
    ringFrame?.framesInThickness,
    ringFrame?.parallelFrames,
    ringFrame?.count,
  ];

  return Math.max(1, Math.round(candidates.filter(isFiniteNumber).find((value) => value > 0) ?? 1));
}

function resolveRingFrameSections(
  ringFrame: RingFrameInput = {},
): SteelRingFrameMemberSectionsInput | null {
  if (ringFrame.memberSections) {
    return ringFrame.memberSections;
  }

  const defaultProfile =
    ringFrame.profileName ??
    ringFrame.profile ??
    ringFrame.sectionProfileName ??
    ringFrame.columnProfileName ??
    ringFrame.topBeamProfileName ??
    null;
  const columns =
    ringFrame.columns ?? ringFrame.column ?? ringFrame.columnProfileName ?? defaultProfile;
  const topBeam =
    ringFrame.topBeam ?? ringFrame.architrave ?? ringFrame.topBeamProfileName ?? defaultProfile;
  const bottomBeam =
    ringFrame.bottomBeam ?? ringFrame.bottomChord ?? ringFrame.bottomBeamProfileName ?? topBeam;

  if (!columns || !topBeam) {
    return null;
  }

  return {
    leftColumn: ringFrame.leftColumn ?? columns,
    rightColumn: ringFrame.rightColumn ?? columns,
    topBeam,
    bottomBeam,
  };
}

function resolveRingFrameMemberOrientations(
  ringFrame: RingFrameInput = {},
): SteelRingFrameMemberOrientationsInput {
  const orientations =
    ringFrame.memberOrientations ??
    ringFrame.memberOrientation ??
    ringFrame.sectionOrientations ??
    ringFrame.sectionOrientation ??
    ringFrame.orientations ??
    ringFrame.orientation ??
    {};

  if (typeof orientations === "string") {
    return { columns: orientations, topBeam: orientations, bottomBeam: orientations };
  }

  const resolvedOrientations = isMemberOrientations(orientations) ? orientations : undefined;

  return {
    ...resolvedOrientations,
    columns:
      resolvedOrientations?.columns ??
      resolvedOrientations?.column ??
      ringFrame.columnOrientation ??
      ringFrame.columnsOrientation,
    leftColumn:
      resolvedOrientations?.leftColumn ??
      orientationInput(resolvedOrientations?.leftPier) ??
      ringFrame.leftColumnOrientation,
    rightColumn:
      resolvedOrientations?.rightColumn ??
      orientationInput(resolvedOrientations?.rightPier) ??
      ringFrame.rightColumnOrientation,
    topBeam:
      resolvedOrientations?.topBeam ??
      resolvedOrientations?.architrave ??
      ringFrame.topBeamOrientation ??
      ringFrame.architraveOrientation,
    bottomBeam:
      resolvedOrientations?.bottomBeam ??
      resolvedOrientations?.bottomChord ??
      ringFrame.bottomBeamOrientation ??
      ringFrame.bottomChordOrientation,
  };
}

function buildRingFrameContribution({
  alignment,
  opening,
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  opening: SanitizedAlignmentOpening;
  warnings: string[];
}): RingFrameContribution | null {
  const ringFrame = asRingFrame(opening.ringFrame);

  if (!ringFrame) {
    return null;
  }

  const memberSections = resolveRingFrameSections(ringFrame);

  if (!memberSections) {
    warnings.push(
      `Opening ${opening.id} has a ringFrame definition but no member sections/profile names, so the steel pushover contribution was skipped.`,
    );
    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: RESULT_STATUS.NOT_ANALYZED,
      frameCount: resolveRingFrameCount(ringFrame),
      curvePoints: [],
      analysisWarnings: [],
    };
  }

  const frameCount = resolveRingFrameCount(ringFrame);
  const maxControlDisplacement = Math.max(
    ringFrame.solver?.maxControlDisplacement ??
      ringFrame.solver?.maxDisplacement ??
      ringFrame.maxControlDisplacement ??
      DEFAULT_RING_FRAME_MAX_DISPLACEMENT,
    DEFAULT_RING_FRAME_MAX_DISPLACEMENT,
  );
  const controlDisplacementIncrement =
    ringFrame.solver?.controlDisplacementIncrement ??
    ringFrame.solver?.controlIncrement ??
    ringFrame.controlDisplacementIncrement ??
    ringFrame.controlIncrement ??
    maxControlDisplacement * DEFAULT_RING_FRAME_CONTROL_INCREMENT_RATIO;
  const toSteelUnits = createUnitResolver(alignment.units, STEEL_RING_FRAME_USER_UNITS);
  const fromSteelUnits = createUnitResolver(STEEL_RING_FRAME_USER_UNITS, alignment.units);

  try {
    const result = new SteelRingFramePushoverAnalysis().analyze({
      model: {
        id: `${alignment.id}-ring-frame-${opening.id}`,
        units: STEEL_RING_FRAME_USER_UNITS,
        geometry: {
          width: toSteelUnits.length(opening.width),
          height: toSteelUnits.length(opening.height),
        },
        memberSections,
        memberOrientations: resolveRingFrameMemberOrientations(ringFrame),
        material: ringFrame.material ?? ringFrame.materialGrade ?? ringFrame.grade ?? "S275",
        baseCondition:
          ringFrame.baseCondition ??
          (ringFrame.includeBottomBeam ? "pinned-base-with-bottom-beam" : "fixed-base"),
        ...(ringFrame.includeBottomBeam === undefined
          ? {}
          : { includeBottomBeam: ringFrame.includeBottomBeam }),
        loading: {
          controlNode: ringFrame.controlNode ?? "top-left",
          referenceHorizontalForce: toSteelUnits.force(
            ringFrame.referenceHorizontalForce ?? ringFrame.horizontalForce ?? ringFrame.Fh ?? 1000,
          ),
        },
        solver: {
          controlDisplacementIncrement: toSteelUnits.length(controlDisplacementIncrement),
          maxControlDisplacement: toSteelUnits.length(maxControlDisplacement),
          tolerance: ringFrame.solver?.tolerance ?? 1e-6,
          maxIterations: ringFrame.solver?.maxIterations ?? DEFAULT_RING_FRAME_MAX_ITERATIONS,
          maxSteps: ringFrame.solver?.maxSteps ?? DEFAULT_RING_FRAME_MAX_STEPS,
          yieldTolerance: ringFrame.solver?.yieldTolerance ?? 1e-9,
        },
      },
    });
    const curvePoints = result.outputs.capacityCurve.points.map((point, index) => {
      const normalizedPoint = normalizeCurvePoint(point, index);

      return {
        id: `${alignment.id}-ring-frame-${opening.id}-point-${index + 1}`,
        displacement: fromSteelUnits.length(normalizedPoint.displacement) ?? 0,
        baseShear:
          (isFiniteNumber(normalizedPoint.baseShear)
            ? fromSteelUnits.force(normalizedPoint.baseShear)
            : 0) * frameCount,
      };
    });

    if (frameCount > 1) {
      warnings.push(
        `Opening ${opening.id} scales the steel ring-frame contribution by ${frameCount} because multiple identical parallel frames were declared through the ringFrame count.`,
      );
    }

    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: result.status,
      frameCount,
      curvePoints,
      maxBaseShear: maxFinite(curvePoints.map((point) => point.baseShear)) ?? 0,
      ultimateDisplacement: curvePoints.at(-1)?.displacement ?? 0,
      analysisWarnings: result.warnings,
      assumptions: result.assumptions,
      metadata: {
        analysisType: result.metadata?.analysisType ?? "steel-ring-frame-pushover",
        baseCondition: result.metadata?.baseCondition ?? null,
        includeBottomBeam: result.metadata?.includeBottomBeam ?? null,
        memberOrientations:
          result.metadata?.memberOrientations ??
          result.outputs?.frameIdealization?.metadata?.memberOrientations ??
          null,
      },
    };
  } catch (error) {
    const message = errorMessage(error);
    warnings.push(
      `Opening ${opening.id} could not build the steel ring-frame pushover contribution: ${message}`,
    );

    return {
      id: `${alignment.id}-ring-frame-${opening.id}`,
      contributorType: "ring-frame",
      openingId: opening.id,
      status: RESULT_STATUS.NOT_ANALYZED,
      frameCount,
      curvePoints: [],
      analysisWarnings: [message],
      assumptions: [],
      metadata: {},
    };
  }
}

function buildAggregateCapacityCurve(contributors: readonly Contributor[] = []): CurvePoint[] {
  const displacements = [
    ...new Set(
      contributors.flatMap((contributor) =>
        contributor.curvePoints.map((point) => point.displacement),
      ),
    ),
  ]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);

  return displacements.map((displacement, index) => ({
    id: `global-point-${index + 1}`,
    displacement,
    baseShear: contributors.reduce(
      (sum, contributor) => sum + interpolateCurve(contributor.curvePoints, displacement),
      0,
    ),
  }));
}

export class AlignmentSeismicAggregatedAnalysis {
  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    staticResult = null,
    resolvedAlignmentState = null,
  }: AlignmentSeismicAggregatedAnalysisInput = {}): AlignmentSeismicAggregatedAnalysisResult {
    if (!alignment) {
      throw new Error("AlignmentSeismicAggregatedAnalysis requires an alignment model.");
    }

    const warnings: string[] = [];
    const assumptions: string[] = [
      "The global capacity curve is the sum of the individual pier and ring-frame contributions at a common top-displacement axis.",
      "Pier axial forces are taken from the static vertical analysis in seismic combination: base reaction for flexural capacity and drift, mid-height compression for shear capacity.",
      "Each masonry pier uses the common NTC 2018 / Circular 2019 elastic-perfectly-plastic envelope, with 50% cracked flexural and shear stiffness and no force/displacement fallback.",
    ];
    const topRotation = normalizeTopRotation(options.topRotation ?? DEFAULT_TOP_ROTATION);
    const crackedStiffnessFactor =
      options.crackedStiffnessFactor == null ? 0.5 : Number(options.crackedStiffnessFactor);
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;
    const includeSpandrels = Boolean(options.includeSpandrels);

    if (includeSpandrels) {
      warnings.push(
        "Explicit spandrel contributions are not yet modeled in the aggregated seismic analysis; the first release still uses the selected topRotation boundary condition on piers.",
      );
    }

    const resolvedSanitizedOpenings =
      sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted = extractEquivalentFrameMembers({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const seismicStaticResult =
      staticResult ??
      new AlignmentStaticAnalysis().analyze({
        alignment: resolvedAlignment,
        stage,
        options: {
          ...(options.staticOptions ?? {}),
          combinationType: options.verticalCombinationType ?? "SEISMIC",
        },
        sanitizedOpenings: resolvedSanitizedOpenings,
        extractedMembers: extracted,
        resolvedAlignmentState: mechanicalState,
      });
    const staticPiersById = Object.fromEntries(
      (seismicStaticResult.outputs?.piers ?? []).map((pier) => [pier.id, pier]),
    );
    const pierContributions = extracted.piers
      .map((pier) =>
        buildPierContribution({
          alignment: resolvedAlignment,
          pier,
          staticPier: staticPiersById[pier.id],
          topRotation,
          crackedStiffnessFactor,
          warnings,
        }),
      )
      .filter(notNull);
    const ringFrameContributions = resolvedSanitizedOpenings
      .filter((opening) => opening.ringFrame)
      .map((opening) =>
        buildRingFrameContribution({
          alignment: resolvedAlignment,
          opening,
          warnings,
        }),
      )
      .filter(notNull);
    const activeContributors = [
      ...pierContributions,
      ...ringFrameContributions.filter((contributor) => contributor.curvePoints.length > 1),
    ];

    if (activeContributors.length === 0) {
      return new CalculationResult({
        applicationId: "masonry-wall-openings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary:
          "Aggregated seismic analysis could not build any active masonry-pier or steel-ring-frame contribution.",
        outputs: {
          stage,
          topRotation,
          includeSpandrels,
          capacityCurve: {
            units: {
              displacement: resolvedAlignment.units.length,
              baseShear: resolvedAlignment.units.force,
            },
            points: [],
            maxBaseShear: 0,
            ultimateDisplacement: 0,
          },
        },
        warnings: uniqueStrings([
          ...warnings,
          ...mechanicalState.warnings,
          ...(seismicStaticResult.warnings ?? []),
        ]),
        assumptions: uniqueStrings([
          ...assumptions,
          ...mechanicalState.assumptions,
          ...(seismicStaticResult.assumptions ?? []),
          ...extracted.assumptions,
        ]),
        metadata: {
          stage,
          topRotation,
          mechanicalState: mechanicalState.metadata,
          contributorCount: 0,
        },
      });
    }

    const capacityCurvePoints = buildAggregateCapacityCurve(activeContributors);
    const bilinearization = bilinearizeCapacityCurve({
      points: capacityCurvePoints,
      options:
        options.capacityDropRatio === undefined ? {} : { dropRatio: options.capacityDropRatio },
    });
    const maxBaseShear = maxFinite(capacityCurvePoints.map((point) => point.baseShear)) ?? 0;
    const status =
      bilinearization.status === RESULT_STATUS.OK ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED;

    return new CalculationResult({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Aggregated seismic capacity analysis of the masonry wall alignment completed by summing the individual pier contributions and the available steel ring-frame pushover curves.",
      outputs: {
        stage,
        topRotation,
        includeSpandrels,
        verticalCombinationType: seismicStaticResult.outputs?.combinationType ?? "SEISMIC",
        capacityCurve: {
          units: {
            displacement: resolvedAlignment.units.length,
            baseShear: resolvedAlignment.units.force,
          },
          points: roundCurvePoints(capacityCurvePoints),
          maxBaseShear: round(maxBaseShear),
          ultimateDisplacement: round(bilinearization.du),
        },
        bilinearization: {
          status: bilinearization.status,
          ks: round(bilinearization.ks),
          Vy: round(bilinearization.Vy),
          du: round(bilinearization.du),
          yieldDisplacement: round(bilinearization.yieldDisplacement),
          actualEnergy: round(bilinearization.actualEnergy),
          bilinearEnergy: round(bilinearization.bilinearEnergy),
          peakPoint: bilinearization.peakPoint
            ? {
                displacement: round(bilinearization.peakPoint.displacement),
                baseShear: round(bilinearization.peakPoint.baseShear),
              }
            : null,
          secantPoint: bilinearization.secantPoint
            ? {
                displacement: round(bilinearization.secantPoint.displacement),
                baseShear: round(bilinearization.secantPoint.baseShear),
              }
            : null,
          ultimatePoint: bilinearization.ultimatePoint
            ? {
                displacement: round(bilinearization.ultimatePoint.displacement),
                baseShear: round(bilinearization.ultimatePoint.baseShear),
              }
            : null,
        },
        piers: pierContributions.map((contributor) => ({
          id: contributor.id,
          wallId: contributor.wallId,
          topRotation: contributor.topRotation,
          stiffness: round(contributor.stiffness),
          yieldDisplacement: round(contributor.yieldDisplacement),
          ultimateDisplacement: round(contributor.ultimateDisplacement),
          peakBaseShear: round(contributor.peakBaseShear),
          governingFamily: contributor.governingFamily,
          governingMode: contributor.governingMode,
          driftCapacity: round(contributor.driftCapacity),
          axialForces: {
            base: round(contributor.axialForces.base),
            midHeight: round(contributor.axialForces.midHeight),
          },
          mechanics: {
            flexural: {
              V: round(contributor.mechanics.flexural.V),
              MRd: round(contributor.mechanics.flexural.MRd),
              compressionRatio: round(contributor.mechanics.flexural.compressionRatio),
            },
            bedJointSliding: {
              V: round(contributor.mechanics.bedJointSliding.V),
              compressedLength: round(contributor.mechanics.bedJointSliding.compressedLength),
              eccentricity: round(contributor.mechanics.bedJointSliding.eccentricity),
            },
            diagonalCracking: {
              V: round(contributor.mechanics.diagonalCracking.V),
              aspectFactor: round(contributor.mechanics.diagonalCracking.aspectFactor),
            },
          },
          curvePoints: roundCurvePoints(contributor.curvePoints),
        })),
        ringFrames: ringFrameContributions.map((contributor) => ({
          id: contributor.id,
          openingId: contributor.openingId,
          status: contributor.status,
          frameCount: contributor.frameCount,
          maxBaseShear: round(contributor.maxBaseShear),
          ultimateDisplacement: round(contributor.ultimateDisplacement),
          metadata: contributor.metadata,
          curvePoints: roundCurvePoints(contributor.curvePoints),
        })),
        staticReference: {
          combinationType: seismicStaticResult.outputs?.combinationType ?? "SEISMIC",
          piers: (seismicStaticResult.outputs?.piers ?? []).map((pier) => ({
            id: pier.id,
            axialForce: round(pier.axialForce),
            selfWeight: round(pier.selfWeight),
            baseReaction: round(pier.baseReaction),
          })),
        },
      },
      warnings: uniqueStrings([
        ...warnings,
        ...mechanicalState.warnings,
        ...(seismicStaticResult.warnings ?? []),
        ...ringFrameContributions.flatMap((contributor) => contributor.analysisWarnings ?? []),
        ...bilinearization.warnings,
      ]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...mechanicalState.assumptions,
        ...(seismicStaticResult.assumptions ?? []),
        ...extracted.assumptions,
        ...ringFrameContributions.flatMap((contributor) => contributor.assumptions ?? []),
      ]),
      metadata: {
        stage,
        topRotation,
        mechanicalState: mechanicalState.metadata,
        contributorCount: activeContributors.length,
        pierCount: pierContributions.length,
        ringFrameCount: ringFrameContributions.filter(
          (contributor) => contributor.curvePoints.length > 1,
        ).length,
        spandrelCount: extracted.spandrels.length,
        capacityPointCount: capacityCurvePoints.length,
      },
    });
  }
}
