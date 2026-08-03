import assert from "node:assert/strict";
import test from "node:test";

import {
  AXIAL_PILE_CAPACITY_REFERENCE,
  AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
  AxialPileCapacityAnalysis,
  GeotechnicalDeepFoundationApplication,
} from "../dist/applications/geotechnical-deep-foundations/index.js";
import type {
  AxialPileCapacityAnalysisInput,
  AxialPileCapacityAnalysisResult,
  AxialPileLoadScenarioInput,
  DeepFoundationModelInput,
} from "../dist/applications/geotechnical-deep-foundations/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof AXIAL_PILE_CAPACITY_REFERENCE>>,
  AssertFalse<IsAny<typeof AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof AxialPileCapacityAnalysis>>,
  AssertFalse<IsAny<typeof GeotechnicalDeepFoundationApplication>>,
];
type PublicContracts = [
  AxialPileCapacityAnalysisInput,
  AxialPileCapacityAnalysisResult,
  AxialPileLoadScenarioInput,
  DeepFoundationModelInput,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("geotechnical deep-foundation index exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const input: AxialPileCapacityAnalysisInput = {
    units: { force: "N", length: "m" },
  };
  const scenario: AxialPileLoadScenarioInput = { direction: "compression" };
  const pile: DeepFoundationModelInput = { id: "PILE-01" };
  const result: AxialPileCapacityAnalysisResult = {
    status: "not-analyzed",
    summary: "No input",
    outputs: {},
    warnings: [],
    assumptions: [],
    metadata: {},
  };

  assert.equal(input.units?.length, "m");
  assert.equal(scenario.direction, "compression");
  assert.equal(pile.id, "PILE-01");
  assert.equal(result.status, "not-analyzed");
  assert.equal(typeof AXIAL_PILE_CAPACITY_REFERENCE, "string");
  assert.equal(AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION, "axial-pile-capacity-result/v1");
  void AxialPileCapacityAnalysis;
  void GeotechnicalDeepFoundationApplication;
});
