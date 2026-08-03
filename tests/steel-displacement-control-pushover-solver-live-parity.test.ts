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

interface RuntimeModule {
  readonly SteelDisplacementControlPushoverSolver2D: new (options?: unknown) => RuntimeSolver;
}

interface RuntimeSolver {
  readonly linearSolver: unknown;
  readonly internalForces: unknown;
  readonly nonlinearSolver: unknown;
  solve(options?: unknown): RuntimeResult;
}

interface RuntimeResult {
  points: unknown[];
  events: unknown[];
  finalState: unknown;
  finalEvaluation: unknown;
  finalDisplacements: number[];
  finalLoadFactor: number;
  warnings: string[];
  assumptions: string[];
  termination: Record<string, unknown>;
  freeDofIds: string[];
  restrainedDofIds: string[];
  kinematicReduction: unknown;
  hingeEvents: unknown[];
  hingeStatesByElementId: unknown;
}

interface RuntimeSolveOptions {
  readonly evaluator?: unknown;
  readonly cloneState?: unknown;
  readonly pointBuilder?: unknown;
  readonly model?: unknown;
}

interface RuntimeEvaluation {
  readonly internalForceVector: number[];
  readonly tangentStiffnessMatrix: number[][];
  readonly state: Record<string, unknown>;
  readonly events: unknown[];
}

interface RuntimeModel {
  readonly dofRegistry: {
    getIndex(node: unknown, dof: string): number;
  };
  readonly supports: readonly { readonly node: { readonly id: string } }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.SteelDisplacementControlPushoverSolver2D === "function";
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isModule(module)) {
    throw new Error(`The module ${relativePath} does not expose the pushover solver.`);
  }
  return module;
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Expected a serializable value.");
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

function isRuntimeEvaluation(value: unknown): value is RuntimeEvaluation {
  return (
    isRecord(value) &&
    Array.isArray(value.internalForceVector) &&
    Array.isArray(value.tangentStiffnessMatrix) &&
    isRecord(value.state) &&
    Array.isArray(value.events)
  );
}

function callEvaluator(evaluator: unknown, context: unknown): RuntimeEvaluation {
  if (typeof evaluator === "function") {
    const evaluation: unknown = Reflect.apply(evaluator, undefined, [context]);
    if (!isRuntimeEvaluation(evaluation)) {
      throw new Error("The synthetic evaluator returned an invalid result.");
    }
    return evaluation;
  }

  if (isRecord(evaluator)) {
    const evaluate: unknown = Reflect.get(evaluator, "evaluate");
    if (typeof evaluate !== "function") {
      throw new Error("The synthetic solver received no evaluator.");
    }
    const evaluation: unknown = Reflect.apply(evaluate, evaluator, [context]);
    if (!isRuntimeEvaluation(evaluation)) {
      throw new Error("The synthetic evaluator returned an invalid result.");
    }
    return evaluation;
  }

  throw new Error("The synthetic solver received no evaluator.");
}

function callFunction(functionLike: unknown, context: unknown): unknown {
  if (typeof functionLike !== "function") {
    throw new Error("The synthetic solver received no callback.");
  }
  return Reflect.apply(functionLike, undefined, [context]);
}

function callRecordFunction(functionLike: unknown, context: unknown): Record<string, unknown> {
  const result = callFunction(functionLike, context);
  if (!isRecord(result)) {
    throw new Error("The synthetic solver callback did not return a record.");
  }
  return result;
}

function createModel(): RuntimeModel {
  return {
    dofRegistry: {
      getIndex: (node, dof) => {
        if (!isRecord(node) || typeof node.id !== "string" || dof !== "ux") {
          throw new Error("Unexpected synthetic support DOF.");
        }
        return node.id === "A" ? 0 : 1;
      },
    },
    supports: [{ node: { id: "A" } }, { node: { id: "B" } }],
  };
}

function createInternalForces(): Record<string, unknown> {
  return {
    evaluate: () => ({
      internalForceVector: [3, -4],
      tangentStiffnessMatrix: [
        [8, 0],
        [0, 9],
      ],
      state: {
        "element-λ": {
          label: "stato-é",
          activeCount: () => 2,
          clone: () => ({ label: "stato-é", activeCount: () => 2 }),
        },
      },
      events: [{ type: "hinge-activation", label: "Cerniera λ" }],
    }),
  };
}

function createNonlinearSolver(model: RuntimeModel): Record<string, unknown> {
  return {
    solve: (options: RuntimeSolveOptions): RuntimeResult => {
      const context = {
        model,
        displacements: [0.01, 0.02],
        loadFactor: 0.5,
        controlDisplacement: 0.02,
        state: {},
        freeIndices: ["A.uy"],
        restrainedIndices: ["A.ux"],
        reducedDisplacements: [0.02],
        kinematicReduction: { reducedSize: 1 },
        step: 1,
        iterationCount: 2,
        evaluation: null,
      };
      const evaluation = callEvaluator(options.evaluator, context);
      const state = callFunction(options.cloneState, evaluation.state);
      const point = callRecordFunction(options.pointBuilder, {
        ...context,
        state,
        evaluation,
      });

      return {
        points: [{ step: 1, ...point }],
        events: evaluation.events,
        finalState: state,
        finalEvaluation: evaluation,
        finalDisplacements: [...context.displacements],
        finalLoadFactor: context.loadFactor,
        warnings: [],
        assumptions: ["synthetic"],
        termination: { reason: "synthetic", step: 1, iteration: 2 },
        freeDofIds: [...context.freeIndices],
        restrainedDofIds: [...context.restrainedIndices],
        kinematicReduction: context.kinematicReduction,
        hingeEvents: [],
        hingeStatesByElementId: null,
      };
    },
  };
}

void test("SteelDisplacementControlPushoverSolver2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelDisplacementControlPushoverSolver2D.js",
  );
  const typescript = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelDisplacementControlPushoverSolver2D.js",
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src/index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist/index.js")).href
  );

  assert.notEqual(
    source.SteelDisplacementControlPushoverSolver2D,
    typescript.SteelDisplacementControlPushoverSolver2D,
  );
  if (
    !isRecord(sourceRootModule) ||
    !isRecord(typescriptRootModule) ||
    typeof sourceRootModule.SteelDisplacementControlPushoverSolver2D !== "function" ||
    typeof typescriptRootModule.SteelDisplacementControlPushoverSolver2D !== "function"
  ) {
    throw new Error("The public roots do not expose the pushover solver.");
  }
  assert.equal(
    sourceRootModule.SteelDisplacementControlPushoverSolver2D,
    source.SteelDisplacementControlPushoverSolver2D,
  );
  assert.equal(
    typescriptRootModule.SteelDisplacementControlPushoverSolver2D,
    typescript.SteelDisplacementControlPushoverSolver2D,
  );
  assert.notEqual(
    sourceRootModule.SteelDisplacementControlPushoverSolver2D,
    typescriptRootModule.SteelDisplacementControlPushoverSolver2D,
  );
  assert.deepEqual(
    Object.getOwnPropertyNames(source.SteelDisplacementControlPushoverSolver2D.prototype),
    Object.getOwnPropertyNames(typescript.SteelDisplacementControlPushoverSolver2D.prototype),
    "prototype shape",
  );

  const sourceModel = createModel();
  const typescriptModel = createModel();
  const sourceSolver = new source.SteelDisplacementControlPushoverSolver2D({
    internalForces: createInternalForces(),
    nonlinearSolver: createNonlinearSolver(sourceModel),
  });
  const typescriptSolver = new typescript.SteelDisplacementControlPushoverSolver2D({
    internalForces: createInternalForces(),
    nonlinearSolver: createNonlinearSolver(typescriptModel),
  });
  const solveOptions = {
    frame: sourceModel,
    controlDisplacementIncrement: 0.002,
    maxControlDisplacement: 0.03,
    tolerance: 1e-6,
    maxIterations: 60,
    maxSteps: 60,
    yieldTolerance: 1e-9,
  };
  const sourceResult = sourceSolver.solve(solveOptions);
  const typescriptResult = typescriptSolver.solve({ ...solveOptions, frame: typescriptModel });

  exactJson(sourceResult, typescriptResult, "pushover solver result");
  assert.deepEqual(sourceResult.points, [{ step: 1, baseShear: 1, hingeCount: 2 }]);
  assert.equal(sourceResult.events, sourceResult.hingeEvents);
  assert.equal(sourceResult.finalState, sourceResult.hingeStatesByElementId);
  assert.equal(typescriptResult.events, typescriptResult.hingeEvents);
  assert.equal(typescriptResult.finalState, typescriptResult.hingeStatesByElementId);

  assertErrorParity(
    () => new source.SteelDisplacementControlPushoverSolver2D().solve(),
    () => new typescript.SteelDisplacementControlPushoverSolver2D().solve(),
    "missing model",
  );
});
