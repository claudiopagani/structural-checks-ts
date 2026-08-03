import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalEmbeddedRetainingWallApplication,
  type EmbeddedRetainingWallAnalysisInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalEmbeddedRetainingWallApplication>>,
  AssertFalse<IsAny<EmbeddedRetainingWallAnalysisInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalEmbeddedRetainingWallApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: EmbeddedRetainingWallAnalysisInput = { units: null };

void test("geotechnical embedded-retaining-wall application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalEmbeddedRetainingWallApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-embedded-retaining-walls");
  assert.equal(result.applicationId, application.id);
});
