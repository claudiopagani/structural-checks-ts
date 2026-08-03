import assert from "node:assert/strict";
import test from "node:test";

import {
  GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION,
  GEOTECHNICAL_DESIGN_SITUATION_TYPES,
  GEOTECHNICAL_DRAINAGE_CONDITIONS,
  GEOTECHNICAL_INTERNAL_UNITS,
  GEOTECHNICAL_LIMIT_STATES,
  GEOTECHNICAL_SEISMIC_MODELS,
  GEOTECHNICAL_TIME_CONDITIONS,
  GROUND_MODEL_SCHEMA_VERSION,
  GROUND_PROFILE_SCHEMA_VERSION,
  SOIL_DEFORMATION_MODELS,
  SOIL_DRAINAGE_CONDITIONS,
  SOIL_MODULUS_DEFINITIONS,
  SOIL_PARAMETER_BASES,
  SOIL_SETTLEMENT_COMPONENTS,
  SOIL_STRENGTH_MODELS,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_DESIGN_SITUATION_TYPES>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_DRAINAGE_CONDITIONS>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_INTERNAL_UNITS>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_LIMIT_STATES>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_SEISMIC_MODELS>>,
  AssertFalse<IsAny<typeof GEOTECHNICAL_TIME_CONDITIONS>>,
  AssertFalse<IsAny<typeof GROUND_MODEL_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof GROUND_PROFILE_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof SOIL_DEFORMATION_MODELS>>,
  AssertFalse<IsAny<typeof SOIL_DRAINAGE_CONDITIONS>>,
  AssertFalse<IsAny<typeof SOIL_MODULUS_DEFINITIONS>>,
  AssertFalse<IsAny<typeof SOIL_PARAMETER_BASES>>,
  AssertFalse<IsAny<typeof SOIL_SETTLEMENT_COMPONENTS>>,
  AssertFalse<IsAny<typeof SOIL_STRENGTH_MODELS>>,
];

function useConsumerDeclarations(value: PublicDeclarationsAreUseful | undefined): void {
  void value;
}

void test("geotechnical domain constants expose strict typed consumer declarations", () => {
  useConsumerDeclarations(undefined);
  const publicValues = [
    GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION,
    GEOTECHNICAL_DESIGN_SITUATION_TYPES,
    GEOTECHNICAL_DRAINAGE_CONDITIONS,
    GEOTECHNICAL_INTERNAL_UNITS,
    GEOTECHNICAL_LIMIT_STATES,
    GEOTECHNICAL_SEISMIC_MODELS,
    GEOTECHNICAL_TIME_CONDITIONS,
    GROUND_MODEL_SCHEMA_VERSION,
    GROUND_PROFILE_SCHEMA_VERSION,
    SOIL_DEFORMATION_MODELS,
    SOIL_DRAINAGE_CONDITIONS,
    SOIL_MODULUS_DEFINITIONS,
    SOIL_PARAMETER_BASES,
    SOIL_SETTLEMENT_COMPONENTS,
    SOIL_STRENGTH_MODELS,
  ];
  assert.equal(publicValues.length, 15);
  assert.equal(GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION, "geotechnical-design-situation/v1");
  assert.equal(GROUND_MODEL_SCHEMA_VERSION, "ground-model/v1");
  assert.equal(GROUND_PROFILE_SCHEMA_VERSION, "ground-profile/v1");
  assert.deepEqual(GEOTECHNICAL_INTERNAL_UNITS, { force: "kN", length: "m" });
  assert.ok(GEOTECHNICAL_DESIGN_SITUATION_TYPES.includes("seismic"));
  assert.ok(SOIL_STRENGTH_MODELS.includes("total-stress-undrained"));
});
