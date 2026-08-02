import test from "node:test";

import {
  GroundSection2D,
  type GroundSection2DJson,
  type GroundSection2DOptions,
  type GroundSectionZone,
} from "../dist/index.js";

const options: GroundSection2DOptions = {
  id: "section-\u03B1",
  name: "Sezione \u03B2",
  surface: {
    points: [
      { x: 0, z: 10 },
      { x: 5, z: 9 },
      { x: 10, z: 8 },
    ],
    metadata: { label: "superficie γ" },
  },
  zones: [
    {
      id: "upper",
      materialId: "sand",
      polygon: [
        { x: 0, z: 5 },
        { x: 10, z: 5 },
        { x: 10, z: 8 },
        { x: 0, z: 10 },
      ],
      metadata: { label: "sabbia δ" },
    },
  ],
  units: { force: "kN", length: "m" },
  metadata: { datum: "quota ε" },
};

const section = new GroundSection2D(options);
const serialized: GroundSection2DJson = section.toJSON();
const zone: GroundSectionZone | null = section.getZoneAtPoint({ x: 5, z: 7 });

void test("GroundSection2D exposes a strict typed consumer contract", () => {
  void serialized;
  void zone;
});
