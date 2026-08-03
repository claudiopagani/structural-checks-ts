import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type JsonRecord = Record<string, unknown>;

interface RuntimeApplication {
  getManifest(): JsonRecord;
  run(input?: unknown): JsonRecord;
}

interface RuntimeModule extends JsonRecord {
  readonly TimberBeamApplication: new () => RuntimeApplication;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.TimberBeamApplication === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeModule(module)) {
    throw new Error("Missing TimberBeamApplication root export.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(module)) {
    throw new Error("Missing built TimberBeamApplication root export.");
  }
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<JsonRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`Missing direct export in ${relativePath}.`);
  }
  return module;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
}

void test("0210 TimberBeamApplication matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/timber-beams/TimberBeamApplication.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/timber-beams/TimberBeamApplication.js",
  );

  assert.notEqual(sourceDirect.TimberBeamApplication, typescriptDirect.TimberBeamApplication);
  assert.equal(typescriptRootModule.TimberBeamApplication, typescriptDirect.TimberBeamApplication);

  const sourceApplication = new sourceRootModule.TimberBeamApplication();
  const typescriptApplication = new typescriptRootModule.TimberBeamApplication();
  exactJson(sourceApplication, typescriptApplication, "application instance");
  exactJson(sourceApplication.getManifest(), typescriptApplication.getManifest(), "manifest");
  exactJson(
    sourceApplication.run({ model: { id: "timber-beam-λ" } }),
    typescriptApplication.run({ model: { id: "timber-beam-λ" } }),
    "missing-input placeholder result",
  );
  exactJson(sourceApplication.run(), typescriptApplication.run(), "default run");
});
