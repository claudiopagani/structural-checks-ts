import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { DofRegistry } from "../dist/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSolver {
  solve(options: Record<string, unknown>): Record<string, unknown>;
}

interface RuntimeModule {
  DisplacementControlNonlinearStaticSolver2D: new () => RuntimeSolver;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "DisplacementControlNonlinearStaticSolver2D") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
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

function createModel(): Record<string, unknown> {
  const dofRegistry = new DofRegistry({ dofsPerNode: ["ux"] }).registerNode("spring-1");
  return {
    dofRegistry,
    supports: [],
    referenceLoadVector: [1],
    controlVector: [1],
  };
}

function createEvaluator(): (context: Record<string, unknown>) => Record<string, unknown> {
  return (context) => {
    const displacements: unknown = Reflect.get(context, "displacements");
    if (!isUnknownArray(displacements)) {
      throw new Error("The parity evaluator requires a displacement vector.");
    }
    const displacement = displacements[0];
    if (typeof displacement !== "number") {
      throw new Error("The parity evaluator requires a numeric displacement.");
    }
    const state = Reflect.get(context, "state");
    const yielded = isRecord(state) && state.yielded === true;
    const trialForce = 10 * displacement;
    const shouldYield = Math.abs(trialForce) >= 5;
    const sign =
      Math.sign(trialForce) || (isRecord(state) && typeof state.sign === "number" ? state.sign : 1);
    const nextState: { yielded: boolean; sign: number | null } =
      yielded || shouldYield ? { yielded: true, sign } : { yielded: false, sign: null };
    const internalForce = nextState.yielded ? (nextState.sign ?? 1) * 5 : trialForce;
    return {
      internalForceVector: [internalForce],
      tangentStiffnessMatrix: nextState.yielded ? [[0]] : [[10]],
      state: nextState,
      events: !yielded && nextState.yielded ? [{ type: "yield", label: "snervamento α" }] : [],
    };
  };
}

void test("DisplacementControlNonlinearStaticSolver2D matches the pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Displacement-control solver exports do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.DisplacementControlNonlinearStaticSolver2D,
    typescriptModuleValue.DisplacementControlNonlinearStaticSolver2D,
  );
  const options: Record<string, unknown> = {
    model: createModel(),
    initialState: { yielded: false, sign: null },
    controlDisplacementIncrement: 0.1,
    maxControlDisplacement: 1,
    tolerance: 1e-9,
    maxIterations: 10,
    maxSteps: 20,
    evaluator: createEvaluator(),
    pointBuilder: ({ controlDisplacement }: Record<string, unknown>) => ({
      label: `δ=${String(controlDisplacement)}`,
    }),
  };
  const sourceResult = new sourceModuleValue.DisplacementControlNonlinearStaticSolver2D().solve(
    options,
  );
  const typescriptResult =
    new typescriptModuleValue.DisplacementControlNonlinearStaticSolver2D().solve(options);

  assert.deepEqual(typescriptResult, sourceResult);
  assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult));
  const typeScriptEvents: unknown = Reflect.get(typescriptResult, "events");
  const typeScriptPoints: unknown = Reflect.get(typescriptResult, "points");
  assert.ok(isUnknownArray(typeScriptEvents) && typeScriptEvents.length > 0);
  assert.ok(isUnknownArray(typeScriptPoints));
  const finalPoint = typeScriptPoints.at(-1);
  assert.ok(isRecord(finalPoint));
  if (typeof finalPoint.label !== "string") {
    throw new Error("The parity point did not preserve its Unicode label.");
  }
  assert.equal(finalPoint.label.includes("δ="), true);

  const sourceError = errorSnapshot(() =>
    new sourceModuleValue.DisplacementControlNonlinearStaticSolver2D().solve({
      model: createModel(),
      controlDisplacementIncrement: 0.1,
      maxControlDisplacement: 1,
    }),
  );
  const typescriptError = errorSnapshot(() =>
    new typescriptModuleValue.DisplacementControlNonlinearStaticSolver2D().solve({
      model: createModel(),
      controlDisplacementIncrement: 0.1,
      maxControlDisplacement: 1,
    }),
  );
  assert.deepEqual(typescriptError, sourceError);
});
