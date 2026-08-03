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
  readonly outputs?: JsonRecord;
}

interface RuntimeApplication {
  readonly id: string;
  readonly getManifest: () => unknown;
  readonly run: (input?: unknown) => RuntimeResult;
}

interface RuntimeRootModule extends JsonRecord {
  readonly SteelFrameApplication: new () => RuntimeApplication;
  readonly SteelRingFramePushoverModel: new (input: unknown) => unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.SteelFrameApplication === "function" &&
    typeof value.SteelRingFramePushoverModel === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing 0206 steel frame application root exports.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module)) {
    throw new Error("Missing built 0206 steel frame application root exports.");
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

function createPushoverModel(root: RuntimeRootModule, id: string): unknown {
  return new root.SteelRingFramePushoverModel({
    id,
    units: { force: "kN", length: "m" },
    geometry: { b: 0.9, h: 2.1 },
    memberSections: {
      columns: "IPE200",
      topBeam: "IPE200",
      bottomBeam: "IPE200",
    },
    material: "S275",
    baseCondition: "pinned-base-with-bottom-beam",
    solver: {
      controlIncrement: 0.002,
      maxDisplacement: 0.03,
      tolerance: 1e-6,
      maxIterations: 60,
      maxSteps: 60,
    },
  });
}

void test("0206 steel frame application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/steel-frames/SteelFrameApplication.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/SteelFrameApplication.js",
  );

  assert.notEqual(sourceDirect.SteelFrameApplication, typescriptDirect.SteelFrameApplication);
  assert.equal(typescriptRootModule.SteelFrameApplication, typescriptDirect.SteelFrameApplication);

  const sourceApplication = new sourceRootModule.SteelFrameApplication();
  const typescriptApplication = new typescriptRootModule.SteelFrameApplication();
  exactJson(sourceApplication.getManifest(), typescriptApplication.getManifest(), "manifest");

  exactJson(
    sourceApplication.run({ memberId: "member-λ", loadCombinations: [] }),
    typescriptApplication.run({ memberId: "member-λ", loadCombinations: [] }),
    "member verification placeholder",
  );
  exactJson(
    sourceApplication.run({ model: createPushoverModel(sourceRootModule, "ring-λ") }),
    typescriptApplication.run({ model: createPushoverModel(typescriptRootModule, "ring-λ") }),
    "ring-frame pushover",
  );
  exactJson(
    sourceApplication.run({ analysisType: "unsupported-λ", memberId: "member-λ" }),
    typescriptApplication.run({ analysisType: "unsupported-λ", memberId: "member-λ" }),
    "unsupported analysis type",
  );

  assertErrorParity(
    () => sourceApplication.run({ analysisType: "steel-ring-frame-pushover" }),
    () => typescriptApplication.run({ analysisType: "steel-ring-frame-pushover" }),
    "missing ring-frame model",
  );
});
