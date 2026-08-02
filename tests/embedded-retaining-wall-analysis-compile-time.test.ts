import test from "node:test";

import {
  EmbeddedRetainingWallAnalysis,
  type EmbeddedRetainingWallAnalysisInput,
  type EmbeddedRetainingWallAnalysisResult,
} from "../dist/index.js";

const input: EmbeddedRetainingWallAnalysisInput = {
  groundModel: {
    id: "ground-α",
    materials: [],
    profiles: [],
    units: { force: "kN", length: "m" },
  },
  designSituation: {
    id: "situation-β",
    groundModelId: "ground-α",
    profileId: "profile-γ",
    units: { force: "kN", length: "m" },
  },
  wall: {
    id: "wall-δ",
    topElevation: 0,
    toeElevation: -1,
    flexuralRigiditySegments: [],
    units: { force: "kN", length: "m" },
  },
  scenario: {
    id: "scenario-ε",
    soilResponse: {},
    stages: [],
    units: { force: "kN", length: "m" },
  },
  units: { force: "kN", length: "m" },
};

void test("EmbeddedRetainingWallAnalysis exposes a strict typed consumer contract", () => {
  const analysis: EmbeddedRetainingWallAnalysis = new EmbeddedRetainingWallAnalysis();
  const analyze = (
    value: EmbeddedRetainingWallAnalysisInput,
  ): EmbeddedRetainingWallAnalysisResult => analysis.analyze(value);
  void input;
  void analyze;
});
