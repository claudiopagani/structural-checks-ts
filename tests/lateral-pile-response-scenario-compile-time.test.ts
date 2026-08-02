import test from "node:test";

import {
  LateralPileResponseScenario,
  type LateralPileResponseScenarioJson,
  type LateralPileResponseScenarioOptions,
} from "../dist/index.js";

const options: LateralPileResponseScenarioOptions = {
  id: "response-\u03B1",
  name: "Scenario \u03B2",
  action: {
    lateralShear: 12,
    overturningMoment: 3,
    referencePoint: "pile-head",
    basis: "assigned-\u03B3",
    direction: "local-positive-y",
    metadata: { label: "azione \u03B4" },
  },
  flexuralRigidity: {
    model: "constant",
    value: 1000,
    provenance: { source: "catalogue-\u03B5" },
  },
  soilResponse: {
    model: "assigned-py-curves",
    curvesByLayer: {
      layer: {
        stations: [
          {
            depth: 0,
            law: {
              id: "law-\u03B6",
              points: [
                { displacement: 0, resistancePerLength: 0 },
                { displacement: 0.01, resistancePerLength: 2 },
              ],
              provenance: { source: "test-\u03B7" },
              units: { force: "kN", length: "m" },
            },
            metadata: { label: "station-\u03B8" },
          },
        ],
      },
    },
  },
  discretization: { maxElementLength: 0.5 },
  solver: { loadSteps: 4, maxIterations: 20 },
  units: { force: "kN", length: "m" },
  metadata: { label: "metadata-\u03B9" },
};

const scenario = new LateralPileResponseScenario(options);
const serialized: LateralPileResponseScenarioJson = scenario.toJSON();

void test("LateralPileResponseScenario exposes a strict typed consumer contract", () => {
  void serialized;
});
