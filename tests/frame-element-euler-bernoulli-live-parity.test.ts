import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const units = { force: "kN", length: "m" };

interface RuntimeNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface RuntimeDofRegistry {
  registerNodes(nodes: readonly RuntimeNode[]): RuntimeDofRegistry;
}

interface RuntimeElement {
  readonly id: string;
  readonly type: string;
  readonly startNode: RuntimeNode;
  readonly endNode: RuntimeNode;
  localStiffness(): number[][];
  globalStiffness(): number[][];
  directionCosines(): { length: number; c: number; s: number };
  localEndForces(displacements: number[], dofRegistry: RuntimeDofRegistry): number[];
  sampleInternalForces(input: {
    displacements: number[];
    dofRegistry?: RuntimeDofRegistry;
    loads?: readonly unknown[];
    stations?: readonly number[];
  }): unknown[];
  equivalentNodalLoadVector(input?: { loads?: readonly unknown[] }): number[];
  toJSON(): Record<string, unknown>;
}

interface RuntimeResult {
  readonly dofRegistry: RuntimeDofRegistry;
  readonly dofIds: string[];
  readonly freeDofIds: string[];
  readonly constrainedDofIds: string[];
  readonly displacements: number[];
  readonly displacementByDof: Record<string, number>;
  readonly displacementByNode: Record<string, Record<string, number>>;
  readonly reactions: number[];
  readonly reactionByDof: Record<string, number>;
  readonly reactionByNode: Record<string, Record<string, number>>;
  readonly internalForceVector: number[];
  readonly stiffnessMatrix: number[][];
  readonly loadVector: number[];
  readonly reducedSystem: unknown;
  readonly kinematicReduction: unknown;
  readonly assembly: { readonly elementAssemblies: unknown };
}

interface RuntimeApi {
  readonly FrameElement2DEulerBernoulli: new (options: Record<string, unknown>) => RuntimeElement;
  readonly LinearStaticSolver2D: new () => {
    solve(model: Record<string, unknown>): RuntimeResult;
  };
  readonly NodalLoad: new (options: Record<string, unknown>) => Record<string, unknown>;
  readonly DistributedLoad: new (options: Record<string, unknown>) => Record<string, unknown>;
  readonly Node: new (options: Record<string, unknown>) => RuntimeNode;
  readonly Support: new (options: Record<string, unknown>) => Record<string, unknown>;
  readonly DofRegistry: new () => RuntimeDofRegistry;
}

interface ErrorSnapshot {
  readonly name: string;
  readonly message: string;
}

interface PinnedCases {
  readonly localStiffness: number[][];
  readonly horizontalGlobalStiffness: number[][];
  readonly verticalDirection: { length: number; c: number; s: number };
  readonly verticalGlobalStiffness: number[][];
  readonly cantilever: {
    result: Record<string, unknown>;
    localEndForces: number[];
  };
  readonly uniformLoad: {
    result: Record<string, unknown>;
    samples: unknown[];
  };
  readonly taperedLoadError: ErrorSnapshot;
  readonly missingIdError: ErrorSnapshot;
  readonly missingStartNodeError: ErrorSnapshot;
  readonly zeroLengthError: ErrorSnapshot;
  readonly missingDofRegistryError: ErrorSnapshot;
  readonly unicodeJson: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeApi(value: unknown): value is RuntimeApi {
  if (!isRecord(value)) return false;
  return [
    "FrameElement2DEulerBernoulli",
    "LinearStaticSolver2D",
    "NodalLoad",
    "DistributedLoad",
    "Node",
    "Support",
    "DofRegistry",
  ].every((name) => typeof value[name] === "function");
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function errorSnapshot(callback: () => unknown): ErrorSnapshot {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function createNode(api: RuntimeApi, id: string, x = 0, y = 0): RuntimeNode {
  return new api.Node({ id, x, y, units });
}

function createElement(
  api: RuntimeApi,
  options: Partial<{
    id: string;
    startNode: RuntimeNode;
    endNode: RuntimeNode;
    axialRigidity: number;
    flexuralRigidity: number;
  }> = {},
): RuntimeElement {
  return new api.FrameElement2DEulerBernoulli({
    id: options.id ?? "frame",
    startNode: options.startNode ?? createNode(api, "A"),
    endNode: options.endNode ?? createNode(api, "B", 2),
    axialRigidity: options.axialRigidity ?? 1_000,
    flexuralRigidity: options.flexuralRigidity ?? 500,
  });
}

function resultSnapshot(result: RuntimeResult): Record<string, unknown> {
  return {
    dofIds: result.dofIds,
    freeDofIds: result.freeDofIds,
    constrainedDofIds: result.constrainedDofIds,
    displacements: result.displacements,
    displacementByDof: result.displacementByDof,
    displacementByNode: result.displacementByNode,
    reactions: result.reactions,
    reactionByDof: result.reactionByDof,
    reactionByNode: result.reactionByNode,
    internalForceVector: result.internalForceVector,
    stiffnessMatrix: result.stiffnessMatrix,
    loadVector: result.loadVector,
    reducedSystem: result.reducedSystem,
    kinematicReduction: result.kinematicReduction,
    elementAssemblies: result.assembly.elementAssemblies,
  };
}

function runPinnedCases(api: RuntimeApi): PinnedCases {
  const element = createElement(api);
  const localStiffness = element.localStiffness();
  const horizontalGlobalStiffness = element.globalStiffness();

  const verticalElement = createElement(api, {
    startNode: createNode(api, "A"),
    endNode: createNode(api, "B", 0, 2),
  });

  const fixedNode = createNode(api, "A");
  const freeNode = createNode(api, "B", 2);
  const cantileverElement = createElement(api, {
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 10_000,
    flexuralRigidity: 500,
  });
  const cantileverSupport = new api.Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const cantileverLoad = new api.NodalLoad({
    node: freeNode,
    components: { fy: -10 },
    units,
  });
  const cantileverResult = new api.LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [cantileverElement],
    supports: [cantileverSupport],
    nodalLoads: [cantileverLoad],
  });

  const cantileverLocalEndForces = cantileverElement.localEndForces(
    cantileverResult.displacements,
    cantileverResult.dofRegistry,
  );

  const nodeA = createNode(api, "A");
  const nodeB = createNode(api, "B", 4);
  const uniformElement = createElement(api, {
    startNode: nodeA,
    endNode: nodeB,
    axialRigidity: 10_000,
    flexuralRigidity: 1_000,
  });
  const uniformSupports = [
    new api.Support({
      id: "pin-A",
      node: nodeA,
      restraints: { ux: true, uy: true },
    }),
    new api.Support({
      id: "roller-B",
      node: nodeB,
      restraints: { uy: true },
    }),
  ];
  const uniformLoad = new api.DistributedLoad({
    id: "q",
    element: uniformElement,
    startValue: -2,
    direction: "y",
    units,
  });
  const uniformResult = new api.LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB],
    elements: [uniformElement],
    supports: uniformSupports,
    loads: [uniformLoad],
  });
  const uniformSamples = uniformElement.sampleInternalForces({
    displacements: uniformResult.displacements,
    dofRegistry: uniformResult.dofRegistry,
    loads: [uniformLoad],
    stations: [0, 2, 4],
  });

  const taperedElement = createElement(api);
  const taperedLoad = new api.DistributedLoad({
    id: "trapezoid",
    element: taperedElement,
    startValue: -2,
    endValue: -4,
    direction: "y",
    units,
  });

  const zeroLengthElement = createElement(api, {
    startNode: createNode(api, "A"),
    endNode: createNode(api, "B"),
  });

  const unicodeElement = new api.FrameElement2DEulerBernoulli({
    id: "frame-α",
    startNode: createNode(api, "A-β"),
    endNode: createNode(api, "B-γ", 2),
    axialRigidity: 1_000,
    flexuralRigidity: 500,
    metadata: { label: "asse Δ — δοκιμή", source: "strutture-js" },
  });

  return {
    localStiffness,
    horizontalGlobalStiffness,
    verticalDirection: verticalElement.directionCosines(),
    verticalGlobalStiffness: verticalElement.globalStiffness(),
    cantilever: {
      result: resultSnapshot(cantileverResult),
      localEndForces: cantileverLocalEndForces,
    },
    uniformLoad: {
      result: resultSnapshot(uniformResult),
      samples: uniformSamples,
    },
    taperedLoadError: errorSnapshot(() =>
      taperedElement.equivalentNodalLoadVector({ loads: [taperedLoad] }),
    ),
    missingIdError: errorSnapshot(() => new api.FrameElement2DEulerBernoulli({})),
    missingStartNodeError: errorSnapshot(
      () =>
        new api.FrameElement2DEulerBernoulli({
          id: "invalid",
          endNode: createNode(api, "B", 1),
        }),
    ),
    zeroLengthError: errorSnapshot(() => zeroLengthElement.directionCosines()),
    missingDofRegistryError: errorSnapshot(() =>
      element.sampleInternalForces({ displacements: [0, 0, 0, 0, 0, 0] }),
    ),
    unicodeJson: unicodeElement.toJSON(),
  };
}

function assertApprox(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function matrixValue(matrix: number[][], row: number, column: number): number {
  const value = matrix[row]?.[column];
  assert.equal(typeof value, "number");
  return value as number;
}

function nodeValue(
  values: Record<string, Record<string, number>>,
  nodeId: string,
  dof: string,
): number {
  const value = values[nodeId]?.[dof];
  assert.equal(typeof value, "number");
  return value as number;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) as number);
}

const sourceModuleUnknown: unknown = await import(
  pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
);
const typescriptModuleUnknown: unknown = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
);

if (!isRuntimeApi(sourceModuleUnknown) || !isRuntimeApi(typescriptModuleUnknown)) {
  throw new Error("Euler-Bernoulli FEM modules do not expose the expected API.");
}

void test("FrameElement2DEulerBernoulli matches the pinned source test and closed-form cases", () => {
  assertSourceBaseline();
  assert.notEqual(
    sourceModuleUnknown.FrameElement2DEulerBernoulli,
    typescriptModuleUnknown.FrameElement2DEulerBernoulli,
  );

  const sourceCases = runPinnedCases(sourceModuleUnknown);
  const typescriptCases = runPinnedCases(typescriptModuleUnknown);

  assert.deepEqual(typescriptCases, sourceCases);
  assert.equal(JSON.stringify(typescriptCases), JSON.stringify(sourceCases));

  assertApprox(matrixValue(sourceCases.localStiffness, 0, 0), 500);
  assertApprox(matrixValue(sourceCases.localStiffness, 0, 3), -500);
  assertApprox(matrixValue(sourceCases.localStiffness, 1, 1), 750);
  assertApprox(matrixValue(sourceCases.localStiffness, 1, 2), 750);
  assertApprox(matrixValue(sourceCases.localStiffness, 2, 2), 1_000);
  assertApprox(matrixValue(sourceCases.localStiffness, 2, 5), 500);
  assertApprox(matrixValue(sourceCases.localStiffness, 4, 4), 750);
  assertApprox(matrixValue(sourceCases.localStiffness, 5, 5), 1_000);
  for (let row = 0; row < sourceCases.localStiffness.length; row += 1) {
    for (let column = 0; column < sourceCases.localStiffness.length; column += 1) {
      assertApprox(
        matrixValue(sourceCases.localStiffness, row, column),
        matrixValue(sourceCases.localStiffness, column, row),
      );
    }
  }

  assert.deepEqual(sourceCases.horizontalGlobalStiffness, sourceCases.localStiffness);
  assertApprox(sourceCases.verticalDirection.c, 0);
  assertApprox(sourceCases.verticalDirection.s, 1);
  assertApprox(matrixValue(sourceCases.verticalGlobalStiffness, 1, 1), 500);
  assertApprox(matrixValue(sourceCases.verticalGlobalStiffness, 1, 4), -500);
  assertApprox(matrixValue(sourceCases.verticalGlobalStiffness, 4, 1), -500);
  assertApprox(matrixValue(sourceCases.verticalGlobalStiffness, 4, 4), 500);

  assertApprox(
    nodeValue(
      sourceCases.cantilever.result.displacementByNode as Record<string, Record<string, number>>,
      "B",
      "uy",
    ),
    (-10 * 2 ** 3) / (3 * 500),
  );
  assertApprox(
    nodeValue(
      sourceCases.cantilever.result.displacementByNode as Record<string, Record<string, number>>,
      "B",
      "rz",
    ),
    (-10 * 2 ** 2) / (2 * 500),
  );
  assertApprox(
    nodeValue(
      sourceCases.cantilever.result.reactionByNode as Record<string, Record<string, number>>,
      "A",
      "uy",
    ),
    10,
  );
  assertApprox(
    nodeValue(
      sourceCases.cantilever.result.reactionByNode as Record<string, Record<string, number>>,
      "A",
      "rz",
    ),
    20,
  );
  assert.deepEqual(sourceCases.cantilever.localEndForces, [0, 10, 20, 0, -10, 0]);

  const uniformReactions = sourceCases.uniformLoad.result.reactionByNode as Record<
    string,
    Record<string, number>
  >;
  assertApprox(nodeValue(uniformReactions, "A", "uy"), 4);
  assertApprox(nodeValue(uniformReactions, "B", "uy"), 4);
  assertApprox(nodeValue(uniformReactions, "A", "rz"), 0);
  assertApprox(nodeValue(uniformReactions, "B", "rz"), 0);
  const samples = sourceCases.uniformLoad.samples as Array<Record<string, number>>;
  assertApprox(samples[0]?.shearForce as number, 4);
  assertApprox(samples[1]?.shearForce as number, 0);
  assertApprox(samples[2]?.shearForce as number, -4);
  assertApprox(samples[0]?.bendingMoment as number, 0);
  assertApprox(samples[1]?.bendingMoment as number, 4);
  assertApprox(samples[2]?.bendingMoment as number, 0);

  assert.equal(sourceCases.taperedLoadError.name, "Error");
  assert.match(sourceCases.taperedLoadError.message, /tapered distributed loads/i);
  assert.equal(sourceCases.missingIdError.name, "Error");
  assert.equal(sourceCases.missingStartNodeError.name, "Error");
  assert.equal(sourceCases.zeroLengthError.name, "Error");
  assert.equal(sourceCases.missingDofRegistryError.name, "Error");

  const sourceUnicodeLabel = sourceCases.unicodeJson.metadata;
  assert.ok(isRecord(sourceUnicodeLabel));
  assert.equal(typeof sourceUnicodeLabel.label, "string");
  assert.deepEqual(
    codePoints(sourceUnicodeLabel.label as string),
    [97, 115, 115, 101, 32, 916, 32, 8212, 32, 948, 959, 954, 953, 956, 942],
  );
});
