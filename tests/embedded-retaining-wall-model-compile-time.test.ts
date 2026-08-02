import test from "node:test";

import {
  EmbeddedRetainingWallModel,
  type EmbeddedRetainingWallModelJson,
  type EmbeddedRetainingWallModelOptions,
  type FlexuralRigiditySegment,
} from "../dist/index.js";

const options: EmbeddedRetainingWallModelOptions = {
  id: "wall-1",
  name: "Wall α",
  topElevation: 10,
  toeElevation: 0,
  units: { force: "kN", length: "m" },
  flexuralRigiditySegments: [
    {
      topElevation: 10,
      bottomElevation: 5,
      flexuralRigidity: 1000,
      provenance: { source: "catalogue" },
    },
    {
      topElevation: 5,
      bottomElevation: 0,
      flexuralRigidity: 800,
      provenance: { source: "catalogue" },
    },
  ],
};
const model = new EmbeddedRetainingWallModel(options);
const serialized: EmbeddedRetainingWallModelJson = model.toJSON();
const segment: FlexuralRigiditySegment = model.flexuralRigidityAtElevation(7);

void test("EmbeddedRetainingWallModel exposes a strict typed consumer contract", () => {
  void serialized;
  void segment;
});
