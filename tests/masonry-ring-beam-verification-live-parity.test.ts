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
type RuntimeVerificationConstructor = new (input?: unknown) => unknown;

interface RootRuntimeModule extends RuntimeModule {
  MasonryRingBeamVerification: RuntimeVerificationConstructor;
}

interface RuntimeVerification extends RuntimeModule {
  verify: (input?: unknown) => unknown;
}

interface RuntimeResult {
  toJSON: () => unknown;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return isRecord(value) && typeof value.MasonryRingBeamVerification === "function";
}

function isRuntimeVerification(value: unknown): value is RuntimeVerification {
  return isRecord(value) && typeof value.verify === "function";
}

function isRuntimeResult(value: unknown): value is RuntimeResult {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    typeof value.toJSON === "function"
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

void test("masonry ring beam verification matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  if (!isRootRuntimeModule(sourceModuleValue) || !isRootRuntimeModule(typescriptModuleValue)) {
    throw new Error("Masonry ring beam verification exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryRingBeamVerification,
    typescriptModuleValue.MasonryRingBeamVerification,
    "ring beam verification independent implementation",
  );

  const fixtures: Record<
    string,
    { options?: Record<string, unknown>; input?: Record<string, unknown> }
  > = {
    defaults: {},
    explicit: {
      options: { code: "Circolare 2019", metadata: { label: "cerchiatura — explicit" } },
      input: { openingId: "opening-μ" },
    },
    nullOpening: {
      options: { code: "NTC2018", metadata: { source: "catalogo" } },
      input: { openingId: null },
    },
  };

  for (const [label, fixture] of Object.entries(fixtures)) {
    const sourceVerification = new sourceModuleValue.MasonryRingBeamVerification(fixture.options);
    const typescriptVerification = new typescriptModuleValue.MasonryRingBeamVerification(
      fixture.options,
    );
    if (
      !isRuntimeVerification(sourceVerification) ||
      !isRuntimeVerification(typescriptVerification)
    ) {
      throw new Error("Ring beam verification instances do not expose verify().");
    }
    const sourceResult = sourceVerification.verify(fixture.input);
    const typescriptResult = typescriptVerification.verify(fixture.input);
    if (!isRuntimeResult(sourceResult) || !isRuntimeResult(typescriptResult)) {
      throw new Error("Ring beam verification results do not expose toJSON().");
    }
    assertExactParity(sourceResult.toJSON(), typescriptResult.toJSON(), `${label} verification`);
  }
});
