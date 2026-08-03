import assert from "node:assert/strict";
import test from "node:test";

import { BeamReportMarkdownRenderer } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BeamReportMarkdownRendererIsStrict = [
  AssertFalse<IsAny<typeof BeamReportMarkdownRenderer>>,
  AssertFalse<IsAny<InstanceType<typeof BeamReportMarkdownRenderer>>>,
];

function useBeamReportMarkdownDeclarations(
  value: BeamReportMarkdownRendererIsStrict | undefined,
): void {
  void value;
}

void test("beam report Markdown renderer exposes strict typed consumers", () => {
  useBeamReportMarkdownDeclarations(undefined);

  const renderer = new BeamReportMarkdownRenderer();
  assert.equal(typeof renderer.render, "function");
});
