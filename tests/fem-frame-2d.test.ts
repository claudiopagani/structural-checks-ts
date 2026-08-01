import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  DistributedLoad,
  DofRegistry,
  FemAssembler2D,
  FrameElement2DEulerBernoulli,
  KinematicConstraintReducer2D,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  PointLoad,
  Support,
  type LinearStaticResult2D,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "kN", length: "m" } as const;

const { stdout: revisionOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "rev-parse",
  "HEAD",
]);
const { stdout: statusOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "status",
  "--porcelain",
]);
assert.equal(revisionOutput.trim(), expectedRevision);
assert.equal(
  statusOutput.trim(),
  "",
  "FEM compatibility tests require a clean JavaScript baseline.",
);

const baselineApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = baselineApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

interface FemApi {
  DistributedLoad: typeof DistributedLoad;
  DofRegistry: typeof DofRegistry;
  FemAssembler2D: typeof FemAssembler2D;
  FrameElement2DEulerBernoulli: typeof FrameElement2DEulerBernoulli;
  KinematicConstraintReducer2D: typeof KinematicConstraintReducer2D;
  LinearStaticSolver2D: typeof LinearStaticSolver2D;
  NodalLoad: typeof NodalLoad;
  Node: typeof Node;
  PointLoad: typeof PointLoad;
  Support: typeof Support;
}

const typescriptApi: FemApi = {
  DistributedLoad,
  DofRegistry,
  FemAssembler2D,
  FrameElement2DEulerBernoulli,
  KinematicConstraintReducer2D,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  PointLoad,
  Support,
};
const javascriptApi: FemApi = {
  DistributedLoad: baselineExport("DistributedLoad"),
  DofRegistry: baselineExport("DofRegistry"),
  FemAssembler2D: baselineExport("FemAssembler2D"),
  FrameElement2DEulerBernoulli: baselineExport("FrameElement2DEulerBernoulli"),
  KinematicConstraintReducer2D: baselineExport("KinematicConstraintReducer2D"),
  LinearStaticSolver2D: baselineExport("LinearStaticSolver2D"),
  NodalLoad: baselineExport("NodalLoad"),
  Node: baselineExport("Node"),
  PointLoad: baselineExport("PointLoad"),
  Support: baselineExport("Support"),
};

function approx(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function nodeValue(
  values: Record<string, Record<string, number>>,
  nodeId: string,
  dof: string,
): number {
  const value = values[nodeId]?.[dof];
  assert.notEqual(value, undefined, `${nodeId}.${dof} is unavailable.`);
  return value as number;
}

function normalizedResult(result: LinearStaticResult2D): Record<string, unknown> {
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

function createCantilever(api: FemApi): {
  result: LinearStaticResult2D;
  samples: ReturnType<InstanceType<typeof FrameElement2DEulerBernoulli>["sampleInternalForces"]>;
} {
  const length = 4;
  const fixedNode = new api.Node({ id: "A", units });
  const freeNode = new api.Node({ id: "B", x: length, units });
  const element = new api.FrameElement2DEulerBernoulli({
    id: "beam",
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 10_000,
    flexuralRigidity: 1_000,
  });
  const support = new api.Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new api.DistributedLoad({
    id: "q",
    element,
    startValue: -2,
    direction: "y",
    units,
  });
  const result = new api.LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    loads: [load],
  });

  return {
    result,
    samples: element.sampleInternalForces({
      displacements: result.displacements,
      dofRegistry: result.dofRegistry,
      loads: [load],
      stations: [0, length],
    }),
  };
}

function createSimplySupportedBeam(api: FemApi): {
  result: LinearStaticResult2D;
  samples: ReturnType<InstanceType<typeof FrameElement2DEulerBernoulli>["sampleInternalForces"]>;
} {
  const length = 4;
  const nodeA = new api.Node({ id: "A", units });
  const nodeC = new api.Node({ id: "C", x: length / 2, units });
  const nodeB = new api.Node({ id: "B", x: length, units });
  const leftElement = new api.FrameElement2DEulerBernoulli({
    id: "left",
    startNode: nodeA,
    endNode: nodeC,
    axialRigidity: 10_000,
    flexuralRigidity: 1_000,
  });
  const rightElement = new api.FrameElement2DEulerBernoulli({
    id: "right",
    startNode: nodeC,
    endNode: nodeB,
    axialRigidity: 10_000,
    flexuralRigidity: 1_000,
  });
  const supports = [
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
  const load = new api.NodalLoad({
    id: "P",
    node: nodeC,
    components: { fy: -12 },
    units,
  });
  const result = new api.LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeC, nodeB],
    elements: [leftElement, rightElement],
    supports,
    nodalLoads: [load],
  });

  return {
    result,
    samples: leftElement.sampleInternalForces({
      displacements: result.displacements,
      dofRegistry: result.dofRegistry,
      stations: [0, length / 2],
    }),
  };
}

function createFixedFixedBeam(api: FemApi): {
  result: LinearStaticResult2D;
  samples: ReturnType<InstanceType<typeof FrameElement2DEulerBernoulli>["sampleInternalForces"]>;
} {
  const length = 4;
  const nodeA = new api.Node({ id: "A", units });
  const nodeB = new api.Node({ id: "B", x: length, units });
  const element = new api.FrameElement2DEulerBernoulli({
    id: "beam",
    startNode: nodeA,
    endNode: nodeB,
    axialRigidity: 10_000,
    flexuralRigidity: 1_000,
  });
  const supports = [
    new api.Support({
      id: "fixed-A",
      node: nodeA,
      restraints: { ux: true, uy: true, rz: true },
    }),
    new api.Support({
      id: "fixed-B",
      node: nodeB,
      restraints: { ux: true, uy: true, rz: true },
    }),
  ];
  const load = new api.DistributedLoad({
    id: "q",
    element,
    startValue: -2,
    direction: "y",
    units,
  });
  const result = new api.LinearStaticSolver2D().solve({
    nodes: [nodeA, nodeB],
    elements: [element],
    supports,
    loads: [load],
  });

  return {
    result,
    samples: element.sampleInternalForces({
      displacements: result.displacements,
      dofRegistry: result.dofRegistry,
      loads: [load],
      stations: [0, length / 2, length],
    }),
  };
}

void test("node, support, and point-load DTOs match the live baseline", () => {
  const createDtos = (api: FemApi): unknown[] => {
    const node = new api.Node({
      id: "N",
      x: 1500,
      y: -500,
      units: { force: "N", length: "mm" },
      metadata: { source: "fixture" },
    });
    const support = new api.Support({
      id: "S",
      node,
      restraints: { ux: true, rz: true },
      springStiffness: { uy: 250 },
    });
    const load = new api.PointLoad({
      id: "P",
      target: node,
      direction: "global",
      components: { fx: 3, fy: 4, mz: 5 },
      units,
    });

    return [node.toJSON(), support.toJSON(), load.toJSON()];
  };

  assert.deepEqual(createDtos(typescriptApi), createDtos(javascriptApi));
});

void test("DOF registration and element-load indexing preserve baseline behavior", () => {
  const createAssembly = (api: FemApi) => {
    const nodeA = new api.Node({ id: "A", units });
    const nodeB = new api.Node({ id: "B", x: 1, units });
    const element = {
      id: "shared",
      nodes: [nodeA, nodeB],
      getDofIds(registry: InstanceType<typeof DofRegistry>): string[] {
        return [registry.getDofId(nodeA, "ux"), registry.getDofId(nodeB, "ux")];
      },
      globalStiffness(): number[][] {
        return [
          [1, -1],
          [-1, 1],
        ];
      },
      equivalentNodalLoadVector({ loads }: { loads: readonly { id?: string | null }[] }): number[] {
        return [loads.length, loads.length];
      },
    };
    const copiedTarget = { id: "shared", nodes: [nodeA, nodeB] };
    const assembly = new api.FemAssembler2D().assemble({
      nodes: [nodeA, nodeB],
      elements: [element],
      loads: [
        { id: "by-element", element: copiedTarget },
        { id: "by-target", target: element },
      ],
    });

    return {
      registry: assembly.dofRegistry.toJSON(),
      loadVector: assembly.loadVector,
      elementAssemblies: assembly.elementAssemblies,
    };
  };

  assert.deepEqual(createAssembly(typescriptApi), createAssembly(javascriptApi));
});

void test("linear spring assembly, partitioning, and reactions match the baseline", () => {
  const solve = (api: FemApi): LinearStaticResult2D => {
    const nodeA = new api.Node({ id: "A", units });
    const nodeB = new api.Node({ id: "B", x: 1, units });
    const element = {
      id: "spring-AB",
      nodes: [nodeA, nodeB],
      getDofIds(registry: InstanceType<typeof DofRegistry>): string[] {
        return [registry.getDofId(nodeA, "ux"), registry.getDofId(nodeB, "ux")];
      },
      globalStiffness(): number[][] {
        return [
          [100, -100],
          [-100, 100],
        ];
      },
    };
    const supports = [
      new api.Support({
        id: "fixed-A",
        node: nodeA,
        restraints: { ux: true, uy: true, rz: true },
      }),
      new api.Support({
        id: "roller-B",
        node: nodeB,
        restraints: { uy: true, rz: true },
      }),
    ];
    const load = new api.NodalLoad({
      id: "P",
      node: nodeB,
      components: { fx: 50 },
      units,
    });

    return new api.LinearStaticSolver2D().solve({
      nodes: [nodeA, nodeB],
      elements: [element],
      supports,
      nodalLoads: [load],
    });
  };

  const result = solve(typescriptApi);
  assert.deepEqual(normalizedResult(result), normalizedResult(solve(javascriptApi)));
  approx(nodeValue(result.displacementByNode, "B", "ux"), 0.5);
  approx(nodeValue(result.reactionByNode, "A", "ux"), -50);
});

void test("support springs and the diagnostics fast path preserve source behavior", () => {
  const solve = (api: FemApi, includeDiagnostics: boolean): LinearStaticResult2D => {
    const node = new api.Node({ id: "A", units });
    const support = new api.Support({
      id: "spring-A",
      node,
      restraints: { uy: true, rz: true },
      springStiffness: { ux: 100 },
    });
    const load = new api.NodalLoad({
      id: "P",
      node,
      components: { fx: 50 },
      units,
    });

    return new api.LinearStaticSolver2D().solve(
      {
        nodes: [node],
        supports: [support],
        nodalLoads: [load],
      },
      { includeDiagnostics },
    );
  };

  const withDiagnostics = solve(typescriptApi, true);
  const fast = solve(typescriptApi, false);
  assert.deepEqual(normalizedResult(withDiagnostics), normalizedResult(solve(javascriptApi, true)));
  assert.deepEqual(normalizedResult(fast), normalizedResult(solve(javascriptApi, false)));
  approx(nodeValue(fast.displacementByNode, "A", "ux"), 0.5);
  assert.equal(withDiagnostics.reducedSystem.diagnostics !== null, true);
  assert.equal(fast.reducedSystem.diagnostics, null);
});

void test("equal-DOF condensation and scaled prescribed offsets match the baseline", () => {
  const reduce = (api: FemApi) => {
    const nodeA = new api.Node({ id: "A", units });
    const nodeB = new api.Node({ id: "B", units });
    const nodeC = new api.Node({ id: "C", units });
    const dofRegistry = new api.DofRegistry({ dofsPerNode: ["ux"] });
    dofRegistry.registerNodes([nodeA, nodeB, nodeC]);
    const reduction = new api.KinematicConstraintReducer2D().build({
      dofRegistry,
      constraints: [
        {
          type: "equal-dof",
          masterNode: nodeA,
          slaveNode: nodeB,
          dof: "ux",
          scale: 2,
          offset: 3,
        },
        { node: nodeC, dof: "ux", value: 4 },
      ],
    });
    const reduced = reduction.reduceLinearSystem(
      [
        [4, 1, 2],
        [1, 3, 0],
        [2, 0, 5],
      ],
      [10, 20, 30],
    );

    return {
      json: reduction.toJSON(),
      reduced,
      expanded: reduction.expandReducedVector([2]),
    };
  };

  const actual = reduce(typescriptApi);
  assert.deepEqual(actual, reduce(javascriptApi));
  assert.deepEqual(actual.json.transformationMatrix, [[1], [2], [0]]);
  assert.deepEqual(actual.reduced, {
    stiffnessMatrix: [[20]],
    loadVector: [21],
  });
  assert.deepEqual(actual.expanded, [2, 7, 4]);
});

void test("conflicting displacement constraints are rejected", () => {
  const node = new Node({ id: "A", units });

  assert.throws(
    () =>
      new LinearStaticSolver2D().solve({
        nodes: [node],
        constraints: [
          { node, dof: "ux", value: 0 },
          { node, dof: "ux", value: 1 },
        ],
      }),
    /conflicting constraints/i,
  );
});

void test("cantilever distributed-load response matches the live baseline and closed form", () => {
  const typescript = createCantilever(typescriptApi);
  const javascript = createCantilever(javascriptApi);

  assert.deepEqual(normalizedResult(typescript.result), normalizedResult(javascript.result));
  assert.deepEqual(typescript.samples, javascript.samples);
  approx(nodeValue(typescript.result.displacementByNode, "B", "uy"), (-2 * 4 ** 4) / (8 * 1_000));
  approx(nodeValue(typescript.result.displacementByNode, "B", "rz"), (-2 * 4 ** 3) / (6 * 1_000));
  approx(nodeValue(typescript.result.reactionByNode, "A", "uy"), 8);
  approx(nodeValue(typescript.result.reactionByNode, "A", "rz"), 16);
  approx(typescript.samples[0]?.bendingMoment as number, -16);
  approx(typescript.samples[1]?.bendingMoment as number, 0);
});

void test("simply supported midspan point-load response matches the baseline and closed form", () => {
  const typescript = createSimplySupportedBeam(typescriptApi);
  const javascript = createSimplySupportedBeam(javascriptApi);

  assert.deepEqual(normalizedResult(typescript.result), normalizedResult(javascript.result));
  assert.deepEqual(typescript.samples, javascript.samples);
  approx(nodeValue(typescript.result.reactionByNode, "A", "uy"), 6);
  approx(nodeValue(typescript.result.reactionByNode, "B", "uy"), 6);
  approx(nodeValue(typescript.result.displacementByNode, "C", "uy"), (-12 * 4 ** 3) / (48 * 1_000));
  approx(nodeValue(typescript.result.displacementByNode, "C", "rz"), 0);
  approx(typescript.samples[0]?.bendingMoment as number, 0);
  approx(typescript.samples[1]?.bendingMoment as number, 12);
});

void test("fixed-fixed distributed-load response matches the baseline and closed form", () => {
  const typescript = createFixedFixedBeam(typescriptApi);
  const javascript = createFixedFixedBeam(javascriptApi);

  assert.deepEqual(normalizedResult(typescript.result), normalizedResult(javascript.result));
  assert.deepEqual(typescript.samples, javascript.samples);
  approx(nodeValue(typescript.result.reactionByNode, "A", "uy"), 4);
  approx(nodeValue(typescript.result.reactionByNode, "B", "uy"), 4);
  approx(nodeValue(typescript.result.reactionByNode, "A", "rz"), 8 / 3);
  approx(nodeValue(typescript.result.reactionByNode, "B", "rz"), -8 / 3);
  approx(typescript.samples[0]?.bendingMoment as number, -8 / 3);
  approx(typescript.samples[1]?.bendingMoment as number, 4 / 3);
  approx(typescript.samples[2]?.bendingMoment as number, -8 / 3);
});
