// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_ELEVATION_REGULARITY,
  NTC2018_PLAN_REGULARITY,
  NTC2018_REGULARITY_REFERENCES,
  createNTC2018RegularityAssessment,
  evaluateNTC2018ElevationRegularity,
  evaluateNTC2018PlanRegularity,
} from "../dist/index.js";
import type {
  Ntc2018ElevationRegularityInput,
  Ntc2018ElevationStoreyInput,
  Ntc2018FloorPlanInput,
  Ntc2018PlanRegularityInput,
} from "../src/norms/ntc2018/reinforced-concrete/structuralRegularity.js";

type PlanOverrides = Partial<Omit<Ntc2018PlanRegularityInput, "floors">> & {
  readonly floor?: Partial<Ntc2018FloorPlanInput>;
};

function requireValue<T>(value: T, label: string): NonNullable<T> {
  if (value == null) {
    throw new Error(`${label} was not produced by the check.`);
  }
  return value;
}

function regularPlan(overrides: PlanOverrides = {}): Ntc2018PlanRegularityInput {
  const { floor, ...planOverrides } = overrides;
  return {
    massAndStiffnessApproximatelySymmetric: true,
    floors: [
      {
        storeyId: "L1",
        planLengthX: 20,
        planLengthY: 10,
        contourConvex: true,
        diaphragmInPlaneRigidityAdequate: true,
        diaphragmInPlaneStrengthAdequate: true,
        ...(floor ?? {}),
      },
    ],
    ...planOverrides,
  };
}

function storey(
  storeyId: string,
  overrides: Partial<Ntc2018ElevationStoreyInput> = {},
): Ntc2018ElevationStoreyInput {
  return {
    storeyId,
    mass: 100,
    stiffnessX: 100,
    stiffnessY: 100,
    capacityDemandRatioX: 1,
    capacityDemandRatioY: 1,
    planLengthX: 20,
    planLengthY: 10,
    ...overrides,
  };
}

function regularElevation(
  overrides: Partial<Ntc2018ElevationRegularityInput> = {},
): Ntc2018ElevationRegularityInput {
  return {
    continuousVerticalSystems: true,
    storeys: [
      storey("L1"),
      storey("L2", {
        mass: 90,
        stiffnessX: 90,
        stiffnessY: 95,
        capacityDemandRatioX: 0.9,
        capacityDemandRatioY: 1.1,
        planLengthX: 19,
        planLengthY: 9.5,
      }),
    ],
    ...overrides,
  };
}

void test("regularity references point to NTC 2018 § 7.2.1", () => {
  assert.equal(Object.isFrozen(NTC2018_REGULARITY_REFERENCES), true);
  const reference = NTC2018_REGULARITY_REFERENCES[0];
  assert.ok(reference);
  assert.match(reference.citation, /7\.2\.1/);
});

void test("plan regularity requires qualitative evidence instead of positive defaults", () => {
  assert.throws(
    () =>
      evaluateNTC2018PlanRegularity({
        planLengthX: 20,
        planLengthY: 10,
      }),
    /massAndStiffnessApproximatelySymmetric/,
  );
});

void test("a compact symmetric floor with adequate diaphragm is regular", () => {
  const result = evaluateNTC2018PlanRegularity(regularPlan());
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
  assert.equal(result.allChecksOk, true);
});

void test("the bounding rectangle ratio must be strictly less than four", () => {
  const result = evaluateNTC2018PlanRegularity(
    regularPlan({
      floor: { planLengthX: 40, planLengthY: 10 },
    }),
  );
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
  assert.equal(
    requireValue(
      result.checks.find((check) => check.check === "plan-bounding-rectangle-ratio"),
      "plan bounding-rectangle check",
    ).ok,
    false,
  );
});

void test("non-convex plans use the five-percent area criterion per re-entrant corner", () => {
  const passing = evaluateNTC2018PlanRegularity(
    regularPlan({
      floor: {
        contourConvex: false,
        reentrantAreaRatios: [0.04, 0.05],
        reentrantInfluenceNegligible: true,
      },
    }),
  );
  const failing = evaluateNTC2018PlanRegularity(
    regularPlan({
      floor: {
        contourConvex: false,
        reentrantAreaRatios: [0.0501],
        reentrantInfluenceNegligible: true,
      },
    }),
  );
  assert.equal(passing.regularity, NTC2018_PLAN_REGULARITY.REGULAR);
  assert.equal(failing.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

void test("diaphragm rigidity and strength are separate mandatory checks", () => {
  const result = evaluateNTC2018PlanRegularity(
    regularPlan({
      floor: { diaphragmInPlaneStrengthAdequate: false },
    }),
  );
  assert.equal(result.regularity, NTC2018_PLAN_REGULARITY.NON_REGULAR);
});

void test("elevation regularity evaluates every criterion in both directions", () => {
  const result = evaluateNTC2018ElevationRegularity(regularElevation());
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
  assert.equal(result.allChecksOk, true);
  assert.ok(result.checks.some((check) => check.check === "elevation-capacity-demand-y"));
});

void test("vertical resisting-system continuity must be explicit", () => {
  const storeys = requireValue(regularElevation().storeys, "elevation storeys");
  assert.throws(
    () =>
      evaluateNTC2018ElevationRegularity({
        storeys,
      }),
    /continuousVerticalSystems/,
  );
});

void test("mass changes greater than twenty-five percent are irregular", () => {
  const input = regularElevation();
  const storeys = requireValue(input.storeys, "elevation storeys");
  const changedStoreys = storeys.map((item, index) =>
    index === 1 ? { ...item, mass: 126 } : item,
  );
  const changedInput = { ...input, storeys: changedStoreys };
  const result = evaluateNTC2018ElevationRegularity(changedInput);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

void test("stiffness must neither reduce over thirty percent nor increase over ten percent", () => {
  const reduction = regularElevation();
  const reductionInput = {
    ...reduction,
    storeys: requireValue(reduction.storeys, "reduction storeys").map((item, index) =>
      index === 1 ? { ...item, stiffnessX: 69 } : item,
    ),
  };
  const increase = regularElevation();
  const increaseInput = {
    ...increase,
    storeys: requireValue(increase.storeys, "increase storeys").map((item, index) =>
      index === 1 ? { ...item, stiffnessY: 111 } : item,
    ),
  };

  assert.equal(
    evaluateNTC2018ElevationRegularity(reductionInput).regularity,
    NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
  );
  assert.equal(
    evaluateNTC2018ElevationRegularity(increaseInput).regularity,
    NTC2018_ELEVATION_REGULARITY.NON_REGULAR,
  );
});

void test("adjacent capacity-to-demand ratios may differ by at most thirty percent", () => {
  const input = regularElevation();
  const result = evaluateNTC2018ElevationRegularity({
    ...input,
    storeys: requireValue(input.storeys, "capacity storeys").map((item, index) =>
      index === 1 ? { ...item, capacityDemandRatioX: 0.69 } : item,
    ),
  });
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

void test("setbacks satisfy both ten-percent adjacent and thirty-percent first-floor limits", () => {
  const input = regularElevation();
  const result = evaluateNTC2018ElevationRegularity({
    ...input,
    storeys: requireValue(input.storeys, "setback storeys").map((item, index) =>
      index === 1 ? { ...item, setbackX: 2.01 } : item,
    ),
  });
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.NON_REGULAR);
});

void test("the top-storey resistance exception applies only to frames of at least three storeys", () => {
  const topStorey: Ntc2018ElevationStoreyInput = {
    storeyId: "L3",
    mass: 100,
    stiffnessX: 100,
    stiffnessY: 100,
    planLengthX: 20,
    planLengthY: 10,
  };
  const input = {
    continuousVerticalSystems: true,
    isFrameStructure: true,
    storeys: [storey("L1"), storey("L2"), topStorey],
  };
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
  assert.equal(
    requireValue(result.storeyDetails[1], "top storey details").topResistanceException,
    true,
  );
});

void test("the top-storey setback exception applies from four storeys", () => {
  const input = {
    continuousVerticalSystems: true,
    storeys: [
      storey("L1"),
      storey("L2"),
      storey("L3"),
      storey("L4", {
        planLengthX: 5,
        planLengthY: 2,
      }),
    ],
  };
  const result = evaluateNTC2018ElevationRegularity(input);
  assert.equal(
    requireValue(result.storeyDetails[2], "setback storey details").topSetbackException,
    true,
  );
  assert.equal(result.regularity, NTC2018_ELEVATION_REGULARITY.REGULAR);
});

void test("combined assessment exposes allChecksOk and analysis-method evidence", () => {
  const result = createNTC2018RegularityAssessment({
    planInput: regularPlan(),
    elevationInput: regularElevation(),
    behavior: "cd-b",
    t1X: 0.8,
    t1Y: 0.9,
    tc: 0.4,
    td: 2.0,
  });
  assert.equal(result.allChecksOk, true);
  assert.equal(result.reductionFactorKr, 1);
  assert.equal(result.analysisMethodsX.linearStaticAllowed, true);
  assert.equal(result.analysisMethodsY.linearStaticAllowed, true);
  assert.equal(result.metadata.normativeConformityClaimed, false);
  const references = result.metadata["normativeReferences"];
  assert.ok(Array.isArray(references));
  assert.ok(
    references.every(
      (reference: unknown) =>
        reference !== null &&
        typeof reference === "object" &&
        "resolutionStatus" in reference &&
        reference.resolutionStatus === "outside-corpus",
    ),
  );
  assert.ok(
    result.checks.every((check) => {
      if (!("metadata" in check)) return false;
      const metadata = check.metadata;
      return (
        metadata !== null &&
        typeof metadata === "object" &&
        "normativeReferences" in metadata &&
        Array.isArray(metadata.normativeReferences) &&
        metadata.normativeReferences.length === 2
      );
    }),
  );
});
