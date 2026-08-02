import test from "node:test";

import {
  spencerMethod,
  type SpencerMethodOptions,
  type SpencerMethodResult,
  type SpencerSliceInput,
} from "../dist/index.js";

const slices: SpencerSliceInput[] = [
  {
    id: "slice-\u03B1",
    width: 1,
    baseLength: 2,
    totalVerticalLoad: 100,
    horizontalSeismicLoad: 10,
    baseInclination: (20 * Math.PI) / 180,
    cohesion: 10,
    frictionAngle: 0,
    porePressure: 0,
    stressBasis: "total",
    baseMomentArm: 10,
    drivingMoment:
      (100 * Math.sin((20 * Math.PI) / 180) + 10 * Math.cos((20 * Math.PI) / 180)) * 10,
  },
  {
    id: "slice-\u03B2",
    width: 1,
    baseLength: 2,
    totalVerticalLoad: 80,
    horizontalSeismicLoad: 8,
    baseInclination: (10 * Math.PI) / 180,
    cohesion: 10,
    frictionAngle: 0,
    porePressure: 0,
    stressBasis: "total",
    baseMomentArm: 10,
    drivingMoment: (80 * Math.sin((10 * Math.PI) / 180) + 8 * Math.cos((10 * Math.PI) / 180)) * 10,
  },
];

const options: SpencerMethodOptions = {
  initialFactorOfSafety: 1.5,
  tolerance: 1e-9,
  maximumIterations: 100,
  thetaLimit: (75 * Math.PI) / 180,
};

const result: SpencerMethodResult = spencerMethod(slices, options);

void test("Spencer method exposes a strict typed consumer contract", () => {
  void result.factorOfSafety;
  void result.metadata.reference;
  void result.sliceContributions[0]?.externalPointLoads;
});
