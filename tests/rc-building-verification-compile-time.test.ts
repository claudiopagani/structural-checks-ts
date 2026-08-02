// Compile-time consumer coverage for the public RC-building orchestration contract.

import assert from "node:assert/strict";
import test from "node:test";

import type {
  RcBuildingVerificationInput,
  RcBuildingVerificationOutputs,
  RcMemberVerifier,
  RcMemberVerifierInput,
} from "../dist/index.js";

const memberVerifier: RcMemberVerifier = (input: RcMemberVerifierInput) => ({
  status: "not-verified",
  checks: [
    {
      id: `member-${input.member.id}`,
      ok: false,
    },
  ],
});

const typedInput: RcBuildingVerificationInput = {
  memberVerifiers: {
    beam: memberVerifier,
  },
};

function consumeTypedOutputs(outputs: RcBuildingVerificationOutputs): number {
  return outputs.checkCount + outputs.members.count + outputs.foundationSystems.count;
}

void test("RC-building public contracts expose typed input, callbacks and outputs", () => {
  assert.equal(typeof typedInput.memberVerifiers?.beam, "function");
  assert.equal(typeof consumeTypedOutputs, "function");
});
