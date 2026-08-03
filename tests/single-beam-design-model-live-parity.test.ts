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

type RuntimeRecord = Record<string, unknown>;
type ModelLike = {
  id: unknown;
  title: unknown;
  toAnalysisInput: () => unknown;
  toJSON: () => unknown;
};
type ModelConstructor = new (input?: Record<string, unknown>) => ModelLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModelConstructor(value: unknown): value is ModelConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function captureError(construct: ModelConstructor, input?: Record<string, unknown>): unknown {
  try {
    new construct(input);
    return null;
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

void test("single-beam design model matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/models/SingleBeamDesignModel.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/models/SingleBeamDesignModel.js",
  );
  const sourceConstructor = sourceModule.SingleBeamDesignModel;
  const typescriptConstructor = typescriptModule.SingleBeamDesignModel;
  if (!isModelConstructor(sourceConstructor) || !isModelConstructor(typescriptConstructor)) {
    throw new Error("Expected both modules to export SingleBeamDesignModel.");
  }
  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.SingleBeamDesignModel, sourceConstructor, "source root alias");
  assert.equal(
    typescriptRootModule.SingleBeamDesignModel,
    typescriptConstructor,
    "TypeScript root alias",
  );

  const errorInputs: readonly [string, Record<string, unknown> | undefined][] = [
    ["missing input", undefined],
    ["missing id", { beamInput: {} }],
    ["empty id", { id: "", beamInput: {} }],
    ["missing beam input", { id: "beam" }],
  ];
  for (const [label, input] of errorInputs) {
    assert.deepEqual(
      captureError(typescriptConstructor, input),
      captureError(sourceConstructor, input),
      `${label}: exact error`,
    );
  }

  class DemoProvider {
    metadata = { label: "fornitore-è" };
  }
  class DemoElement {}
  class DemoSolver {}
  class DemoSection {
    toJSON(): Record<string, unknown> {
      return { type: "section-δ", area: 0.25 };
    }
  }
  class DemoVerifier {
    input = { check: "ULS-报告", value: 3 };
    metadata = { source: "verifier-α" };
  }
  const shared = { label: "shared-è" };
  const circular: Record<string, unknown> = { label: "cycle-报告" };
  circular.self = circular;
  const input: Record<string, unknown> = {
    id: "beam-δ-报告",
    title: null,
    description: "Descrizione à",
    units: { force: "kN", length: "m" },
    beamInput: {
      geometry: { span: 6 },
      units: { force: "kN", length: "m" },
      sectionProvider: new DemoProvider(),
      elementClass: DemoElement,
      linearSolver: new DemoSolver(),
      sharedFirst: shared,
      sharedSecond: shared,
      circular,
    },
    section: new DemoSection(),
    material: { name: "C25/30" },
    verification: new DemoVerifier(),
    report: { format: "json", label: "report-报告" },
    metadata: { category: "trave-è" },
  };

  const sourceModel = new sourceConstructor(input);
  const typescriptModel = new typescriptConstructor(input);
  assert.equal(typescriptModel.id, sourceModel.id, "id");
  assert.equal(typescriptModel.title, sourceModel.title, "default title");
  assert.deepEqual(
    typescriptModel.toAnalysisInput(),
    sourceModel.toAnalysisInput(),
    "analysis input",
  );
  const sourceJson = sourceModel.toJSON();
  const typescriptJson = typescriptModel.toJSON();
  if (!isRecord(sourceJson) || !isRecord(typescriptJson)) {
    throw new Error("Expected both models to serialize to records.");
  }
  assert.deepEqual(typescriptJson, sourceJson, "exact serialization");
  assert.equal(
    JSON.stringify(typescriptJson),
    JSON.stringify(sourceJson),
    "exact serialization JSON",
  );
  assert.deepEqual(
    Array.from(String(typescriptJson.id)),
    Array.from(String(sourceJson.id)),
    "Unicode id code points",
  );
});
