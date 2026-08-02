import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
type RecordValue = Record<string, unknown>;

interface RuntimeModel {
  id: string;
  name: string;
  materials: unknown[];
  nodes: unknown[];
  elements: unknown[];
  supports: unknown[];
  loadCases: unknown[];
  loadCombinations: unknown[];
  metadata: RecordValue;
  addMaterial(value: unknown): RuntimeModel;
  addNode(value: unknown): RuntimeModel;
  addElement(value: unknown): RuntimeModel;
  addSupport(value: unknown): RuntimeModel;
  addLoadCase(value: unknown): RuntimeModel;
  addLoadCombination(value: unknown): RuntimeModel;
  summary(): RecordValue;
}

interface RuntimeModule {
  StructuralModel: new (options?: RecordValue) => RuntimeModel;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "StructuralModel") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function compare(sourceValue: unknown, typescriptValue: unknown): void {
  assert.deepEqual(typescriptValue, sourceValue);
  assert.equal(JSON.stringify(typescriptValue), JSON.stringify(sourceValue));
  assert.deepEqual([...JSON.stringify(typescriptValue)], [...JSON.stringify(sourceValue)]);
}

function errorDetails(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    return { name: Object.prototype.toString.call(error), message: String(error) };
  }
  throw new Error("Expected the StructuralModel parity callback to throw.");
}

function snapshot(model: RuntimeModel): RecordValue {
  return {
    id: model.id,
    name: model.name,
    materials: model.materials,
    nodes: model.nodes,
    elements: model.elements,
    supports: model.supports,
    loadCases: model.loadCases,
    loadCombinations: model.loadCombinations,
    metadata: model.metadata,
    summary: model.summary(),
  };
}

void test("StructuralModel matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceUnknown: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptUnknown: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceUnknown) || !isRuntimeModule(typescriptUnknown)) {
    throw new Error("StructuralModel is not exposed by both runtime APIs.");
  }
  assert.notEqual(sourceUnknown.StructuralModel, typescriptUnknown.StructuralModel);

  const options = {
    id: "modello-Δ",
    name: "Modello Δ",
    materials: [{ id: "materiale-α", label: "acciaio" }],
    nodes: [{ id: "nodo-β", x: 0 }],
    elements: [{ id: "elemento-γ", nodeIds: ["nodo-β"] }],
    supports: [{ id: "vincolo-δ", dofs: ["ux", "uy"] }],
    loadCases: [{ id: "caso-ε", loads: ["carico-ζ"] }],
    loadCombinations: [{ id: "combinazione-η", factors: { "caso-ε": 1.5 } }],
    metadata: { descrizione: "verifica μ" },
  };
  const sourceModel = new sourceUnknown.StructuralModel(options);
  const typescriptModel = new typescriptUnknown.StructuralModel(options);
  compare(snapshot(sourceModel), snapshot(typescriptModel));

  const additions = [
    ["addMaterial", { id: "materiale-θ" }],
    ["addNode", { id: "nodo-ι" }],
    ["addElement", { id: "elemento-κ" }],
    ["addSupport", { id: "vincolo-λ" }],
    ["addLoadCase", { id: "caso-μ" }],
    ["addLoadCombination", { id: "combinazione-ν" }],
  ] as const;
  for (const [method, value] of additions) {
    const sourceReturn = sourceModel[method](value);
    const typescriptReturn = typescriptModel[method](value);
    assert.equal(sourceReturn, sourceModel);
    assert.equal(typescriptReturn, typescriptModel);
  }
  compare(snapshot(sourceModel), snapshot(typescriptModel));
  compare(
    errorDetails(() => new sourceUnknown.StructuralModel({})),
    errorDetails(() => new typescriptUnknown.StructuralModel({})),
  );
  compare(
    errorDetails(() => new sourceUnknown.StructuralModel()),
    errorDetails(() => new typescriptUnknown.StructuralModel()),
  );
});
