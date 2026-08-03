import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalSlopeStabilityApplication,
  type GeotechnicalSlopeStabilityApplicationInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalSlopeStabilityApplication>>,
  AssertFalse<IsAny<GeotechnicalSlopeStabilityApplicationInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalSlopeStabilityApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: GeotechnicalSlopeStabilityApplicationInput = {
  mode: "assigned-surface",
  method: "bishop-simplified",
  units: { force: "kN", length: "m" },
};

void test("geotechnical slope-stability application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalSlopeStabilityApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-slope-stability");
  assert.equal(result.applicationId, application.id);
});
