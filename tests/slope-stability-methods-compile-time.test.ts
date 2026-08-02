import test from "node:test";

import {
  ordinaryMethodOfSlices,
  simplifiedBishop,
  type OrdinaryMethodOfSlicesResult,
  type SimplifiedBishopResult,
  type SlopeSliceInput,
} from "../dist/index.js";

const slices: SlopeSliceInput[] = [
  {
    id: "slice-\u03B1",
    width: 2,
    baseLength: 2,
    weight: 100,
    baseInclination: (20 * Math.PI) / 180,
    cohesion: 10,
    frictionAngle: (25 * Math.PI) / 180,
    porePressure: 2,
    stressBasis: "effective",
  },
  {
    id: "slice-\u03B2",
    width: 2,
    baseLength: 2,
    weight: 120,
    baseInclination: (10 * Math.PI) / 180,
    cohesion: 8,
    frictionAngle: (25 * Math.PI) / 180,
    porePressure: 1,
    stressBasis: "effective",
  },
];

const ordinary: OrdinaryMethodOfSlicesResult = ordinaryMethodOfSlices(slices);
const bishop: SimplifiedBishopResult = simplifiedBishop(slices);

void test("slope-stability methods expose strict typed consumer contracts", () => {
  void ordinary.factorOfSafety;
  void bishop.metadata.tolerance;
});
