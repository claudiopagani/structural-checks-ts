import assert from "node:assert/strict";
import test from "node:test";

import {
  GeotechnicalLateralPileApplication,
  type GeotechnicalLateralPileApplicationInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof GeotechnicalLateralPileApplication>>,
  AssertFalse<IsAny<GeotechnicalLateralPileApplicationInput>>,
  AssertFalse<IsAny<ReturnType<GeotechnicalLateralPileApplication["run"]>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const input: GeotechnicalLateralPileApplicationInput = {
  units: { force: "kN", length: "m" },
};

void test("geotechnical lateral-pile application exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const application = new GeotechnicalLateralPileApplication();
  const result = application.run(input);

  assert.equal(application.id, "geotechnical-lateral-piles");
  assert.equal(result.applicationId, application.id);
});
