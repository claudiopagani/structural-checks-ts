import test from "node:test";

import {
  EARTH_PRESSURE_METHODS,
  EARTH_PRESSURE_STATES,
  LateralEarthPressureAnalysis,
  type LateralEarthPressureAnalysisInput,
  type LateralEarthPressureAnalysisResult,
} from "../dist/index.js";

const input: LateralEarthPressureAnalysisInput = {
  state: "seismic-active",
  method: "trial-wedge-pseudostatic",
  geometry: {
    wallInclinationFromVertical: 6,
    backfillInclination: 4,
    angleUnits: "deg",
  },
  seismic: { kh: 0.1, kv: 0 },
  units: { force: "kN", length: "m" },
};
const analysis = new LateralEarthPressureAnalysis();
const analyze: LateralEarthPressureAnalysis["analyze"] = (options) => analysis.analyze(options);
const result: LateralEarthPressureAnalysisResult = analysis.analyze(input);

void test("LateralEarthPressureAnalysis exposes a strict typed consumer contract", () => {
  if (!EARTH_PRESSURE_STATES.includes("seismic-active")) {
    throw new Error("Expected seismic-active to be a supported earth-pressure state.");
  }
  if (!EARTH_PRESSURE_METHODS.includes("trial-wedge-pseudostatic")) {
    throw new Error("Expected trial-wedge-pseudostatic to be a supported earth-pressure method.");
  }
  void analyze;
  void result;
});
