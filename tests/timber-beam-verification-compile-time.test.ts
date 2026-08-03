import assert from "node:assert/strict";
import test from "node:test";

import {
  TimberBeamVerification,
  type TimberBeamVerificationInput,
  type TimberBeamVerificationOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const options: TimberBeamVerificationOptions = {
  code: "NTC2018",
  gammaM: 1.5,
  deflectionLimitDenominator: 300,
  stability: { lateralTorsionalBuckling: { enabled: false } },
  metadata: { label: String.fromCodePoint(0x3bb) },
};

const input: TimberBeamVerificationInput = {
  beamId: "timber-beam-compile-time",
  section: null,
  material: null,
  analysisResult: null,
};

type VerifierIsStrict = AssertFalse<IsAny<typeof TimberBeamVerification>>;
type OptionsAreStrict = AssertFalse<IsAny<TimberBeamVerificationOptions>>;
type InputIsStrict = AssertFalse<IsAny<TimberBeamVerificationInput>>;

void test("TimberBeamVerification exposes a strict consumer contract", () => {
  const verifierStrictProof: VerifierIsStrict = false;
  const optionsStrictProof: OptionsAreStrict = false;
  const inputStrictProof: InputIsStrict = false;
  const result = new TimberBeamVerification(options).verify(input);

  assert.equal(verifierStrictProof, false);
  assert.equal(optionsStrictProof, false);
  assert.equal(inputStrictProof, false);
  assert.equal(result.applicationId, "timber-beams");
  assert.equal(result.status, "not-implemented");
});
