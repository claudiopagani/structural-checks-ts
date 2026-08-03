import assert from "node:assert/strict";
import test from "node:test";

import { MicropileBromsAnalysis } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type MicropileBromsAnalysisIsStrict = [
  AssertFalse<IsAny<typeof MicropileBromsAnalysis>>,
  AssertFalse<IsAny<InstanceType<typeof MicropileBromsAnalysis>>>,
];

function useMicropileBromsAnalysisDeclarations(
  value: MicropileBromsAnalysisIsStrict | undefined,
): void {
  void value;
}

void test("Micropile Broms analysis exposes strict typed consumers", () => {
  useMicropileBromsAnalysisDeclarations(undefined);
  const analysis = new MicropileBromsAnalysis({ metadata: { source: "consumer" } });
  assert.equal(typeof analysis.analyze, "function");
  assert.equal(analysis.metadata.source, "consumer");
});
