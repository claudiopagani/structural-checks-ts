import test from "node:test";

import {
  PileTransferLaw,
  type PileTransferEvaluation,
  type PileTransferLawJson,
  type PileTransferLawOptions,
} from "../dist/index.js";

const options: PileTransferLawOptions = {
  id: "p-y-\u03B1",
  name: "Legge \u03B2",
  points: [
    { displacement: 0, resistancePerLength: 0 },
    { displacement: 0.01, resistancePerLength: 2 },
    { displacement: 0.03, resistancePerLength: 5 },
  ],
  extrapolation: "linear",
  provenance: { source: "catalogue \u03B3" },
  units: { force: "kN", length: "m" },
  metadata: { label: "curva \u03B4" },
};

const law = new PileTransferLaw(options);
const evaluation: PileTransferEvaluation = law.evaluate(-0.02);
const serialized: PileTransferLawJson = law.toJSON();

void test("PileTransferLaw exposes a strict typed consumer contract", () => {
  void evaluation;
  void serialized;
});
