// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

/**
 * Solver-neutral NTC 2018 regularity checks for buildings.
 */

import {
  NTC2018_ELEVATION_REGULARITY,
  NTC2018_PLAN_REGULARITY,
  NTC2018_REGULARITY_REDUCTION,
  selectNTC2018AllowedAnalysisMethods,
} from "./structuralBehavior.js";
import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_OUTSIDE_CORPUS_REFERENCES } from "../normativeReferences.js";
import type { Ntc2018BehaviorInput } from "./structuralBehavior.js";

type NumberLike = number | string;
type JsonRecord = Record<string, unknown>;

export interface Ntc2018FloorPlanInput extends JsonRecord {
  readonly storeyId?: string | undefined;
  readonly planLengthX?: NumberLike | undefined;
  readonly planLengthY?: NumberLike | undefined;
  readonly contourConvex?: boolean | undefined;
  readonly reentrantAreaRatios?: readonly NumberLike[] | undefined;
  readonly reentrantInfluenceNegligible?: boolean | undefined;
  readonly diaphragmInPlaneRigidityAdequate?: boolean | undefined;
  readonly diaphragmInPlaneStrengthAdequate?: boolean | undefined;
}

export interface Ntc2018PlanRegularityInput extends JsonRecord {
  readonly floors?: readonly Ntc2018FloorPlanInput[] | undefined;
  readonly storeyId?: string | undefined;
  readonly massAndStiffnessApproximatelySymmetric?: boolean | undefined;
  readonly planLengthX?: NumberLike | undefined;
  readonly planLengthY?: NumberLike | undefined;
  readonly contourConvex?: boolean | undefined;
  readonly reentrantAreaRatios?: readonly NumberLike[] | undefined;
  readonly reentrantInfluenceNegligible?: boolean | undefined;
  readonly diaphragmInPlaneRigidityAdequate?: boolean | undefined;
  readonly diaphragmInPlaneStrengthAdequate?: boolean | undefined;
}

export interface Ntc2018ElevationStoreyInput extends JsonRecord {
  readonly storeyId?: string;
  readonly mass?: NumberLike;
  readonly planLengthX?: NumberLike;
  readonly planLengthY?: NumberLike;
  readonly stiffnessX?: NumberLike;
  readonly stiffnessY?: NumberLike;
  readonly capacityDemandRatioX?: NumberLike;
  readonly capacityDemandRatioY?: NumberLike;
  readonly setbackX?: NumberLike;
  readonly setbackY?: NumberLike;
  readonly setbackFromFirstX?: NumberLike;
  readonly setbackFromFirstY?: NumberLike;
}

export interface Ntc2018ElevationRegularityInput extends JsonRecord {
  readonly storeys?: readonly Ntc2018ElevationStoreyInput[];
  readonly continuousVerticalSystems?: boolean;
  readonly stiffnessCriterionExempt?: boolean;
  readonly isFrameStructure?: boolean;
}

export interface Ntc2018RegularityAssessmentInput {
  readonly planInput: Ntc2018PlanRegularityInput;
  readonly elevationInput: Ntc2018ElevationRegularityInput;
  readonly behavior: Ntc2018BehaviorInput;
  readonly t1X?: NumberLike;
  readonly t1Y?: NumberLike;
  readonly tc?: NumberLike;
  readonly td?: NumberLike;
}

interface RegularityCheck extends JsonRecord {
  readonly check: string;
  readonly ok: boolean;
}

interface NormalizedElevationStorey extends JsonRecord {
  readonly storeyId: string;
  readonly mass: number;
  readonly planLengthX: number;
  readonly planLengthY: number;
  readonly stiffnessX: number | null;
  readonly stiffnessY: number | null;
  readonly capacityDemandRatioX: number | null;
  readonly capacityDemandRatioY: number | null;
}

interface PlanFloorDetail extends JsonRecord {
  readonly storeyId: string;
  readonly slenderness: number;
  readonly maximumReentrantAreaRatio: number;
  readonly checks: readonly RegularityCheck[];
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFloorPlanArray(value: unknown): value is readonly Ntc2018FloorPlanInput[] {
  return Array.isArray(value);
}

function isElevationStoreyArray(value: unknown): value is readonly Ntc2018ElevationStoreyInput[] {
  return Array.isArray(value);
}

const STRUCTURAL_REGULARITY_NORMATIVE_REFERENCES = Object.freeze([
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.structuralRegularity,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.structuralRegularityGuidance,
]);

export const NTC2018_REGULARITY_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.2.1 (regolarità in pianta e in altezza) e § 7.3.1 (fattore ηR)",
  }),
  Object.freeze({
    source: "Circolare 21 gennaio 2019, n. 7 C.S.LL.PP.",
    citation: "§ C7.2.1",
  }),
]);

function regularityMetadata(metadata: JsonRecord = {}): JsonRecord {
  return withNormativeReferences(metadata, [...STRUCTURAL_REGULARITY_NORMATIVE_REFERENCES]);
}

function regularityCheck(
  check: JsonRecord & { readonly check: string; readonly ok: boolean },
): RegularityCheck {
  return {
    ...check,
    metadata: regularityMetadata(isJsonRecord(check.metadata) ? check.metadata : {}),
  };
}

function positive(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be finite and positive; got ${String(value)}.`);
  }
  return number;
}

function ratio01(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`${label} must be between 0 and 1; got ${String(value)}.`);
  }
  return number;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be explicitly true or false.`);
  }
  return value;
}

function normalizeFloorPlans(input: Ntc2018PlanRegularityInput): readonly Ntc2018FloorPlanInput[] {
  if (isFloorPlanArray(input.floors) && input.floors.length > 0) {
    return input.floors;
  }
  if (input.planLengthX !== undefined || input.planLengthY !== undefined) {
    return [
      {
        storeyId: input.storeyId ?? "plan",
        planLengthX: input.planLengthX,
        planLengthY: input.planLengthY,
        contourConvex: input.contourConvex,
        reentrantAreaRatios: input.reentrantAreaRatios,
        reentrantInfluenceNegligible: input.reentrantInfluenceNegligible,
        diaphragmInPlaneRigidityAdequate: input.diaphragmInPlaneRigidityAdequate,
        diaphragmInPlaneStrengthAdequate: input.diaphragmInPlaneStrengthAdequate,
      },
    ];
  }
  throw new Error("At least one floor plan is required.");
}

/**
 * Evaluate every condition a), b) and c) of NTC 2018 § 7.2.1.
 *
 * Missing qualitative assessments are rejected rather than interpreted as
 * compliance.
 */
export function evaluateNTC2018PlanRegularity(input: Ntc2018PlanRegularityInput = {}) {
  const symmetry = requiredBoolean(
    input.massAndStiffnessApproximatelySymmetric,
    "massAndStiffnessApproximatelySymmetric",
  );
  const floors = normalizeFloorPlans(input);
  // @see https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
  const checks = [
    regularityCheck({
      check: "plan-mass-stiffness-symmetry",
      ok: symmetry,
      reference: "NTC 2018 § 7.2.1, lettera a)",
    }),
  ];
  const floorDetails: PlanFloorDetail[] = [];

  for (let index = 0; index < floors.length; index++) {
    const floor = floors[index];
    if (!floor) continue;
    const storeyId = floor.storeyId ?? `floor-${index + 1}`;
    const lengthX = positive(floor.planLengthX, `floors[${index}].planLengthX`);
    const lengthY = positive(floor.planLengthY, `floors[${index}].planLengthY`);
    const slenderness = Math.max(lengthX, lengthY) / Math.min(lengthX, lengthY);
    const slendernessOk = slenderness < 4;
    const contourConvex = requiredBoolean(floor.contourConvex, `floors[${index}].contourConvex`);

    let maximumReentrantAreaRatio = 0;
    let compactnessOk = contourConvex;
    if (!contourConvex) {
      if (!Array.isArray(floor.reentrantAreaRatios) || floor.reentrantAreaRatios.length === 0) {
        throw new Error(`floors[${index}].reentrantAreaRatios is required for a non-convex plan.`);
      }
      maximumReentrantAreaRatio = Math.max(
        ...floor.reentrantAreaRatios.map((value, reentrantIndex) =>
          ratio01(value, `floors[${index}].reentrantAreaRatios[${reentrantIndex}]`),
        ),
      );
      compactnessOk =
        maximumReentrantAreaRatio <= 0.05 &&
        requiredBoolean(
          floor.reentrantInfluenceNegligible,
          `floors[${index}].reentrantInfluenceNegligible`,
        );
    }

    const rigidityOk = requiredBoolean(
      floor.diaphragmInPlaneRigidityAdequate,
      `floors[${index}].diaphragmInPlaneRigidityAdequate`,
    );
    const strengthOk = requiredBoolean(
      floor.diaphragmInPlaneStrengthAdequate,
      `floors[${index}].diaphragmInPlaneStrengthAdequate`,
    );
    const floorChecks = [
      {
        check: "plan-compactness",
        storeyId,
        ok: compactnessOk,
        maximumReentrantAreaRatio,
        reference: "NTC 2018 § 7.2.1, lettera a)",
      },
      {
        check: "plan-bounding-rectangle-ratio",
        storeyId,
        ok: slendernessOk,
        value: slenderness,
        limit: 4,
        comparison: "<",
        reference: "NTC 2018 § 7.2.1, lettera b)",
      },
      {
        check: "plan-diaphragm-in-plane-rigidity",
        storeyId,
        ok: rigidityOk,
        reference: "NTC 2018 § 7.2.1, lettera c)",
      },
      {
        check: "plan-diaphragm-in-plane-strength",
        storeyId,
        ok: strengthOk,
        reference: "NTC 2018 § 7.2.1, lettera c)",
      },
    ].map(regularityCheck);
    checks.push(...floorChecks);
    floorDetails.push({
      storeyId,
      slenderness,
      maximumReentrantAreaRatio,
      checks: floorChecks,
    });
  }

  const allChecksOk = checks.every((check) => check.ok === true);
  const governingFloor = floorDetails.reduce<PlanFloorDetail | null>(
    (governing, floor) =>
      governing == null || floor.slenderness > governing.slenderness ? floor : governing,
    null,
  );

  return {
    regularity: allChecksOk ? NTC2018_PLAN_REGULARITY.REGULAR : NTC2018_PLAN_REGULARITY.NON_REGULAR,
    allChecksOk,
    checks,
    floors: floorDetails,
    slenderness: governingFloor?.slenderness ?? null,
    maximumReentrantAreaRatio: Math.max(
      ...floorDetails.map((floor) => floor.maximumReentrantAreaRatio),
    ),
    reentrantRatioX: null,
    reentrantRatioY: null,
    eccentricityRatioX: null,
    eccentricityRatioY: null,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}

function pairCheck({
  check,
  storeyId,
  comparedTo,
  value,
  minimum,
  maximum,
  reference,
}: {
  readonly check: string;
  readonly storeyId: string;
  readonly comparedTo: string;
  readonly value: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly reference: string;
}): RegularityCheck {
  return regularityCheck({
    check,
    storeyId,
    comparedTo,
    ok: value >= minimum && value <= maximum,
    value,
    minimum,
    maximum,
    reference,
  });
}

function positiveStoreyValue(
  storey: Ntc2018ElevationStoreyInput,
  key: keyof Ntc2018ElevationStoreyInput,
  index: number,
): number {
  return positive(storey[key], `storeys[${index}].${key}`);
}

/**
 * Evaluate conditions d), e), f) and g) of NTC 2018 § 7.2.1.
 */
export function evaluateNTC2018ElevationRegularity({
  storeys,
  continuousVerticalSystems,
  stiffnessCriterionExempt = false,
  isFrameStructure = false,
}: Ntc2018ElevationRegularityInput = {}) {
  if (!isElevationStoreyArray(storeys) || storeys.length < 2) {
    throw new Error("At least two storeys ordered from base to top are required.");
  }
  const continuousSystems = requiredBoolean(continuousVerticalSystems, "continuousVerticalSystems");
  const stiffnessExempt = requiredBoolean(stiffnessCriterionExempt, "stiffnessCriterionExempt");
  const frameStructure = requiredBoolean(isFrameStructure, "isFrameStructure");

  const normalized: NormalizedElevationStorey[] = storeys.map((storey, index) => {
    const topResistanceException =
      frameStructure && storeys.length >= 3 && index === storeys.length - 1;
    return {
      ...storey,
      storeyId: storey.storeyId ?? `storey-${index + 1}`,
      mass: positiveStoreyValue(storey, "mass", index),
      planLengthX: positiveStoreyValue(storey, "planLengthX", index),
      planLengthY: positiveStoreyValue(storey, "planLengthY", index),
      stiffnessX: stiffnessExempt ? null : positiveStoreyValue(storey, "stiffnessX", index),
      stiffnessY: stiffnessExempt ? null : positiveStoreyValue(storey, "stiffnessY", index),
      capacityDemandRatioX: topResistanceException
        ? null
        : positiveStoreyValue(storey, "capacityDemandRatioX", index),
      capacityDemandRatioY: topResistanceException
        ? null
        : positiveStoreyValue(storey, "capacityDemandRatioY", index),
    };
  });

  // @see https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg
  const checks = [
    regularityCheck({
      check: "elevation-continuous-horizontal-resisting-systems",
      ok: continuousSystems,
      reference: "NTC 2018 § 7.2.1, lettera d)",
    }),
  ];
  const storeyDetails = [];
  const first = normalized[0];
  if (!first) {
    throw new Error("At least two storeys ordered from base to top are required.");
  }

  for (let index = 1; index < normalized.length; index++) {
    const current = normalized[index];
    const below = normalized[index - 1];
    if (!current || !below) continue;
    const pairChecks: RegularityCheck[] = [];

    pairChecks.push(
      pairCheck({
        check: "elevation-mass-variation",
        storeyId: current.storeyId,
        comparedTo: below.storeyId,
        value: current.mass / below.mass,
        minimum: 0.75,
        maximum: 1.25,
        reference: "NTC 2018 § 7.2.1, lettera e)",
      }),
    );

    if (!stiffnessExempt) {
      for (const direction of ["X", "Y"] as const) {
        const currentStiffness = direction === "X" ? current.stiffnessX : current.stiffnessY;
        const belowStiffness = direction === "X" ? below.stiffnessX : below.stiffnessY;
        if (currentStiffness === null || belowStiffness === null) {
          throw new Error(`Storey stiffness in ${direction} is required.`);
        }
        pairChecks.push(
          pairCheck({
            check: `elevation-stiffness-${direction.toLowerCase()}`,
            storeyId: current.storeyId,
            comparedTo: below.storeyId,
            value: currentStiffness / belowStiffness,
            minimum: 0.7,
            maximum: 1.1,
            reference: "NTC 2018 § 7.2.1, lettera e)",
          }),
        );
      }
    }

    const topResistanceException =
      frameStructure && normalized.length >= 3 && index === normalized.length - 1;
    if (!topResistanceException) {
      for (const direction of ["X", "Y"] as const) {
        const currentCapacity =
          direction === "X" ? current.capacityDemandRatioX : current.capacityDemandRatioY;
        const belowCapacity =
          direction === "X" ? below.capacityDemandRatioX : below.capacityDemandRatioY;
        if (currentCapacity === null || belowCapacity === null) {
          throw new Error(`Storey capacity-demand ratio in ${direction} is required.`);
        }
        pairChecks.push(
          pairCheck({
            check: `elevation-capacity-demand-${direction.toLowerCase()}`,
            storeyId: current.storeyId,
            comparedTo: below.storeyId,
            value: currentCapacity / belowCapacity,
            minimum: 0.7,
            maximum: 1.3,
            reference: "NTC 2018 § 7.2.1, lettera f)",
          }),
        );
      }
    }

    const topSetbackException = normalized.length >= 4 && index === normalized.length - 1;
    if (!topSetbackException) {
      for (const direction of ["X", "Y"] as const) {
        const currentDimension = direction === "X" ? current.planLengthX : current.planLengthY;
        const belowDimension = direction === "X" ? below.planLengthX : below.planLengthY;
        const firstDimension = direction === "X" ? first.planLengthX : first.planLengthY;
        const setback = direction === "X" ? current.setbackX : current.setbackY;
        const setbackFromFirst =
          direction === "X" ? current.setbackFromFirstX : current.setbackFromFirstY;
        const immediateSetback =
          setback !== undefined ? Number(setback) : Math.max(0, belowDimension - currentDimension);
        const firstSetback =
          setbackFromFirst !== undefined
            ? Number(setbackFromFirst)
            : Math.max(0, firstDimension - currentDimension);
        if (
          !Number.isFinite(immediateSetback) ||
          immediateSetback < 0 ||
          !Number.isFinite(firstSetback) ||
          firstSetback < 0
        ) {
          throw new Error(
            `Storey ${current.storeyId} setbacks in ${direction} must be finite and non-negative.`,
          );
        }
        pairChecks.push(
          regularityCheck({
            check: `elevation-setback-${direction.toLowerCase()}`,
            storeyId: current.storeyId,
            comparedTo: below.storeyId,
            ok: immediateSetback / belowDimension <= 0.1 && firstSetback / firstDimension <= 0.3,
            immediateRatio: immediateSetback / belowDimension,
            fromFirstRatio: firstSetback / firstDimension,
            immediateLimit: 0.1,
            fromFirstLimit: 0.3,
            reference: "NTC 2018 § 7.2.1, lettera g)",
          }),
        );
      }
    }

    checks.push(...pairChecks);
    storeyDetails.push({
      storeyId: current.storeyId,
      comparedTo: below.storeyId,
      checks: pairChecks,
      topResistanceException,
      topSetbackException,
    });
  }

  const allChecksOk = checks.every((check) => check.ok === true);
  return {
    regularity: allChecksOk
      ? NTC2018_ELEVATION_REGULARITY.REGULAR
      : NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
    allChecksOk,
    checks,
    storeyDetails,
    stiffnessCriterionExempt: stiffnessExempt,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}

export function createNTC2018RegularityAssessment({
  planInput,
  elevationInput,
  behavior,
  t1X,
  t1Y,
  tc,
  td,
}: Ntc2018RegularityAssessmentInput) {
  const planResult = evaluateNTC2018PlanRegularity(planInput);
  const elevationResult = evaluateNTC2018ElevationRegularity(elevationInput);
  const reductionFactorKr = NTC2018_REGULARITY_REDUCTION[elevationResult.regularity];

  const analysisMethodsX = selectNTC2018AllowedAnalysisMethods({
    behavior,
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    t1: t1X,
    tc,
    td,
  });
  const analysisMethodsY = selectNTC2018AllowedAnalysisMethods({
    behavior,
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    t1: t1Y,
    tc,
    td,
  });
  const checks = [
    ...planResult.checks.map((check) => ({ ...check, scope: "plan" })),
    ...elevationResult.checks.map((check) => ({
      ...check,
      scope: "elevation",
    })),
  ];

  return {
    planRegularity: planResult.regularity,
    elevationRegularity: elevationResult.regularity,
    reductionFactorKr,
    analysisMethodsX,
    analysisMethodsY,
    planDetails: {
      slenderness: planResult.slenderness,
      maximumReentrantAreaRatio: planResult.maximumReentrantAreaRatio,
      floors: planResult.floors,
    },
    elevationDetails: elevationResult.storeyDetails,
    allChecksOk: checks.every((check) => check.ok === true),
    checks,
    references: NTC2018_REGULARITY_REFERENCES,
    metadata: regularityMetadata({
      normativeConformityClaimed: false,
    }),
  };
}
