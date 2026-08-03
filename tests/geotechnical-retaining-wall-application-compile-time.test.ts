import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalRetainingWallApplication,
  type RetainingWallAnalysisInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalRetainingWallApplication>>,
  AssertFalse<IsAny<RetainingWallAnalysisInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalRetainingWallApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: RetainingWallAnalysisInput = { units: { force: "kN", length: "m" } };

void test("geotechnical retaining-wall application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalRetainingWallApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-retaining-walls");
  assert.equal(result.applicationId, application.id);
});
