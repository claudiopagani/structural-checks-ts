import test from "node:test";

import {
  GroundAnchorModel,
  type GroundAnchorModelJson,
  type GroundAnchorModelOptions,
  type GroundAnchorPoint,
  type GroundAnchorTendon,
} from "../dist/index.js";

const options: GroundAnchorModelOptions = {
  id: "anchor-α",
  name: "Tirante β",
  head: { x: 1, z: 2 },
  horizontalDirection: "negative-x",
  inclination: 12,
  angleUnits: "deg",
  freeLength: 5,
  bondLength: 7,
  horizontalSpacing: 2,
  groutBodyDiameter: 0.15,
  tendon: {
    type: "strand",
    steelArea: 0.0014,
    elasticModulus: 195_000_000,
    specifiedMinimumTensileStrength: 1_000_000,
    provenance: { source: "catalogue γ" },
  },
  corrosionProtection: {
    class: "I",
    restressable: true,
    provenance: { source: "catalogue δ" },
  },
  units: { force: "kN", length: "m" },
  metadata: { label: "ancoraggio ε" },
};
const model = new GroundAnchorModel(options);
const serialized: GroundAnchorModelJson = model.toJSON();
const point: GroundAnchorPoint = model.pointAtDistance(3);
const tendon: GroundAnchorTendon = model.tendon;
const totalLength: number = model.totalLength;

void test("GroundAnchorModel exposes a strict typed consumer contract", () => {
  void serialized;
  void point;
  void tendon;
  void totalLength;
});
