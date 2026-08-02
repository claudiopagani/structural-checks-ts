import test from "node:test";

import {
  GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION,
  GroundAnchorDesignScenario,
  type GroundAnchorDesignScenarioJson,
  type GroundAnchorDesignScenarioOptions,
} from "../dist/index.js";

const options: GroundAnchorDesignScenarioOptions = {
  id: "scenario-α",
  name: "Anchor scenario",
  designMethod: "fhwa-gec4-allowable-load",
  demand: {
    source: "assigned-tendon-load",
    designLoad: 300,
    provenance: { source: "compile-time-β" },
  },
  criticalFailureSurface: {
    model: "rankine-active-wedge",
    wallHeight: 5,
    frictionAngle: 30,
    excavationBaseElevation: -5,
    provenance: { source: "compile-time-β" },
  },
  bondResistanceByZone: {
    sand: { model: "fhwa-presumptive", catalogId: "sand-medium-dense" },
  },
  corrosionEnvironment: {
    serviceLife: "permanent",
    provenance: { source: "compile-time-β" },
  },
  units: { force: "kN", length: "m" },
};

void test("GroundAnchorDesignScenario exposes a strict typed consumer contract", () => {
  const scenario: GroundAnchorDesignScenario = new GroundAnchorDesignScenario(options);
  const serialized: GroundAnchorDesignScenarioJson = scenario.toJSON();
  if (serialized.schemaVersion !== GROUND_ANCHOR_DESIGN_SCENARIO_SCHEMA_VERSION) {
    throw new Error("Unexpected ground-anchor design scenario schema version.");
  }
});
