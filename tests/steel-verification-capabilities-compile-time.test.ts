import assert from "node:assert/strict";
import test from "node:test";

import {
  getSteelVerificationCapabilities,
  type GetSteelVerificationCapabilitiesOptions,
  type SteelVerificationCapabilitiesResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelVerificationCapabilitiesAreStrict = AssertFalse<
  IsAny<typeof getSteelVerificationCapabilities | SteelVerificationCapabilitiesResult>
>;

function useSteelVerificationCapabilitiesDeclarations(
  options: GetSteelVerificationCapabilitiesOptions,
): SteelVerificationCapabilitiesResult {
  return getSteelVerificationCapabilities(options);
}

void test("steel verification capabilities expose a strict typed consumer contract", () => {
  const strictTypeProof: SteelVerificationCapabilitiesAreStrict = false;
  assert.equal(strictTypeProof, false);

  const result = useSteelVerificationCapabilitiesDeclarations({
    section: { family: "IPE", profileName: "IPE200" },
  });
  assert.equal(result.family, "IPE");
  assert.equal(result.checks.classification?.status, "supported");
});
