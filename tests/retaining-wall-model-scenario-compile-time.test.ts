import test from "node:test";

import {
  RETAINING_WALL_BASE_UPLIFT_MODELS,
  RETAINING_WALL_MODEL_SCHEMA_VERSION,
  RETAINING_WALL_TYPES,
  RetainingWallLoadScenario,
  RetainingWallModel,
  type RetainingWallLoadScenarioOptions,
  type RetainingWallModelOptions,
} from "../dist/index.js";

const modelInput: RetainingWallModelOptions = {
  id: "wall-π",
  base: { toeX: 0, heelX: 3 },
  components: [],
};
const scenarioInput: RetainingWallLoadScenarioOptions = {
  id: "scenario-π",
  retainedSide: { profileId: "retained-π" },
  units: { force: "kN", length: "m" },
};
const model = RetainingWallModel;
const scenario = RetainingWallLoadScenario;

void test("retaining-wall model and scenario expose strict typed consumer contracts", () => {
  if (RETAINING_WALL_MODEL_SCHEMA_VERSION !== "retaining-wall-model/v1") {
    throw new Error("Unexpected retaining-wall model schema version.");
  }
  if (!RETAINING_WALL_TYPES.includes("generic-section")) {
    throw new Error("Expected generic-section retaining-wall support.");
  }
  if (!RETAINING_WALL_BASE_UPLIFT_MODELS.includes("linear-hydrostatic")) {
    throw new Error("Expected linear-hydrostatic base uplift support.");
  }
  void modelInput;
  void scenarioInput;
  void model;
  void scenario;
});
