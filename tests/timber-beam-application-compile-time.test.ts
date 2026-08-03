import assert from "node:assert/strict";
import test from "node:test";

import {
  TimberBeamApplication,
  type TimberBeamApplicationInput,
  type TimberBeamApplicationModel,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const model: TimberBeamApplicationModel = {
  id: "timber-application-compile-time",
  section: null,
  material: null,
  analysisResult: null,
};

const input: TimberBeamApplicationInput = {
  code: "NTC2018",
  model,
  stability: { lateralTorsionalBuckling: { enabled: false } },
  metadata: { label: String.fromCodePoint(0x3bb) },
};

type ApplicationIsStrict = AssertFalse<IsAny<typeof TimberBeamApplication>>;
type InputIsStrict = AssertFalse<IsAny<TimberBeamApplicationInput>>;
type ModelIsStrict = AssertFalse<IsAny<TimberBeamApplicationModel>>;

void test("TimberBeamApplication exposes a strict typed consumer contract", () => {
  const applicationStrictProof: ApplicationIsStrict = false;
  const inputStrictProof: InputIsStrict = false;
  const modelStrictProof: ModelIsStrict = false;
  const application = new TimberBeamApplication();
  const result = application.run(input);

  assert.equal(applicationStrictProof, false);
  assert.equal(inputStrictProof, false);
  assert.equal(modelStrictProof, false);
  assert.equal(result.applicationId, "timber-beams");
  assert.equal(result.status, "not-implemented");
});
