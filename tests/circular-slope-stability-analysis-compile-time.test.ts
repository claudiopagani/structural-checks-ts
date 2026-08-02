import test from "node:test";

import {
  CircularSlipSurface2D,
  CircularSlopeStabilityAnalysis,
  GeotechnicalDesignSituation,
  GroundModel,
  GroundSection2D,
  PorePressureField2D,
  SoilMaterial,
  type CircularSlopeStabilityAnalysisInput,
  type CircularSlopeStabilityAnalysisResult,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const material = new SoilMaterial({
  id: "slope-soil",
  name: "Slope soil",
  unitWeight: { bulk: 18, saturated: 20 },
  parameterSets: [
    {
      id: "drained",
      basis: "characteristic",
      drainage: "drained",
      strength: { model: "mohr-coulomb-effective", frictionAngle: 25, cohesion: 10 },
      provenance: { source: "compile-time" },
    },
  ],
  defaultParameterSetId: "drained",
  angleUnits: "deg",
  units,
});
const section = new GroundSection2D({
  id: "slope-section",
  surface: {
    points: [
      { x: 0, z: 10 },
      { x: 10, z: 0 },
      { x: 20, z: 0 },
    ],
  },
  zones: [
    {
      id: "slope-zone",
      materialId: material.id,
      polygon: [
        { x: 0, z: -20 },
        { x: 20, z: -20 },
        { x: 20, z: 0 },
        { x: 10, z: 0 },
        { x: 0, z: 10 },
      ],
    },
  ],
  units,
});
const field = new PorePressureField2D({ id: "dry", model: "none", units });
const groundModel = new GroundModel({
  id: "slope-ground",
  materials: [material],
  sections: [section],
  porePressureFields: [field],
  defaultSectionId: section.id,
  defaultPorePressureFieldId: field.id,
  units,
});
const designSituation = new GeotechnicalDesignSituation({
  id: "slope-situation",
  groundModel,
  situationType: "persistent",
  limitState: "not-specified",
  drainageCondition: "drained",
  requiredParameterBasis: "characteristic",
  sectionId: section.id,
  porePressureFieldId: field.id,
  units,
});
const input: CircularSlopeStabilityAnalysisInput = {
  groundModel,
  designSituation,
  slipSurface: CircularSlipSurface2D.fromChordAndSagitta({
    id: "circle-\u03B1",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units,
  }),
  method: "bishop-simplified",
  sliceCount: 20,
  iteration: { tolerance: 1e-9, maximumIterations: 100 },
  units,
};
const result: CircularSlopeStabilityAnalysisResult = new CircularSlopeStabilityAnalysis().analyze(
  input,
);

void test("Circular slope-stability analysis exposes a strict typed consumer contract", () => {
  void result.status;
  void result.outputs.factorOfSafety;
  void result.metadata.designSituation;
});
