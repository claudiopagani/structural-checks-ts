import assert from "node:assert/strict";
import test from "node:test";

import { createBeamReportArtifacts } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BeamReportArtifactsAreStrict = [
  AssertFalse<IsAny<typeof createBeamReportArtifacts>>,
  AssertFalse<IsAny<ReturnType<typeof createBeamReportArtifacts>>>,
];

function useBeamReportArtifactDeclarations(value: BeamReportArtifactsAreStrict | undefined): void {
  void value;
}

void test("beam report artifact factory exposes strict typed consumers", () => {
  useBeamReportArtifactDeclarations(undefined);

  const artifacts = createBeamReportArtifacts({
    json: {
      id: "trave-δ-報告",
      title: "Trave in legno",
      schemaVersion: "beam-report/v1",
      analysis: { maxMoment: 12.5 },
    },
    markdown: "# Trave in legno",
  });

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0]?.format, "json");
  assert.equal(artifacts[1]?.format, "markdown");
});
