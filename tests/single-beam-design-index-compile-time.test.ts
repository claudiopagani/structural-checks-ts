import assert from "node:assert/strict";
import test from "node:test";

import {
  BEAM_REPORT_SCHEMA_VERSION,
  BeamReportBuilder,
  BeamReportMarkdownRenderer,
  SingleBeamDesignApplication,
  SingleBeamDesignModel,
  createBeamReportArtifacts,
  validateBeamReportDto,
} from "../dist/applications/single-beam-design/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SingleBeamDesignIndexIsStrict = [
  AssertFalse<IsAny<typeof BEAM_REPORT_SCHEMA_VERSION>>,
  AssertFalse<IsAny<typeof BeamReportBuilder>>,
  AssertFalse<IsAny<typeof BeamReportMarkdownRenderer>>,
  AssertFalse<IsAny<typeof SingleBeamDesignApplication>>,
  AssertFalse<IsAny<typeof SingleBeamDesignModel>>,
  AssertFalse<IsAny<typeof createBeamReportArtifacts>>,
  AssertFalse<IsAny<typeof validateBeamReportDto>>,
];

function useSingleBeamDesignIndexDeclarations(
  value: SingleBeamDesignIndexIsStrict | undefined,
): void {
  void value;
}

void test("single-beam design index exposes strict typed consumers", () => {
  useSingleBeamDesignIndexDeclarations(undefined);
  assert.equal(BEAM_REPORT_SCHEMA_VERSION, "beam-report/v1");
  assert.equal(typeof BeamReportBuilder, "function");
  assert.equal(typeof BeamReportMarkdownRenderer, "function");
  assert.equal(typeof SingleBeamDesignApplication, "function");
  assert.equal(typeof SingleBeamDesignModel, "function");
  assert.equal(typeof createBeamReportArtifacts, "function");
  assert.equal(typeof validateBeamReportDto, "function");
});
