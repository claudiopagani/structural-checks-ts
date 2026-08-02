import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeAction {
  readonly id: string;
  loadCase: RuntimeLoadCase | null;
  assignTo(loadCase: RuntimeLoadCase | null): RuntimeAction;
}

interface RuntimeLoad {
  readonly id: string;
  assignedTo: RuntimeLoadCase | null;
  assignTo(loadCase: RuntimeLoadCase): RuntimeLoad;
}

interface RuntimeLoadCase {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly action: RuntimeAction | null;
  readonly loads: RuntimeLoad[];
  readonly metadata: Record<string, unknown>;
  addLoad(load: RuntimeLoad): RuntimeLoadCase;
  toJSON(): unknown;
}

interface RuntimeCombination {
  readonly id: string;
  readonly name: string;
  readonly combinationType: string;
  readonly metadata: Record<string, unknown>;
  toJSON(): unknown;
}

interface RuntimeFactor {
  readonly loadCase: RuntimeLoadCase;
  readonly factor: number;
}

interface RuntimeLoadCombination extends RuntimeCombination {
  readonly factors: RuntimeFactor[];
  addFactor(loadCase: RuntimeLoadCase, factor: number): RuntimeLoadCombination;
  evaluate(loadResultsByCaseId?: Record<string, number>): number;
}

type RuntimeCombinationConstructor = new (options: unknown) => RuntimeCombination;
type RuntimeLoadCaseConstructor = new (options: unknown) => RuntimeLoadCase;
type RuntimeLoadCombinationConstructor = new (options: unknown) => RuntimeLoadCombination;

interface RuntimeAnalysisModule {
  readonly Combination: RuntimeCombinationConstructor;
  readonly LoadCase: RuntimeLoadCaseConstructor;
  readonly LoadCombination: RuntimeLoadCombinationConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConstructor(value: unknown): value is new (options: unknown) => unknown {
  return typeof value === "function";
}

function isRuntimeModule(value: unknown): value is RuntimeAnalysisModule {
  if (!isRecord(value)) return false;
  return (
    isConstructor(value.Combination) &&
    isConstructor(value.LoadCase) &&
    isConstructor(value.LoadCombination)
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function assertExactJson(source: unknown, typescript: unknown, label: string): void {
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: JSON`);

  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left === "string" && typeof right === "string") {
        assert.deepEqual(codePoints(left), codePoints(right), `${label}${valuePath}: Unicode`);
      }
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      if (!Array.isArray(left) || !Array.isArray(right)) return;
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      if (!isRecord(left) || !isRecord(right)) return;
      const keys = Object.keys(left);
      assert.deepEqual(keys, Object.keys(right), `${label}${valuePath}.keys`);
      keys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
    }
  };

  compare(source, typescript, "");
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

function makeAction(id: string): RuntimeAction {
  return {
    id,
    loadCase: null,
    assignTo(loadCase) {
      this.loadCase = loadCase;
      return this;
    },
  };
}

function makeLoad(id: string): RuntimeLoad {
  return {
    id,
    assignedTo: null,
    assignTo(loadCase) {
      this.assignedTo = loadCase;
      return this;
    },
  };
}

async function loadModules(): Promise<{
  source: RuntimeAnalysisModule;
  typescript: RuntimeAnalysisModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "analysis", "Combination.js")).href
  );
  const sourceLoadCaseModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "analysis", "LoadCase.js")).href
  );
  const sourceLoadCombinationModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "analysis", "LoadCombination.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "analysis", "Combination.js")).href
  );
  const typescriptLoadCaseModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "analysis", "LoadCase.js")).href
  );
  const typescriptLoadCombinationModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "analysis", "LoadCombination.js"))
      .href
  );

  const sourceRuntimeValue = {
    ...(isRecord(sourceModule) ? sourceModule : {}),
    ...(isRecord(sourceLoadCaseModule) ? sourceLoadCaseModule : {}),
    ...(isRecord(sourceLoadCombinationModule) ? sourceLoadCombinationModule : {}),
  };
  if (!isRuntimeModule(sourceRuntimeValue)) {
    throw new Error("The source analysis modules do not expose the expected constructors.");
  }

  const typescriptRuntimeValue = {
    ...(isRecord(typescriptModule) ? typescriptModule : {}),
    ...(isRecord(typescriptLoadCaseModule) ? typescriptLoadCaseModule : {}),
    ...(isRecord(typescriptLoadCombinationModule) ? typescriptLoadCombinationModule : {}),
  };
  if (!isRuntimeModule(typescriptRuntimeValue)) {
    throw new Error("The TypeScript analysis modules do not expose the expected constructors.");
  }

  return {
    source: sourceRuntimeValue,
    typescript: typescriptRuntimeValue,
  };
}

void test("domain analysis classes match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  assert.notEqual(source.Combination, typescript.Combination);
  assert.notEqual(source.LoadCase, typescript.LoadCase);
  assert.notEqual(source.LoadCombination, typescript.LoadCombination);

  assertErrorParity(
    () => new source.Combination({ id: "abstract" }),
    () => new typescript.Combination({ id: "abstract" }),
    "abstract combination",
  );
  assertErrorParity(
    () => new source.LoadCase({ id: "" }),
    () => new typescript.LoadCase({ id: "" }),
    "missing load case id",
  );
  assertErrorParity(
    () => new source.LoadCombination({ id: null }),
    () => new typescript.LoadCombination({ id: null }),
    "missing load combination id",
  );
  assertErrorParity(
    () => new source.LoadCase({ id: "invalid-load", loads: [{ id: "load" }] }),
    () => new typescript.LoadCase({ id: "invalid-load", loads: [{ id: "load" }] }),
    "unsupported load assignment",
  );

  const sourceAction = makeAction("azione-😀");
  const typescriptAction = makeAction("azione-😀");
  const sourceLoad = makeLoad("carico-Δ");
  const typescriptLoad = makeLoad("carico-Δ");
  const caseOptions = {
    id: "caso-α",
    name: "Caso d’azione",
    category: "variable",
    action: sourceAction,
    loads: [sourceLoad],
    metadata: { label: "azione italiana: è" },
  };
  const typescriptCaseOptions = {
    ...caseOptions,
    action: typescriptAction,
    loads: [typescriptLoad],
  };
  const sourceLoadCase = new source.LoadCase(caseOptions);
  const typescriptLoadCase = new typescript.LoadCase(typescriptCaseOptions);

  assert.equal(sourceAction.loadCase, sourceLoadCase);
  assert.equal(typescriptAction.loadCase, typescriptLoadCase);
  assert.equal(sourceLoad.assignedTo, sourceLoadCase);
  assert.equal(typescriptLoad.assignedTo, typescriptLoadCase);
  assertExactJson(sourceLoadCase.toJSON(), typescriptLoadCase.toJSON(), "load case");
  assert.equal(sourceLoadCase instanceof source.LoadCase, true);
  assert.equal(typescriptLoadCase instanceof typescript.LoadCase, true);
  assert.equal(sourceLoadCase instanceof typescript.LoadCase, false);

  const sourceCombination = new source.LoadCombination({
    id: "comb-🔒",
    name: "Combinazione",
    metadata: { note: "copia" },
  });
  const typescriptCombination = new typescript.LoadCombination({
    id: "comb-🔒",
    name: "Combinazione",
    metadata: { note: "copia" },
  });
  sourceCombination.addFactor(sourceLoadCase, 1.3).addFactor(sourceLoadCase, -0.2);
  typescriptCombination.addFactor(typescriptLoadCase, 1.3).addFactor(typescriptLoadCase, -0.2);

  assert.equal(sourceCombination instanceof source.Combination, true);
  assert.equal(typescriptCombination instanceof typescript.Combination, true);
  assert.equal(sourceCombination instanceof typescript.Combination, false);
  assert.equal(sourceCombination.evaluate({}), typescriptCombination.evaluate({}));
  assert.equal(
    sourceCombination.evaluate({ [sourceLoadCase.id]: 10 }),
    typescriptCombination.evaluate({ [typescriptLoadCase.id]: 10 }),
  );
  assertExactJson(sourceCombination.toJSON(), typescriptCombination.toJSON(), "load combination");

  const sourceMetadata = { label: "original" };
  const typescriptMetadata = { label: "original" };
  const sourceClone = new source.LoadCombination({ id: "clone", metadata: sourceMetadata });
  const typescriptClone = new typescript.LoadCombination({
    id: "clone",
    metadata: typescriptMetadata,
  });
  sourceMetadata.label = "mutated";
  typescriptMetadata.label = "mutated";
  assertExactJson(sourceClone.toJSON(), typescriptClone.toJSON(), "metadata clone");
});
