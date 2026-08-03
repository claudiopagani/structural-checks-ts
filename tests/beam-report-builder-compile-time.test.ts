import assert from "node:assert/strict";
import test from "node:test";

import { BeamReportBuilder } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BeamReportBuilderIsStrict = [
  AssertFalse<IsAny<typeof BeamReportBuilder>>,
  AssertFalse<IsAny<InstanceType<typeof BeamReportBuilder>>>,
];

function useBeamReportBuilderDeclarations(value: BeamReportBuilderIsStrict | undefined): void {
  void value;
}

void test("beam report builder exposes strict typed consumers", () => {
  useBeamReportBuilderDeclarations(undefined);

  const builder = new BeamReportBuilder({ metadata: { source: "compile-time" } });
  assert.equal(typeof builder.build, "function");
  assert.equal(typeof builder.buildJson, "function");
  assert.equal(typeof builder.buildMarkdown, "function");
});
