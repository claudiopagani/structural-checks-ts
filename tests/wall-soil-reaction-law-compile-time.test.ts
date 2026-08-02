import test from "node:test";

import {
  WALL_SOIL_REACTION_EXTRAPOLATION_MODELS,
  WALL_SOIL_REACTION_LAW_SCHEMA_VERSION,
  WALL_SOIL_REACTION_MODELS,
  WallSoilReactionLaw,
  type WallSoilReactionEvaluation,
  type WallSoilReactionLawJson,
  type WallSoilReactionLawOptions,
} from "../dist/index.js";

const options: WallSoilReactionLawOptions = {
  id: "law-\u03B1",
  name: "Wall \u03B2",
  points: [
    { closureDisplacement: -0.1, effectivePressure: 0 },
    { closureDisplacement: 0, effectivePressure: 10 },
    { closureDisplacement: 0.1, effectivePressure: 30 },
  ],
  extrapolation: "linear",
  provenance: { source: "oracle-\u03B3" },
  units: { force: "kN", length: "m" },
  metadata: { label: "metadata-\u03B4" },
};

const law = new WallSoilReactionLaw(options);
const evaluation: WallSoilReactionEvaluation = law.evaluate(0.05);
const serialized: WallSoilReactionLawJson = law.toJSON();

void test("WallSoilReactionLaw exposes a strict typed consumer contract", () => {
  void evaluation;
  void serialized;
  void WALL_SOIL_REACTION_EXTRAPOLATION_MODELS;
  void WALL_SOIL_REACTION_LAW_SCHEMA_VERSION;
  void WALL_SOIL_REACTION_MODELS;
});
