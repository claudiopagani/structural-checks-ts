import test from "node:test";

import {
  PorePressureField2D,
  type PorePressureField2DJson,
  type PorePressureField2DOptions,
  type PorePressurePoint,
} from "../dist/index.js";

const options: PorePressureField2DOptions = {
  id: "pore-α",
  name: "Phreatica β",
  model: "phreatic-line",
  phreaticLine: {
    points: [
      { x: 0, z: 5 },
      { x: 10, z: 4 },
    ],
    metadata: { label: "linea γ" },
  },
  waterUnitWeight: 9.81,
  units: { force: "kN", length: "m" },
};
const field = new PorePressureField2D(options);
const serialized: PorePressureField2DJson = field.toJSON();
const point: PorePressurePoint = { x: 5, z: 2 };
const pressure: number = field.porePressureAt(point);
const elevation: number | null = field.waterElevationAt(point.x);

void test("PorePressureField2D exposes a strict typed consumer contract", () => {
  void serialized;
  void pressure;
  void elevation;
});
