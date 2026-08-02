import test from "node:test";

import {
  PressureDiagram2D,
  type PressureDiagram2DJson,
  type PressureDiagram2DOptions,
  type PressureIntegrationResults,
} from "../dist/index.js";

const options: PressureDiagram2DOptions = {
  profileId: "profile-α",
  state: "active",
  method: { id: "rankine", label: "Rankine β" },
  topElevation: 10,
  bottomElevation: 0,
  segments: [
    {
      topElevation: 10,
      bottomElevation: 5,
      top: { totalNormal: 0, waterNormal: 0 },
      bottom: { totalNormal: 30, waterNormal: 0 },
    },
    {
      topElevation: 5,
      bottomElevation: 0,
      top: { totalNormal: 30, waterNormal: 0 },
      bottom: { totalNormal: 60, waterNormal: 0 },
    },
  ],
  metadata: { label: "diagramma γ" },
};
const diagram = new PressureDiagram2D(options);
const serialized: PressureDiagram2DJson = diagram.toJSON();
const resultants: PressureIntegrationResults = diagram.resultants;

void test("PressureDiagram2D exposes a strict typed consumer contract", () => {
  void serialized;
  void resultants;
});
