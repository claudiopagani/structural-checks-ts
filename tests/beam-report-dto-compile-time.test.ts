import assert from "node:assert/strict";
import test from "node:test";

import {
  BEAM_REPORT_SCHEMA_VERSION,
  validateBeamReportDto,
  type BeamReportDto,
  type BeamReportValidationResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BeamReportDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof BEAM_REPORT_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof validateBeamReportDto>>,
  AssertFalse<IsAny<BeamReportDto>>,
  AssertFalse<IsAny<BeamReportValidationResult>>,
];

function useBeamReportDeclarations(value: BeamReportDeclarationsAreStrict | undefined): void {
  void value;
}

void test("beam report DTO declarations expose strict typed consumers", () => {
  useBeamReportDeclarations(undefined);

  const validation: BeamReportValidationResult = validateBeamReportDto(null);
  assert.equal(BEAM_REPORT_SCHEMA_VERSION, "beam-report/v1");
  assert.equal(validation.ok, false);
  assert.equal(validation.schemaVersion, null);
  assert.deepEqual(validation.errors, ["report must be an object."]);
});
