import assert from "node:assert/strict";
import test from "node:test";

import {
  EARTH_PRESSURE_METHODS,
  EARTH_PRESSURE_STATES,
  GeotechnicalEarthPressureApplication,
  type LateralEarthPressureAnalysisInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalEarthPressureApplication>>,
  AssertFalse<IsAny<LateralEarthPressureAnalysisInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalEarthPressureApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: LateralEarthPressureAnalysisInput = {
  state: "active",
  method: "rankine",
  units: { force: "kN", length: "m" },
};

void test("geotechnical earth-pressure application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalEarthPressureApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-earth-pressures");
  assert.equal(result.applicationId, application.id);
  assert.ok(EARTH_PRESSURE_METHODS.includes("rankine"));
  assert.ok(EARTH_PRESSURE_STATES.includes("active"));
});
