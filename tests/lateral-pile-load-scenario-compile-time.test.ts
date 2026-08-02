import test from "node:test";

import {
  LateralPileLoadScenario,
  type LateralPileLoadScenarioJson,
  type LateralPileLoadScenarioOptions,
} from "../dist/index.js";

const options: LateralPileLoadScenarioOptions = {
  id: "lateral-pile-\u03B1",
  name: "Palo laterale \u03B2",
  soilBranch: "cohesionless-drained",
  action: {
    lateralShear: 100,
    overturningMoment: 50,
    basis: "design",
    referencePoint: "groundline-at-pile-axis",
    direction: "local-positive-x",
    metadata: { label: "azione \u03B3" },
  },
  behaviorAssertion: {
    classification: "short-rigid",
    basis: "project-assessment",
    provenance: { source: "assessment \u03B4" },
    metadata: { label: "rigido \u03B5" },
  },
  resistanceConversion: {
    model: "soil-reaction-factor",
    factor: 0.8,
    provenance: { source: "conversion \u03B6" },
  },
  units: { force: "kN", length: "m" },
  metadata: { label: "scenario \u03B7" },
};

const scenario = new LateralPileLoadScenario(options);
const serialized: LateralPileLoadScenarioJson = scenario.toJSON();

void test("LateralPileLoadScenario exposes a strict typed consumer contract", () => {
  void serialized;
});
