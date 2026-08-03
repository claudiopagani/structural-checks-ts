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

type RuntimeRecord = Record<string, unknown>;

interface RuntimeState {
  readonly start: unknown;
  readonly end: unknown;
  readonly history: unknown[];
  clone(): RuntimeState;
  isActiveAt(position: string): boolean;
  signAt(position: string): unknown;
  activeCount(): number;
  withActivation(position: string, sign: unknown, metadata?: Record<string, unknown>): RuntimeState;
  activationDelta(nextState?: RuntimeRecord | null): unknown[];
  toJSON(): RuntimeRecord;
}

interface RuntimeStateModule {
  readonly SteelPlasticHingeState: new (options?: unknown) => RuntimeState;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStateModule(value: unknown): value is RuntimeStateModule {
  return isRecord(value) && typeof value.SteelPlasticHingeState === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeStateModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isStateModule(module)) {
    throw new Error(`The module ${relativePath} does not expose SteelPlasticHingeState.`);
  }
  return module;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function assertExactValues(source: unknown, typescript: unknown, label: string): void {
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      assert.equal(left, right, `${label}${valuePath}: exact number`);
      return;
    }

    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left === "string" && typeof right === "string") {
        assert.equal(left, right, `${label}${valuePath}`);
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
      const leftKeys = Object.keys(left);
      assert.deepEqual(leftKeys, Object.keys(right), `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
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

function prototypeKeys(value: unknown): string[] {
  if (typeof value !== "function") throw new Error("Expected a class export.");
  return Object.getOwnPropertyNames(value.prototype);
}

void test("SteelPlasticHingeState matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelPlasticHingeState.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelPlasticHingeState.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(source.SteelPlasticHingeState, typescript.SteelPlasticHingeState);
  assert.equal(sourceRootModule.SteelPlasticHingeState, source.SteelPlasticHingeState);
  assert.equal(typescriptRootModule.SteelPlasticHingeState, typescript.SteelPlasticHingeState);
  assert.notEqual(
    sourceRootModule.SteelPlasticHingeState,
    typescriptRootModule.SteelPlasticHingeState,
  );
  assert.deepEqual(
    prototypeKeys(source.SteelPlasticHingeState),
    prototypeKeys(typescript.SteelPlasticHingeState),
    "prototype shape",
  );

  const fixtures: unknown[] = [
    undefined,
    {},
    { start: "positive", end: "negative", history: [{ label: "cerniera \u03bb", value: 2 }] },
    { start: 1, end: "-", history: ["legacy", null, 4] },
    { start: null, end: "+", history: [] },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const sourceState = new source.SteelPlasticHingeState(fixture);
    const typescriptState = new typescript.SteelPlasticHingeState(fixture);
    assert.equal(sourceState instanceof source.SteelPlasticHingeState, true);
    assert.equal(typescriptState instanceof typescript.SteelPlasticHingeState, true);
    assert.equal(sourceState instanceof typescript.SteelPlasticHingeState, false);
    assert.equal(typescriptState instanceof source.SteelPlasticHingeState, false);
    assertExactValues(sourceState.toJSON(), typescriptState.toJSON(), `fixture ${index}`);
    assert.equal(
      sourceState.activeCount(),
      typescriptState.activeCount(),
      `fixture ${index}: count`,
    );
    for (const position of ["start", "end", "other"]) {
      assert.equal(
        sourceState.signAt(position),
        typescriptState.signAt(position),
        `fixture ${index}: ${position} sign`,
      );
      assert.equal(
        sourceState.isActiveAt(position),
        typescriptState.isActiveAt(position),
        `fixture ${index}: ${position} active`,
      );
    }

    assertExactValues(
      sourceState.clone().toJSON(),
      typescriptState.clone().toJSON(),
      `fixture ${index}: clone`,
    );
  }

  const activationCases: readonly [string, unknown, Record<string, unknown>][] = [
    ["start", 1, { label: "inizio \u03bb", factor: 1.5 }],
    ["end", "-", { label: "fine \u00e9" }],
    ["other", "+", { custom: true }],
  ];
  for (const [index, [position, sign, metadata]] of activationCases.entries()) {
    const sourceState = new source.SteelPlasticHingeState({ history: [{ id: index }] });
    const typescriptState = new typescript.SteelPlasticHingeState({ history: [{ id: index }] });
    assertExactValues(
      sourceState.withActivation(position, sign, metadata).toJSON(),
      typescriptState.withActivation(position, sign, metadata).toJSON(),
      `activation ${index}`,
    );
  }

  const sourceActive = new source.SteelPlasticHingeState({ start: "+" });
  const typescriptActive = new typescript.SteelPlasticHingeState({ start: "+" });
  assertExactValues(
    sourceActive.withActivation("start", "-", { ignored: "because already active" }).toJSON(),
    typescriptActive.withActivation("start", "-", { ignored: "because already active" }).toJSON(),
    "duplicate activation",
  );
  assertExactValues(
    sourceActive.activationDelta({ start: "positive", end: "negative" }),
    typescriptActive.activationDelta({ start: "positive", end: "negative" }),
    "activation delta",
  );
  assertExactValues(
    sourceActive.activationDelta(null),
    typescriptActive.activationDelta(null),
    "null delta",
  );

  assertErrorParity(
    () => new source.SteelPlasticHingeState({ start: "unsupported" }),
    () => new typescript.SteelPlasticHingeState({ start: "unsupported" }),
    "unsupported constructor sign",
  );
  assertErrorParity(
    () => new source.SteelPlasticHingeState().withActivation("start", "unsupported"),
    () => new typescript.SteelPlasticHingeState().withActivation("start", "unsupported"),
    "unsupported activation sign",
  );
  assertErrorParity(
    () => new source.SteelPlasticHingeState({ start: Symbol("unsupported") }),
    () => new typescript.SteelPlasticHingeState({ start: Symbol("unsupported") }),
    "symbol constructor sign",
  );
});
