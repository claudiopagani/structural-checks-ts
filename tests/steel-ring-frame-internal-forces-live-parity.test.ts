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

interface RuntimeHingeState {
  withActivation(
    position: string,
    sign: unknown,
    metadata?: Record<string, unknown>,
  ): RuntimeHingeState;
  toJSON(): unknown;
}

interface RuntimeDofRegistry {
  size(): number;
  getIndex(dofId: string): number;
}

interface RuntimeElementResponse {
  hingeState: RuntimeHingeState;
  newActivations: readonly { position: string; sign: unknown }[];
  localEndForces: readonly number[];
  globalEndForces: readonly number[];
  plasticRotations: readonly number[];
  tangentGlobalStiffness: number[][];
}

interface RuntimeElement {
  readonly id: string;
  readonly metadata: { readonly role?: unknown } | null;
  evaluate(options: {
    globalDisplacements: readonly number[];
    dofRegistry: RuntimeDofRegistry;
    hingeState: RuntimeHingeState;
    yieldTolerance: number;
  }): RuntimeElementResponse;
  getDofIds(dofRegistry: RuntimeDofRegistry): readonly string[];
  plasticMomentCapacity(position: string): number;
}

interface RuntimeHingeEvent {
  position: string;
  sign: unknown;
  elementId: string;
  role: unknown;
  plasticMoment: number;
}

interface RuntimeElementResult {
  elementId: string;
  role: unknown;
  localEndForces: number[];
  globalEndForces: number[];
  plasticRotations: number[];
  hingeState: unknown;
}

interface RuntimeResult {
  internalForceVector: number[];
  tangentStiffnessMatrix: number[][];
  state: Record<string, RuntimeHingeState>;
  events: RuntimeHingeEvent[];
  responses: RuntimeElementResult[];
  hingeStatesByElementId: Record<string, RuntimeHingeState>;
  hingeEvents: RuntimeHingeEvent[];
  elementResponses: RuntimeElementResult[];
}

interface RuntimeFrame {
  readonly dofRegistry: RuntimeDofRegistry;
  readonly elements: readonly RuntimeElement[];
}

interface RuntimeInternalForces {
  evaluate(options?: unknown): RuntimeResult;
}

interface RuntimeModule {
  readonly SteelRingFrameInternalForces: new (options?: unknown) => RuntimeInternalForces;
}

interface Fixture {
  frame: RuntimeFrame;
  displacements: number[];
  hingeStatesByElementId: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.SteelRingFrameInternalForces === "function";
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isModule(module)) {
    throw new Error(`The module ${relativePath} does not expose internal forces.`);
  }
  return module;
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Expected a serializable value.");
  }
  return serialized;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = json(source);
  const typescriptJson = json(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(codePoints(typescriptJson), codePoints(sourceJson), `${label}: Unicode`);
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

function createFixture(): Fixture {
  const dofIds = ["A.ux", "A.uy", "A.rz", "B.ux", "B.uy", "B.rz"];
  const dofRegistry: RuntimeDofRegistry = {
    size: () => dofIds.length,
    getIndex: (dofId) => {
      const index = dofIds.indexOf(dofId);
      if (index < 0) throw new Error(`Unknown test DOF: ${dofId}.`);
      return index;
    },
  };

  const createElement = (
    id: string,
    role: string | null,
    dofNames: readonly string[],
    globalEndForces: readonly number[],
    tangentGlobalStiffness: number[][],
    activations: readonly { position: string; sign: unknown }[],
  ): RuntimeElement => ({
    id,
    metadata: role === null ? null : { role },
    evaluate: ({ hingeState }) => ({
      hingeState:
        activations.length === 0
          ? hingeState
          : hingeState.withActivation("end", "negative", { label: "Cerniera λ" }),
      newActivations: activations,
      localEndForces: [...globalEndForces],
      globalEndForces: [...globalEndForces],
      plasticRotations: activations.length === 0 ? [] : [0.001, -0.002],
      tangentGlobalStiffness,
    }),
    getDofIds: () => dofNames,
    plasticMomentCapacity: (position) => (position === "end" ? 250 : 200),
  });

  return {
    frame: {
      dofRegistry,
      elements: [
        createElement(
          "column-A",
          "montante-λ",
          ["A.ux", "A.uy"],
          [1.25, -2.5],
          [
            [10, 1],
            [1, 20],
          ],
          [{ position: "end", sign: "negative" }],
        ),
        createElement(
          "beam-B",
          null,
          ["A.uy", "B.uy"],
          [3.5, 4.5],
          [
            [2, 0.5],
            [0.5, 4],
          ],
          [],
        ),
      ],
    },
    displacements: [0.1, -0.2, 0.003, 0.4, -0.5, 0.006],
    hingeStatesByElementId: {
      "column-A": { start: "positive", history: [{ label: "origine-é" }] },
    },
  };
}

void test("SteelRingFrameInternalForces matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelRingFrameInternalForces.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelRingFrameInternalForces.js",
  );

  assert.notEqual(source.SteelRingFrameInternalForces, typescript.SteelRingFrameInternalForces);
  assert.deepEqual(
    prototypeKeys(source.SteelRingFrameInternalForces),
    prototypeKeys(typescript.SteelRingFrameInternalForces),
    "prototype shape",
  );

  const sourceFixture = createFixture();
  const typescriptFixture = createFixture();
  const sourceInternalForces = new source.SteelRingFrameInternalForces();
  const typescriptInternalForces = new typescript.SteelRingFrameInternalForces();
  const sourceResult = sourceInternalForces.evaluate({
    frame: sourceFixture.frame,
    displacements: sourceFixture.displacements,
    hingeStatesByElementId: sourceFixture.hingeStatesByElementId,
    yieldTolerance: 0.25,
  });
  const typescriptResult = typescriptInternalForces.evaluate({
    frame: typescriptFixture.frame,
    displacements: typescriptFixture.displacements,
    hingeStatesByElementId: typescriptFixture.hingeStatesByElementId,
    yieldTolerance: 0.25,
  });

  exactJson(sourceResult, typescriptResult, "assembled internal forces");
  assert.deepEqual(sourceResult.internalForceVector, [1.25, 1, 0, 0, 4.5, 0]);
  assert.deepEqual(sourceResult.tangentStiffnessMatrix, [
    [10, 1, 0, 0, 0, 0],
    [1, 22, 0, 0, 0.5, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
    [0, 0.5, 0, 0, 4, 0],
    [0, 0, 0, 0, 0, 0],
  ]);
  assert.equal(sourceResult.state, sourceResult.hingeStatesByElementId);
  assert.equal(sourceResult.events, sourceResult.hingeEvents);
  assert.equal(sourceResult.responses, sourceResult.elementResponses);
  assert.equal(typescriptResult.state, typescriptResult.hingeStatesByElementId);
  assert.equal(typescriptResult.events, typescriptResult.hingeEvents);
  assert.equal(typescriptResult.responses, typescriptResult.elementResponses);

  const sourceStateOverride = sourceInternalForces.evaluate({
    frame: sourceFixture.frame,
    displacements: sourceFixture.displacements,
    state: { "column-A": { start: "negative" } },
    hingeStatesByElementId: { "column-A": { start: "positive" } },
  });
  const typescriptStateOverride = typescriptInternalForces.evaluate({
    frame: typescriptFixture.frame,
    displacements: typescriptFixture.displacements,
    state: { "column-A": { start: "negative" } },
    hingeStatesByElementId: { "column-A": { start: "positive" } },
  });
  exactJson(sourceStateOverride, typescriptStateOverride, "state override");

  assertErrorParity(
    () => sourceInternalForces.evaluate(),
    () => typescriptInternalForces.evaluate(),
    "missing frame",
  );
  assertErrorParity(
    () =>
      sourceInternalForces.evaluate({
        frame: { dofRegistry: { size: () => 0, getIndex: () => 0 }, elements: [] },
        displacements: [],
      }),
    () =>
      typescriptInternalForces.evaluate({
        frame: { dofRegistry: { size: () => 0, getIndex: () => 0 }, elements: [] },
        displacements: [],
      }),
    "empty DOF registry",
  );
  assertErrorParity(
    () =>
      sourceInternalForces.evaluate({
        frame: sourceFixture.frame,
        displacements: [0, 0],
      }),
    () =>
      typescriptInternalForces.evaluate({
        frame: typescriptFixture.frame,
        displacements: [0, 0],
      }),
    "displacement length",
  );
});
