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

interface RuntimeResult {
  readonly toJSON?: () => unknown;
}

interface RuntimeApplication {
  readonly id: string;
  readonly getManifest: () => unknown;
  readonly run: (input?: unknown) => RuntimeResult;
}

interface RuntimeRootModule extends JsonRecord {
  readonly MasonryWallOpeningsApplication: new (options?: unknown) => RuntimeApplication;
  readonly MasonryWallOpeningsModel: new (input: unknown) => unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.MasonryWallOpeningsApplication === "function" &&
    typeof value.MasonryWallOpeningsModel === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing 0205 masonry wall-opening application root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built 0205 masonry wall-opening application root exports.");
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

function serialize(value: unknown): unknown {
  if (isRecord(value) && typeof value.toJSON === "function") {
    return Reflect.apply(value.toJSON, value, []);
  }
  return value;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(serialize(source));
  const typescriptJson = JSON.stringify(serialize(typescript));
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

function createAlignment(root: RuntimeRootModule, id: string): unknown {
  const units = { force: "N", length: "m" };
  const lambda = String.fromCodePoint(0x3bb);
  return new root.MasonryWallOpeningsModel({
    id,
    label: `Allineamento ${lambda}`,
    units,
    walls: [
      {
        id: `wall-${lambda}`,
        length: 1.2,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 4e5,
          fv0: 0,
          E: 1.8e9,
          G: 6e8,
          density: 18000,
          units,
        },
        verticalLineLoad: { G1: 5000 },
      },
    ],
  });
}

function runMode(root: RuntimeRootModule, mode: string, id: string): RuntimeResult {
  return new root.MasonryWallOpeningsApplication().run({
    model: createAlignment(root, id),
    id,
    mode,
    options: mode === "equivalent-frame-pushover" ? { controlPointCount: 12 } : {},
  });
}

void test("0205 application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/MasonryWallOpeningsApplication.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/MasonryWallOpeningsApplication.js",
  );

  assert.notEqual(
    sourceDirect.MasonryWallOpeningsApplication,
    typescriptDirect.MasonryWallOpeningsApplication,
  );
  assert.equal(
    typescriptRootModule.MasonryWallOpeningsApplication,
    typescriptDirect.MasonryWallOpeningsApplication,
  );

  const sourceApplication = new sourceRootModule.MasonryWallOpeningsApplication();
  const typescriptApplication = new typescriptRootModule.MasonryWallOpeningsApplication();
  exactJson(sourceApplication.getManifest(), typescriptApplication.getManifest(), "manifest");

  for (const mode of [
    "sanitize-only",
    "extract-equivalent-frame-members",
    "equivalent-frame-linear",
    "static",
    "seismic-aggregated",
    "equivalent-frame-pushover",
    "compare",
    "unsupported-λ",
  ]) {
    exactJson(
      runMode(sourceRootModule, mode, `application-${mode}-λ`),
      runMode(typescriptRootModule, mode, `application-${mode}-λ`),
      `mode ${mode}`,
    );
  }

  assertErrorParity(
    () => new sourceRootModule.MasonryWallOpeningsApplication().run(),
    () => new typescriptRootModule.MasonryWallOpeningsApplication().run(),
    "missing model id",
  );
  assertErrorParity(
    () =>
      new sourceRootModule.MasonryWallOpeningsApplication().run({
        id: "application-invalid",
        units: { force: "N", length: "m" },
        walls: [],
      }),
    () =>
      new typescriptRootModule.MasonryWallOpeningsApplication().run({
        id: "application-invalid",
        units: { force: "N", length: "m" },
        walls: [],
      }),
    "empty walls",
  );
});
