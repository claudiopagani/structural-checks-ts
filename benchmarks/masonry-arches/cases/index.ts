/**
 * Implemented masonry-arches benchmark cases.
 *
 * Every case builds a library model from the provenance-bearing source records, runs the public
 * solver API, and declares comparisons with pre-fixed tolerances and discrepancy classifications.
 * The suite proves the solver: no solver parameter is calibrated on benchmark data here, and any
 * fitted value taken from the companion numerical papers is explicitly marked as a CALIBRATION
 * input with the resulting case counted as non-independent for that parameter.
 */

import {
  analyzeMasonryArchLimit,
  analyzeMasonryArchPath,
  analyzeMasonryArchVerification,
  createMasonryArch,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryArchLoadInput,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";
import type {
  BenchmarkComparison,
  ConvergenceStudyRow,
  ArcLengthRobustnessRow,
} from "../benchmarkRunner.ts";
import { readProvenancedValue } from "../benchmarkRunner.ts";
import { independentFourHingeLimitMultiplier } from "./independentMechanism.ts";

// ------------------------------------------------------------------------------------------------
// Model building helpers
// ------------------------------------------------------------------------------------------------

export function rigidLaw(
  friction: "frictionless" | number,
  compressiveStrength: number | null = null,
): MasonryInterfaceLawInput {
  return {
    response: "rigid-plastic",
    normal:
      compressiveStrength === null
        ? { type: "no-tension" }
        : { type: "no-tension", compressiveStrength, compressionFacetCount: 8 },
    tangential:
      friction === "frictionless"
        ? { type: "frictionless" }
        : { type: "coulomb", frictionCoefficient: friction },
  };
}

export interface ArchSpec {
  readonly id: string;
  readonly span: number;
  readonly rise: number;
  readonly thickness: number;
  readonly width: number;
  readonly voussoirCount: number;
  /** Masonry unit weight in kN/m3; the literature usually does not report it. */
  readonly unitWeight: number;
  /** Horizontal distance of the point load from the left springing, in m. */
  readonly loadX: number | null;
  /** Which curve the span/rise refer to, as published for the specimen. */
  readonly referenceCurve?: "centerline" | "intrados" | "extrados";
  readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
  readonly reinforcements?: readonly ArchReinforcementInput[];
  readonly interfaceLaw?: MasonryInterfaceLawInput;
}

export interface BuiltArch {
  readonly model: MasonryArchModel;
  readonly loadedBlockIndex: number | null;
}

/** Finds the block whose centroid is horizontally closest to x (used to pin the point load). */
function loadedBlockForX(
  model: MasonryArchModel,
  x: number,
): { readonly id: string; readonly index: number } {
  let best = model.geometry.voussoirs[0]!;
  let bestIndex = 0;
  model.geometry.voussoirs.forEach((block, index) => {
    if (Math.abs(block.centroid.x - x) < Math.abs(best.centroid.x - x)) {
      best = block;
      bestIndex = index;
    }
  });
  return { id: best.id, index: bestIndex };
}

export function buildArch(spec: ArchSpec): BuiltArch {
  const geometry = {
    kind: "simplified-symmetric",
    referenceCurve: spec.referenceCurve ?? "centerline",
    profile: { type: "circular" },
    span: spec.span,
    rise: spec.rise,
    thickness: spec.thickness,
    outOfPlaneWidth: spec.width,
    voussoirCount: spec.voussoirCount,
  } as const;
  const provisional = createMasonryArch({
    id: spec.id,
    units: { force: "kN", length: "m" },
    geometry,
    masonry: { unitWeight: spec.unitWeight },
    interfaceLaw: spec.interfaceLaw ?? rigidLaw("frictionless"),
    loads: [],
    reinforcements: spec.reinforcements ?? [],
    bondedLayers: spec.bondedLayers ?? [],
  });
  let loadedBlockIndex: number | null = null;
  const loads: MasonryArchLoadInput[] = [{ id: "SW", type: "self-weight", loadCaseId: "G" }];
  if (spec.loadX !== null) {
    // Model coordinates place x = 0 at mid-span; `loadX` is measured from the left springing.
    const loaded = loadedBlockForX(provisional, spec.loadX - spec.span / 2);
    loadedBlockIndex = loaded.index;
    const loadedBlock = provisional.geometry.voussoirs[loaded.index]!;
    loads.push({
      id: "Q",
      type: "point",
      loadCaseId: "Q",
      station:
        (loadedBlock.startStation + loadedBlock.endStation) /
        2 /
        provisional.geometry.totalReferenceArcLength,
      targetVoussoirId: loaded.id,
      force: { x: 0, y: -1 },
    });
  }
  const model = createMasonryArch({
    id: spec.id,
    units: { force: "kN", length: "m" },
    geometry,
    masonry: { unitWeight: spec.unitWeight },
    interfaceLaw: spec.interfaceLaw ?? rigidLaw("frictionless"),
    loads,
    reinforcements: spec.reinforcements ?? [],
    bondedLayers: spec.bondedLayers ?? [],
  });
  return { model, loadedBlockIndex };
}

export interface LimitRun {
  readonly lambdaFirstLimit: number | null;
  readonly failureMode: string | null;
  readonly hingeCount: number;
  readonly hinges: readonly { readonly interfaceId: string; readonly side: string }[];
  readonly slidingCount: number;
  readonly crushingCount: number;
  readonly bondedAtCapacity: boolean;
  readonly independentLambda: number | null;
  readonly independentHinges: readonly { readonly interfaceIndex: number; readonly side: string }[];
  readonly notes: string;
}

/**
 * Runs the library limit analysis and (optionally) the independent mechanism cross-check. The
 * independent four-hinge enumeration is quadratic in the hinge combinations and is therefore
 * requested only for the software-correctness anchor cases with moderate voussoir counts.
 */
export function runLimitAnalysis(
  model: MasonryArchModel,
  loadedBlockIndex: number | null,
  options: { readonly independentCheck?: boolean } = {},
): LimitRun {
  const result = analyzeMasonryArchLimit(model, {
    scalableLoadCaseIds: ["Q"],
    equilibriumTolerance: 1e-9,
    simplexTolerance: 1e-10,
    maxSimplexIterations: 200_000,
  });
  const outputs = result.outputs;
  const lambdaFirstLimit = outputs.capacity.lambdaFirstLimit;
  const independent =
    options.independentCheck !== true || loadedBlockIndex === null
      ? null
      : independentFourHingeLimitMultiplier({
          blocks: model.geometry.voussoirs.map((block) => ({
            centroid: { x: block.centroid.x, y: block.centroid.y },
          })),
          interfaces: model.geometry.interfaces.map((item) => ({
            intrados: { x: item.intradosPoint.x, y: item.intradosPoint.y },
            extrados: { x: item.extradosPoint.x, y: item.extradosPoint.y },
            outwardNormal: {
              x: -item.chainTangent.y / (Math.hypot(item.chainTangent.x, item.chainTangent.y) || 1),
              y: item.chainTangent.x / (Math.hypot(item.chainTangent.x, item.chainTangent.y) || 1),
            },
          })),
          fixedWrenches: outputs.loads.fixedBlockWrenches.map((wrench) => ({
            fx: wrench.force.x,
            fy: wrench.force.y,
            m: wrench.moment,
          })),
          scalableWrenches: outputs.loads.scalableBlockWrenchesAtUnitLambda.map((wrench) => ({
            fx: wrench.force.x,
            fy: wrench.force.y,
            m: wrench.moment,
          })),
        });
  return {
    lambdaFirstLimit,
    failureMode: outputs.failureMode,
    hingeCount: outputs.hinges.length,
    hinges: outputs.hinges.map((hinge) => ({ interfaceId: hinge.interfaceId, side: hinge.side })),
    slidingCount: outputs.slidingInterfaces.length,
    crushingCount: outputs.crushingInterfaces.length,
    bondedAtCapacity:
      outputs.bondedLayerState?.some((layer) =>
        layer.interfaces.some(
          (item) => item.utilizationRatio !== null && item.utilizationRatio >= 1 - 1e-9,
        ),
      ) ?? false,
    independentLambda: independent?.lambda ?? null,
    independentHinges:
      independent?.hinges.map((hinge) => ({
        interfaceIndex: hinge.interfaceIndex,
        side: hinge.side,
      })) ?? [],
    notes: independent === null ? "independent mechanism reference not applicable" : "",
  };
}

// ------------------------------------------------------------------------------------------------
// Case definitions
// ------------------------------------------------------------------------------------------------

export interface CaseComparisonSpec {
  readonly caseId: string;
  readonly sourceId: string;
  readonly specimenId: string;
  readonly tier: "A" | "B" | "C";
  readonly family: BenchmarkComparison["family"];
  readonly observable: string;
  readonly referencePath: string;
  readonly predictedValue: number | null;
  readonly acceptanceTolerance: number | null;
  readonly mechanismAgreement: BenchmarkComparison["mechanismAgreement"];
  readonly discrepancyClassification: BenchmarkComparison["discrepancyClassification"];
  readonly notes: string;
}

export interface ExecutedCase {
  readonly spec: CaseComparisonSpec;
  readonly comparison: BenchmarkComparison;
}

/** Converts a solver prediction expressed in kN into the reference's unit when needed. */
function convertPrediction(predicted: number | null, referenceUnit: string | null): number | null {
  if (predicted === null) return null;
  if (referenceUnit === "N") return 1000 * predicted;
  return predicted;
}

export async function executeCase(spec: CaseComparisonSpec): Promise<BenchmarkComparison> {
  const reference = await readProvenancedValue(spec.sourceId, spec.specimenId, spec.referencePath);
  const predictedValue = convertPrediction(spec.predictedValue, reference.unit);
  const relativeError =
    reference.value === null || predictedValue === null
      ? null
      : (predictedValue - reference.value) / reference.value;
  const quantitativeStatus: BenchmarkComparison["quantitativeStatus"] =
    reference.value === null || predictedValue === null
      ? "indeterminate"
      : spec.acceptanceTolerance === null
        ? "qualitative-only"
        : Math.abs(relativeError!) <= spec.acceptanceTolerance
          ? "within-tolerance"
          : "outside-tolerance";
  return {
    caseId: spec.caseId,
    sourceId: spec.sourceId,
    specimenId: spec.specimenId,
    tier: spec.tier,
    family: spec.family,
    observable: spec.observable,
    referenceValue: reference.value,
    predictedValue,
    units: reference.unit,
    relativeError,
    acceptanceTolerance: spec.acceptanceTolerance,
    quantitativeStatus,
    mechanismAgreement: spec.mechanismAgreement,
    discrepancyClassification: spec.discrepancyClassification,
    provenance: {
      kind: reference.kind,
      location: reference.location,
      unit: reference.unit,
      notes: reference.notes ?? null,
    },
    notes: spec.notes,
  };
}

// ------------------------------------------------------------------------------------------------
// URM cases (Oliveira, Carozzi, Borri, Prestwood) and numerical companions (Bertolesi)
// ------------------------------------------------------------------------------------------------

export function carozziArchSpec(
  id: string,
  overrides: Partial<
    Pick<ArchSpec, "thickness" | "width" | "unitWeight" | "bondedLayers" | "interfaceLaw">
  > = {},
): ArchSpec {
  return {
    id,
    span: 3.3,
    rise: 0.83,
    thickness: overrides.thickness ?? 0.12,
    width: overrides.width ?? 0.25,
    // Discretization chosen from the convergence study (N=61 vs N=121 differ by <0.5% in the
    // NTM collapse multiplier), not tuned to any benchmark value.
    voussoirCount: 61,
    unitWeight: overrides.unitWeight ?? 18,
    loadX: 0.556,
    ...(overrides.bondedLayers === undefined ? {} : { bondedLayers: overrides.bondedLayers }),
    ...(overrides.interfaceLaw === undefined ? {} : { interfaceLaw: overrides.interfaceLaw }),
  };
}

export function oliveiraArchSpec(
  id: string,
  overrides: Partial<Pick<ArchSpec, "unitWeight" | "bondedLayers" | "interfaceLaw">> = {},
): ArchSpec {
  return {
    id,
    span: 1.467,
    rise: 0.593,
    thickness: 0.05,
    width: 0.45,
    voussoirCount: 59,
    unitWeight: overrides.unitWeight ?? 18,
    loadX: 1.467 / 4,
    // Oliveira et al. 2010 report the effective INTERNAL span and rise; the model derives the
    // centerline from the intrados reference curve.
    referenceCurve: "intrados",
    ...(overrides.bondedLayers === undefined ? {} : { bondedLayers: overrides.bondedLayers }),
    ...(overrides.interfaceLaw === undefined ? {} : { interfaceLaw: overrides.interfaceLaw }),
  };
}

export function borriArchSpec(id: string): ArchSpec {
  return {
    id,
    span: 2.0,
    rise: 1.0,
    thickness: 0.125,
    width: 0.25,
    voussoirCount: 13,
    unitWeight: (1807 * 9.81) / 1000,
    loadX: 1.0,
  };
}

export function prestwoodArchSpec(id: string): ArchSpec {
  return {
    id,
    span: 6.55,
    rise: 1.428,
    thickness: 0.22,
    width: 3.8,
    voussoirCount: 31,
    unitWeight: (1800 * 9.81) / 1000,
    // The in-situ test loaded a 300 mm long patch over the full width at quarter span; the
    // runner models it as a unit point load at quarter span and records the simplification.
    loadX: 6.55 / 4,
  };
}

export function gfrpExtradosLayers(
  widthMm: number,
  count: number,
  strength: number,
  modulus: number,
): readonly BondedLayerReinforcementInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `GFRP-${index + 1}`,
    family: "frp",
    side: "extrados",
    area: (widthMm * 0.149) / 1e6,
    elasticModulus: modulus * 1000,
    tensileStrength: strength * 1000,
    transferLength: 0.1,
    startStation: 0,
    endStation: 1,
    terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
  }));
}

export function gfrpIntradosLayers(
  widthMm: number,
  count: number,
  strength: number,
  modulus: number,
): readonly BondedLayerReinforcementInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `GFRP-${index + 1}`,
    family: "frp",
    side: "intrados",
    area: (widthMm * 0.149) / 1e6,
    elasticModulus: modulus * 1000,
    tensileStrength: strength * 1000,
    transferLength: 0.1,
    startStation: 0,
    endStation: 1,
    terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
  }));
}

// ------------------------------------------------------------------------------------------------
// Convergence and arc-length studies
// ------------------------------------------------------------------------------------------------

export function runConvergenceStudy(): readonly ConvergenceStudyRow[] {
  const rows: ConvergenceStudyRow[] = [];
  let previous: number | null = null;
  for (const voussoirCount of [15, 31, 61, 121]) {
    const spec = carozziArchSpec("carozzi-U_A-convergence");
    const built = buildArch({ ...spec, voussoirCount });
    const run = runLimitAnalysis(built.model, built.loadedBlockIndex);
    const predicted = run.lambdaFirstLimit;
    rows.push({
      caseId: "convergence/voussoir-count-carozzi-U_A",
      parameter: "voussoirCount",
      value: voussoirCount,
      observable: "limit multiplier lambda (unit Q = 1 kN)",
      predictedValue: predicted,
      relativeChangeVsPrevious:
        previous === null || predicted === null ? null : (predicted - previous) / previous,
      notes:
        run.lambdaFirstLimit === null
          ? "limit analysis did not determine a collapse multiplier"
          : `hinges=${run.hingeCount}`,
    });
    previous = predicted;
  }
  return rows;
}

export function runIntegrationPointStudy(): readonly ConvergenceStudyRow[] {
  const rows: ConvergenceStudyRow[] = [];
  let previous: number | null = null;
  for (const integrationPointCount of [4, 8, 16]) {
    const deformable = {
      response: "deformable",
      normal: {
        type: "elastic-no-tension",
        elasticModulus: 320_000,
        characteristicLength: 0.5,
        integrationPointCount,
        compressiveStrength: 3500,
        postCrushingBehavior: "stop-at-onset",
      },
      tangential: {
        type: "elastic-coulomb",
        shearModulus: 120_000,
        characteristicLength: 0.5,
        frictionCoefficient: 0.5,
        cohesion: 0,
        flowRule: { type: "non-associated", dilationAngle: 0 },
      },
    } as const;
    const built = buildArch(
      carozziArchSpec(`carozzi-2018/SRG_A-deformable-study-${integrationPointCount}`, {
        interfaceLaw: deformable,
        bondedLayers: [
          {
            id: "SRG",
            family: "sfrm",
            side: "extrados",
            area: 25.5e-6,
            elasticModulus: 152.91e6,
            tensileStrength: 1276e3,
            transferLength: 0.2,
            startStation: 0,
            endStation: 1,
            terminations: { left: { type: "anchored" }, right: { type: "anchored" } },
          },
        ],
      }),
    );
    const result = analyzeMasonryArchPath(built.model, {
      units: { force: "kN", length: "m" },
      analysisObjective: "capacity",
      scalableLoadCaseIds: ["Q"],
      equilibriumTolerance: 1e-7,
      maxIterations: 60,
      maxSteps: 300,
    });
    const predicted = result.outputs.capacity.lambdaPeak;
    rows.push({
      caseId: "convergence/integration-points-carozzi-SRG_A",
      parameter: "interface integrationPointCount",
      value: integrationPointCount,
      observable: "capacity lambdaPeak (deformable path)",
      predictedValue: predicted,
      relativeChangeVsPrevious:
        previous === null || predicted === null ? null : (predicted - previous) / previous,
      notes: `termination=${result.outputs.convergenceInfo.termination}; status=${result.status}`,
    });
    previous = predicted;
  }
  return rows;
}

export function runArcLengthRobustnessStudy(): readonly ArcLengthRobustnessRow[] {
  const rows: ArcLengthRobustnessRow[] = [];
  for (const [initialRadius, maximumRadius] of [
    [0.02, 0.1],
    [0.05, 0.2],
    [0.1, 0.4],
    [0.2, 0.8],
  ] as const) {
    const model = createMasonryArch({
      id: "arc-length-robustness",
      units: { force: "kN", length: "m" },
      geometry: {
        kind: "simplified-symmetric",
        referenceCurve: "centerline",
        profile: { type: "circular" },
        span: 10,
        rise: 5,
        thickness: 1,
        outOfPlaneWidth: 1,
        voussoirCount: 9,
      },
      masonry: { unitWeight: 20 },
      interfaceLaw: {
        response: "deformable",
        normal: {
          type: "elastic-no-tension",
          elasticModulus: 1_000_000,
          characteristicLength: 0.5,
          integrationPointCount: 8,
        },
        tangential: {
          type: "elastic-coulomb",
          shearModulus: 400_000,
          characteristicLength: 0.5,
          frictionCoefficient: 0.4,
          cohesion: 0,
          flowRule: { type: "non-associated", dilationAngle: 0 },
        },
      },
      loads: [
        { id: "SW", type: "self-weight", loadCaseId: "G" },
        {
          id: "Q",
          type: "point",
          loadCaseId: "Q",
          station: 0.5,
          targetVoussoirId: "V-004",
          force: { x: 0, y: 200 },
        },
      ],
      reinforcements: [
        {
          id: "P",
          side: "intrados",
          area: 0.001,
          elasticModulus: 200_000_000,
          initialForce: 0,
          interaction: { type: "rigid-deviators", count: 3 },
          terminations: {
            left: { type: "distributed-anchorage", connectorCount: 1 },
            right: { type: "distributed-anchorage", connectorCount: 1 },
          },
        },
      ],
    });
    const result = analyzeMasonryArchVerification(model, {
      units: { force: "kN", length: "m" },
      scalableLoadCaseIds: ["Q"],
      equilibriumTolerance: 1e-7,
      maxIterations: 80,
      maxSteps: 400,
      control: {
        type: "arc-length",
        targetLambda: 1,
        targetPathLength: 10,
        initialRadius,
        maximumRadius,
      },
    });
    const diagnostics = result.outputs.diagnostics;
    rows.push({
      caseId: "arc-length/crown-uplift-passive-tendon",
      parameter: "initialRadius / maximumRadius",
      value: initialRadius,
      termination: result.outputs.subAnalyses.path!.outputs.convergenceInfo.termination,
      status: result.outputs.engineeringAssessment.status,
      lambdaVerificationLimit: result.outputs.lambdaVerificationLimit,
      verifiedLimitPoint: diagnostics.verifiedLimitPoint?.lambda ?? null,
      maximumObservedLambda: diagnostics.maximumObservedLambda,
      cutbacks: diagnostics.cutbacks,
      notes: `initialRadius=${initialRadius}, maximumRadius=${maximumRadius}`,
    });
  }
  return rows;
}
