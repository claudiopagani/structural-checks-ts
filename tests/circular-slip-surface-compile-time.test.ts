import test from "node:test";

import {
  CircularSlipSurface2D,
  type CircularSlipSurface2DJson,
  type CircularSlipSurface2DOptions,
  type SlipSurfaceIntersection,
  type SlipSurfacePoint,
} from "../dist/index.js";

const options: CircularSlipSurface2DOptions = {
  id: "circle",
  center: { x: 5, z: 5.25 },
  radius: 7.25,
  entryX: 0,
  exitX: 10,
  movementDirection: "left-to-right",
  units: { force: "kN", length: "m" },
  metadata: { label: "slip α" },
};
const surface = new CircularSlipSurface2D(options);
const serialized: CircularSlipSurface2DJson = surface.toJSON();
const point: SlipSurfacePoint = { x: 0, z: 0 };
const intersections: SlipSurfaceIntersection[] = surface.intersectionsWithSegment(point, {
  x: 10,
  z: 0,
});
const elevation: number = surface.lowerElevationAt(5);

void test("CircularSlipSurface2D exposes a strict typed consumer contract", () => {
  void serialized;
  void intersections;
  void elevation;
});
