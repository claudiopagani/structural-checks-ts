import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalShallowFoundationApplication,
  type GeotechnicalShallowFoundationApplicationInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalShallowFoundationApplication>>,
  AssertFalse<IsAny<GeotechnicalShallowFoundationApplicationInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalShallowFoundationApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: GeotechnicalShallowFoundationApplicationInput = {
  units: { force: "kN", length: "m" },
};

void test("geotechnical shallow-foundation application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalShallowFoundationApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-shallow-foundations");
  assert.equal(result.applicationId, application.id);
});
