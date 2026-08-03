import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeModule = Record<string, unknown>;

interface RuntimeApplication extends RuntimeModule {
  getManifest: () => unknown;
}

type RuntimeModel = RuntimeModule;

interface RuntimeResult {
  toJSON: () => unknown;
}

interface RuntimeVerification extends RuntimeModule {
  verify: () => RuntimeResult;
}

interface RuntimeIndex extends RuntimeModule {
  MasonryRingBeamApplication: new () => RuntimeApplication;
  MasonryRingBeamModel: new (input: unknown) => RuntimeModel;
  MasonryRingBeamVerification: new (input?: unknown) => RuntimeVerification;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeIndex(value: unknown): value is RuntimeIndex {
  return (
    isRecord(value) &&
    typeof value.MasonryRingBeamApplication === "function" &&
    typeof value.MasonryRingBeamModel === "function" &&
    typeof value.MasonryRingBeamVerification === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

void test("masonry ring beam sub-index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(sourceRoot, "src/applications/masonry-ring-beams/index.js");
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-ring-beams/index.js",
  );
  if (!isRuntimeIndex(sourceModule) || !isRuntimeIndex(typescriptModule)) {
    throw new Error("Masonry ring beam sub-index does not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptModule).sort(),
    Object.keys(sourceModule).sort(),
    "sub-index export names",
  );
  for (const exportName of Object.keys(sourceModule)) {
    assert.equal(
      typeof typescriptModule[exportName],
      typeof sourceModule[exportName],
      `${exportName} export type`,
    );
    assert.notEqual(
      typescriptModule[exportName],
      sourceModule[exportName],
      `${exportName} independent implementation`,
    );
  }

  const sourceSummary = {
    application: new sourceModule.MasonryRingBeamApplication().getManifest(),
    model: { ...new sourceModule.MasonryRingBeamModel({ id: "index-μ" }) },
    verification: new sourceModule.MasonryRingBeamVerification().verify().toJSON(),
  };
  const typescriptSummary = {
    application: new typescriptModule.MasonryRingBeamApplication().getManifest(),
    model: { ...new typescriptModule.MasonryRingBeamModel({ id: "index-μ" }) },
    verification: new typescriptModule.MasonryRingBeamVerification().verify().toJSON(),
  };
  assertExactParity(sourceSummary, typescriptSummary, "sub-index behavior");
});
