import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import * as TypeScriptApi from "../dist/index.js";
// @ts-expect-error Node's strip-types test runner executes this source fixture directly.
import * as Fixture from "./fixtures/globalFemBuildingFixture.ts";

const { configureCompleteRcBuildingFixture, createGlobalFemBuildingFixture } = Fixture;

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const corpusRevision = "41da3faa489600173106935bbcf726119300e48d";
const sliceIds = [
  "0028-global-fem-shared-contracts",
  "0029-global-fem-result-mapping-contract-set",
  "0030-global-fem-concurrent-demand-and-axis-projection",
  "0031-global-fem-classification-demand-readiness-postprocessing",
  "0032-ntc2018-rc-building-kernels",
  "0033-rc-building-coverage-design-basis-orchestration",
  "0034-rc-building-verification-application-and-producer-conformance",
  "0035-rc-building-closure-audit",
];
const requiredExports = [
  "RcBuildingVerificationApplication",
  "GlobalFemPostProcessingApplication",
  "validateGlobalFemContractSet",
  "collectConcurrentMemberActionStates",
  "projectMemberActionStatesToResistanceAxes",
  "NTC2018_CAPACITY_DESIGN_REFERENCES",
  "createNTC2018StructuralBehavior",
  "createDisplacementAssessment",
  "getNTC2018RcBuildingCoverage",
  "auditNTC2018RcDesignBasis",
  "runWallSystemVerifications",
  "runSlabSystemVerifications",
  "runFoundationSystemVerifications",
];

const repositoryRoot = path.resolve(import.meta.dirname, "..");

interface SliceManifest {
  sliceId: string;
  implementationStatus: string;
  source: { revision: string };
  normativeCorpusRevision: string;
  normativeReferences: { normativeConformityClaimed: boolean };
  targetTests?: string[];
}

void test("RC-building closure keeps exports, manifests, provenance and documentation aligned", async () => {
  for (const exportName of requiredExports) {
    assert.ok(Object.hasOwn(TypeScriptApi, exportName), `Missing public export: ${exportName}`);
  }

  for (const sliceId of sliceIds) {
    const manifestPath = path.join(repositoryRoot, "migration", "slices", `${sliceId}.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown as SliceManifest;
    assert.equal(manifest.sliceId, sliceId);
    assert.equal(manifest.implementationStatus, "implemented");
    assert.equal(manifest.source.revision, sourceRevision);
    assert.equal(manifest.normativeCorpusRevision, corpusRevision);
    assert.equal(manifest.normativeReferences.normativeConformityClaimed, false);
    for (const testPath of manifest.targetTests ?? []) {
      await access(path.join(repositoryRoot, testPath));
    }
  }

  const status = await readFile(path.join(repositoryRoot, "docs", "migration-status.md"), "utf8");
  const boundary = await readFile(
    path.join(repositoryRoot, "docs", "rc-building-verification.md"),
    "utf8",
  );
  assert.match(status, /## Implemented slice 0035/);
  assert.match(boundary, /does not contain a FEM solver/);
  assert.match(boundary, /normativeConformityClaimed.*false/);
});

void test("RC-building closure retains the complete numerical and serialized fixture oracle", () => {
  const fixture = configureCompleteRcBuildingFixture(
    createGlobalFemBuildingFixture(),
  ) as unknown as Record<string, unknown>;
  const result = new TypeScriptApi.RcBuildingVerificationApplication().run(fixture);
  const coverage = TypeScriptApi.getNTC2018RcBuildingCoverage() as unknown as {
    declaredScopeImplementationCoverageComplete: boolean;
    normativeConformityClaimed: boolean;
  };

  assert.equal(coverage.declaredScopeImplementationCoverageComplete, true);
  assert.equal(coverage.normativeConformityClaimed, false);
  assert.equal(result.status, TypeScriptApi.RESULT_STATUS.OK);
  const completeness = result.outputs.completeness as { complete: boolean };
  const metadata = result.metadata as { normativeConformityClaimed: boolean };
  assert.equal(completeness.complete, true);
  assert.equal(metadata.normativeConformityClaimed, false);
  const serializedResult = JSON.parse(JSON.stringify(result)) as unknown;
  assert.deepEqual(serializedResult, { ...result });

  const q = TypeScriptApi.createNTC2018StructuralBehavior({
    behavior: "cd-b",
    structuralType: "frame",
    regularity: { elevation: "regular" },
    frameStoreyCount: 3,
    frameBayCount: 2,
  } as unknown as Parameters<typeof TypeScriptApi.createNTC2018StructuralBehavior>[0]);
  assert.ok(Math.abs(q.q - 3.9) < 1e-12);
  assert.equal(TypeScriptApi.NTC2018_DRIFT_LIMITS["rigidly-connected-fragile"], 0.005);
});
