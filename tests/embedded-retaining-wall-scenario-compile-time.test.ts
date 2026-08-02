import test from "node:test";

import {
  EmbeddedRetainingWallScenario,
  type EmbeddedRetainingWallScenarioJson,
  type EmbeddedRetainingWallScenarioOptions,
} from "../dist/index.js";

const options: EmbeddedRetainingWallScenarioOptions = {
  id: "scenario-α",
  soilResponse: {
    sides: {
      retained: {
        profileId: "profile-retained",
        curvesByLayer: {
          layer: {
            stations: [],
          },
        },
      },
      excavation: {
        profileId: "profile-excavation",
        curvesByLayer: {
          layer: {
            stations: [],
          },
        },
      },
    },
  },
  stages: [],
  units: { force: "kN", length: "m" },
};

void test("EmbeddedRetainingWallScenario exposes a strict typed consumer contract", () => {
  const constructor: typeof EmbeddedRetainingWallScenario = EmbeddedRetainingWallScenario;
  const serialize = (scenario: EmbeddedRetainingWallScenario): EmbeddedRetainingWallScenarioJson =>
    scenario.toJSON();
  void options;
  void constructor;
  void serialize;
});
