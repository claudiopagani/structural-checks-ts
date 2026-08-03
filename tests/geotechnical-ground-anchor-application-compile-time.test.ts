import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalGroundAnchorApplication,
  type GroundAnchorAnalysisOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalGroundAnchorApplication>>,
  AssertFalse<IsAny<GroundAnchorAnalysisOptions>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalGroundAnchorApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: GroundAnchorAnalysisOptions = { units: { force: "kN", length: "m" } };

void test("geotechnical ground-anchor application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalGroundAnchorApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-ground-anchors");
  assert.equal(result.applicationId, application.id);
});
