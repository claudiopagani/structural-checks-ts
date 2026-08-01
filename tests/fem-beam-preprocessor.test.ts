import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  BeamLinePreprocessor2D,
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
  type BeamLinePreprocessor2DInput,
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
assert.equal(statusOutput.trim(), "");

const baselineApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = baselineApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

interface BeamFemApi {
  BeamLinePreprocessor2D: typeof BeamLinePreprocessor2D;
  FrameElement2DEulerBernoulli: typeof FrameElement2DEulerBernoulli;
  FrameElement2DTimoshenko: typeof FrameElement2DTimoshenko;
  LinearStaticSolver2D: typeof LinearStaticSolver2D;
  NodalLoad: typeof NodalLoad;
  Node: typeof Node;
  Support: typeof Support;
}

const typescriptApi: BeamFemApi = {
  BeamLinePreprocessor2D,
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
  LinearStaticSolver2D,
  NodalLoad,
  Node,
  Support,
};
const javascriptApi: BeamFemApi = {
  BeamLinePreprocessor2D: baselineExport("BeamLinePreprocessor2D"),
  FrameElement2DEulerBernoulli: baselineExport("FrameElement2DEulerBernoulli"),
  FrameElement2DTimoshenko: baselineExport("FrameElement2DTimoshenko"),
  LinearStaticSolver2D: baselineExport("LinearStaticSolver2D"),
  NodalLoad: baselineExport("NodalLoad"),
  Node: baselineExport("Node"),
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

function normalizeBeamLine(
  result: ReturnType<InstanceType<typeof BeamLinePreprocessor2D>["build"]>,
): Record<string, unknown> {
  return {
    id: result.id,
    units: result.units,
    span: result.span,
    nodes: result.nodes.map((node) => node.toJSON()),
    elements: result.elements.map((element) => element.toJSON()),
    supports: result.supports.map((support) => support.toJSON()),
    nodalLoads: result.nodalLoads.map((load) => load.toJSON()),
    distributedLoads: result.distributedLoads.map((load) => load.toJSON()),
    stations: result.stations,
    metadata: result.metadata,
  };
}

function normalizeSolver(result: LinearStaticResult2D): Record<string, unknown> {
  return {
    dofIds: result.dofIds,
    freeDofIds: result.freeDofIds,
    constrainedDofIds: result.constrainedDofIds,
    displacements: result.displacements,
    displacementByNode: result.displacementByNode,
    reactions: result.reactions,
    reactionByNode: result.reactionByNode,
    stiffnessMatrix: result.stiffnessMatrix,
    loadVector: result.loadVector,
    kinematicReduction: result.kinematicReduction,
  };
}

function solveTimoshenkoCantilever(
  api: BeamFemApi,
  {
    length,
    loadValue = -10,
    flexuralRigidity = 1_000,
    shearRigidity = 1_000,
    shearCorrectionFactor = 1,
  }: {
    length: number;
    loadValue?: number;
    flexuralRigidity?: number;
    shearRigidity?: number;
    shearCorrectionFactor?: number;
  },
): {
  element: InstanceType<typeof FrameElement2DTimoshenko>;
  result: LinearStaticResult2D;
} {
  const fixedNode = new api.Node({ id: "A", units });
  const freeNode = new api.Node({ id: "B", x: length, units });
  const element = new api.FrameElement2DTimoshenko({
    id: "beam",
    startNode: fixedNode,
    endNode: freeNode,
    axialRigidity: 1e6,
    flexuralRigidity,
    shearRigidity,
    shearCorrectionFactor,
  });
  const support = new api.Support({
    id: "fixed-A",
    node: fixedNode,
    restraints: { ux: true, uy: true, rz: true },
  });
  const load = new api.NodalLoad({
    id: "tip-load",
    node: freeNode,
    components: { fy: loadValue },
    units,
  });
  const result = new api.LinearStaticSolver2D().solve({
    nodes: [fixedNode, freeNode],
    elements: [element],
    supports: [support],
    nodalLoads: [load],
  });

  return { element, result };
}

void test("beam-line preprocessing matches the live baseline", () => {
  const input = {
    id: "beam",
    span: 6,
    units,
    element: {
      axialRigidity: 10_000,
      flexuralRigidity: 1_000,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: 6, restraints: { uy: true } },
    ],
    loads: [
      { id: "P", type: "point", x: 3, value: -12, direction: "y" },
      {
        id: "q",
        type: "uniform",
        from: 1,
        to: 5,
        value: -2,
        direction: "y",
      },
    ],
    discretization: { elementCount: 3 },
  } satisfies BeamLinePreprocessor2DInput;

  const typescript = new typescriptApi.BeamLinePreprocessor2D().build(input);
  const javascript = new javascriptApi.BeamLinePreprocessor2D().build(input);

  assert.deepEqual(normalizeBeamLine(typescript), normalizeBeamLine(javascript));
  assert.deepEqual(typescript.stations, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(typescript.distributedLoads.length, 4);
});

void test("generated midspan point-load model matches the closed form and baseline", () => {
  const input = {
    id: "midspan",
    span: 4,
    units,
    element: {
      axialRigidity: 10_000,
      flexuralRigidity: 1_000,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: 4, restraints: { uy: true } },
    ],
    loads: [{ id: "P", type: "point", x: 2, value: -12, direction: "y" }],
  } satisfies BeamLinePreprocessor2DInput;
  const solve = (api: BeamFemApi): LinearStaticResult2D => {
    const model = new api.BeamLinePreprocessor2D().build(input);
    return new api.LinearStaticSolver2D().solve(model);
  };
  const result = solve(typescriptApi);

  assert.deepEqual(normalizeSolver(result), normalizeSolver(solve(javascriptApi)));
  approx(nodeValue(result.reactionByNode, "midspan-beam-node-1", "uy"), 6);
  approx(nodeValue(result.reactionByNode, "midspan-beam-node-3", "uy"), 6);
  approx(
    nodeValue(result.displacementByNode, "midspan-beam-node-2", "uy"),
    (-12 * 4 ** 3) / (48 * 1_000),
  );
});

void test("partial uniform load is split into covered elements with exact equilibrium", () => {
  const input = {
    id: "partial-q",
    span: 6,
    units,
    element: {
      axialRigidity: 10_000,
      flexuralRigidity: 1_000,
    },
    supports: [
      { id: "A", x: 0, restraints: { ux: true, uy: true } },
      { id: "B", x: 6, restraints: { uy: true } },
    ],
    loads: [{ id: "q", type: "uniform", from: 2, to: 4, value: -3, direction: "y" }],
  } satisfies BeamLinePreprocessor2DInput;
  const solve = (api: BeamFemApi): LinearStaticResult2D => {
    const model = new api.BeamLinePreprocessor2D().build(input);
    return new api.LinearStaticSolver2D().solve(model);
  };
  const result = solve(typescriptApi);

  assert.deepEqual(normalizeSolver(result), normalizeSolver(solve(javascriptApi)));
  approx(nodeValue(result.reactionByNode, "partial-q-beam-node-1", "uy"), 3);
  approx(nodeValue(result.reactionByNode, "partial-q-beam-node-4", "uy"), 3);
});

void test("beam-line preprocessing rejects trapezoidal loads", () => {
  assert.throws(
    () =>
      new BeamLinePreprocessor2D().build({
        id: "bad",
        span: 6,
        units,
        element: {
          axialRigidity: 10_000,
          flexuralRigidity: 1_000,
        },
        loads: [
          {
            id: "trap",
            type: "trapezoidal",
            from: 0,
            to: 6,
            startValue: -2,
            endValue: -4,
          },
        ],
      }),
    /trapezoidal loads/i,
  );
});

void test("Timoshenko rigidity, stiffness, and serialization match the baseline", () => {
  const create = (api: BeamFemApi) => {
    const element = new api.FrameElement2DTimoshenko({
      id: "timoshenko",
      startNode: new api.Node({ id: "A", units }),
      endNode: new api.Node({ id: "B", x: 2, units }),
      axialRigidity: 1_000,
      flexuralRigidity: 500,
      shearRigidity: 1_200,
      shearCorrectionFactor: 5 / 6,
    });
    return {
      effectiveShearRigidity: element.resolvedEffectiveShearRigidity(),
      shearFlexibilityCoefficient: element.shearFlexibilityCoefficient(),
      stiffness: element.localStiffness(),
      diagnostics: element.lockingDiagnostics(),
      json: element.toJSON(),
    };
  };
  const actual = create(typescriptApi);

  assert.deepEqual(actual, create(javascriptApi));
  approx(actual.effectiveShearRigidity, 1_000);
  approx(actual.shearFlexibilityCoefficient, (12 * 500) / (1_000 * 2 ** 2));
});

void test("Timoshenko material and section properties resolve exactly like the baseline", () => {
  const create = (api: BeamFemApi) => {
    const element = new api.FrameElement2DTimoshenko({
      id: "section-based",
      startNode: new api.Node({ id: "A", units }),
      endNode: new api.Node({ id: "B", x: 1, units }),
      material: {
        elasticModulus: 30_000,
        shearModulus: 12_000,
      },
      crossSection: {
        area: 2,
        inertiaY: 0.5,
      },
      shearCorrectionFactor: 0.75,
    });
    return {
      axial: element.resolvedAxialRigidity(),
      flexural: element.resolvedFlexuralRigidity(),
      shear: element.resolvedEffectiveShearRigidity(),
    };
  };
  const actual = create(typescriptApi);

  assert.deepEqual(actual, create(javascriptApi));
  assert.deepEqual(actual, { axial: 60_000, flexural: 15_000, shear: 18_000 });
});

void test("stocky Timoshenko cantilever includes the closed-form shear displacement", () => {
  const typescript = solveTimoshenkoCantilever(typescriptApi, {
    length: 1,
    shearRigidity: 100,
  });
  const javascript = solveTimoshenkoCantilever(javascriptApi, {
    length: 1,
    shearRigidity: 100,
  });

  assert.deepEqual(normalizeSolver(typescript.result), normalizeSolver(javascript.result));
  approx(nodeValue(typescript.result.displacementByNode, "B", "uy"), -10 / (3 * 1_000) - 10 / 100);
  approx(nodeValue(typescript.result.displacementByNode, "B", "rz"), -10 / (2 * 1_000));
});

void test("beam-line preprocessing preserves Timoshenko shear-rigidity units", () => {
  const create = (api: BeamFemApi) => {
    const model = new api.BeamLinePreprocessor2D({
      elementClass: api.FrameElement2DTimoshenko,
    }).build({
      id: "timo-line",
      span: 2,
      units,
      element: {
        axialRigidity: 10_000,
        flexuralRigidity: 1_000,
        shearRigidity: 1_200,
        shearCorrectionFactor: 5 / 6,
      },
    });
    const element = model.elements[0];
    assert.ok(element instanceof api.FrameElement2DTimoshenko);

    return {
      model: normalizeBeamLine(model),
      effectiveShearRigidity: element.resolvedEffectiveShearRigidity(),
    };
  };
  const actual = create(typescriptApi);

  assert.deepEqual(actual, create(javascriptApi));
  approx(actual.effectiveShearRigidity, 1_000);
});
