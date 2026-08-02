import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const sourceModulePath = path.join(sourceRoot, "src", "domain", "fem", "index.js");
const typescriptModulePath = path.join(repositoryRoot, "dist", "domain", "fem", "index.js");

type RuntimeFunction = (...arguments_: readonly unknown[]) => unknown;

interface RuntimeFemModule {
  readonly collectConcurrentJointActionStates: RuntimeFunction;
  readonly collectConcurrentLineElementActionStates: RuntimeFunction;
  readonly collectConcurrentMemberActionStates: RuntimeFunction;
  readonly collectConcurrentSectionCutStates: RuntimeFunction;
  readonly collectConcurrentSupportReactionStates: RuntimeFunction;
  readonly collectConcurrentSurfaceResultantStates: RuntimeFunction;
  readonly filterConcurrentFemStates: RuntimeFunction;
  readonly projectFoundationReactionStatesToResistanceAxes: RuntimeFunction;
  readonly projectJointActionStatesToResistanceAxes: RuntimeFunction;
  readonly projectLineActionStateToResistanceAxes: RuntimeFunction;
  readonly projectMemberActionStatesToResistanceAxes: RuntimeFunction;
  readonly projectSectionCutStateToResistanceAxes: RuntimeFunction;
  readonly projectShellResultantStateToResistanceAxes: RuntimeFunction;
  readonly projectSlabResultantStatesToResistanceAxes: RuntimeFunction;
  readonly projectSupportReactionStateToResistanceAxes: RuntimeFunction;
  readonly projectWallSectionCutStatesToResistanceAxes: RuntimeFunction;
  readonly validateResistanceAxisTransformation: RuntimeFunction;
  readonly validateSurfaceResistanceAxisTransformation: RuntimeFunction;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRuntimeModule(value: unknown): asserts value is RuntimeFemModule {
  assert.ok(isRecord(value));
  const names: readonly (keyof RuntimeFemModule)[] = [
    "collectConcurrentJointActionStates",
    "collectConcurrentLineElementActionStates",
    "collectConcurrentMemberActionStates",
    "collectConcurrentSectionCutStates",
    "collectConcurrentSupportReactionStates",
    "collectConcurrentSurfaceResultantStates",
    "filterConcurrentFemStates",
    "projectFoundationReactionStatesToResistanceAxes",
    "projectJointActionStatesToResistanceAxes",
    "projectLineActionStateToResistanceAxes",
    "projectMemberActionStatesToResistanceAxes",
    "projectSectionCutStateToResistanceAxes",
    "projectShellResultantStateToResistanceAxes",
    "projectSlabResultantStatesToResistanceAxes",
    "projectSupportReactionStateToResistanceAxes",
    "projectWallSectionCutStatesToResistanceAxes",
    "validateResistanceAxisTransformation",
    "validateSurfaceResistanceAxisTransformation",
  ];
  for (const name of names) {
    assert.equal(typeof value[name], "function", `${name} must be exported`);
  }
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) as number);
}

function compareValues(source: unknown, typescript: unknown, label: string): void {
  const absoluteTolerance = 1e-12;
  const relativeTolerance = 1e-12;
  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      const difference = Math.abs((left as number) - (right as number));
      const scale = Math.max(1, Math.abs(left as number), Math.abs(right as number));
      assert.ok(
        difference <= absoluteTolerance + relativeTolerance * scale,
        `${label}${valuePath}: ${difference} exceeds numerical tolerance`,
      );
      return;
    }
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(left, right, `${label}${valuePath}`);
      assert.deepEqual(
        codePoints(left as string),
        codePoints(right as string),
        `${label}${valuePath}`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
      return;
    }
    assert.deepEqual(left, right, `${label}${valuePath}`);
  };
  compare(source, typescript, "$");
  assert.equal(
    JSON.stringify(source),
    JSON.stringify(typescript),
    `${label}: exact serialized JSON`,
  );
}

function comparePair(
  sourceModule: RuntimeFemModule,
  typescriptModule: RuntimeFemModule,
  label: string,
  invoke: (module: RuntimeFemModule) => unknown,
): void {
  const sourceValue = invoke(sourceModule);
  const typescriptValue = invoke(typescriptModule);
  compareValues(sourceValue, typescriptValue, label);
}

function captureError(invoke: () => unknown): { readonly name: string; readonly message: string } {
  try {
    invoke();
  } catch (error) {
    return {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected the independent FEM oracle call to fail.");
}

function properAxisMatrix(): readonly (readonly number[])[] {
  return [
    [1, 0, 0],
    [0, 0, 1],
    [0, -1, 0],
  ];
}

const localAxes = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};
const lineState = {
  lineElementId: "E1",
  coordinateSystem: "element-local",
  localAxes,
  reference: { procedureId: "P", combinationId: "ULS-1" },
  station: { xi: 0.5, position: 1.25 },
  actions: { N: -10, Vy: 20, Vz: 30, T: 4, My: 5, Mz: 6 },
};
const lineDemand = {
  lineElementId: "E1",
  sectionId: "SEC-1",
  materialId: "MAT-1",
  localAxes,
  actionStates: [
    {
      coordinateSystem: "element-local",
      reference: { procedureId: "P", combinationId: "ULS-1" },
      stations: [
        { xi: 0, position: 0, side: "before", actions: lineState.actions },
        { xi: 1, position: 2, side: "after", actions: { ...lineState.actions, N: -8 } },
      ],
    },
  ],
};
const sectionState = {
  sectionCutId: "CUT-1",
  coordinateSystem: "section-cut-local",
  reference: { combinationId: "ULS-1" },
  resultants: { Fx: 10, Fy: 100, Fz: 20, Mx: 30, My: 40, Mz: 50 },
};
const shellState = {
  shellElementId: "S1",
  coordinateSystem: "element-local",
  localAxes,
  reference: { combinationId: "ULS-1" },
  components: { Nx: 10, Ny: 20, Nxy: 3, Mx: 30, My: 40, Mxy: 4, Vx: 5, Vy: 6 },
};
const reactionState = {
  nodeId: "N1",
  coordinateSystem: "global",
  reference: { combinationId: "ULS-1" },
  forces: { x: 1, y: 2, z: 3 },
  moments: { x: 4, y: 5, z: 6 },
};
const lineMapping = {
  lineElementId: "E1",
  sourceCoordinateSystem: "element-local",
  resistanceCoordinateSystemId: "R-LINE",
  sourceToResistance: properAxisMatrix(),
  localAxes,
};
const sectionMapping = {
  sectionCutId: "CUT-1",
  sourceCoordinateSystem: "section-cut-local",
  resistanceCoordinateSystemId: "R-WALL",
  sourceToResistance: [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
};
const shellMapping = {
  shellElementId: "S1",
  sourceCoordinateSystem: "element-local",
  resistanceCoordinateSystemId: "R-SLAB",
  sourceToResistance: [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ],
  localAxes,
};
const supportMapping = {
  supportNodeId: "N1",
  sourceCoordinateSystem: "global",
  resistanceCoordinateSystemId: "R-FOUNDATION",
  sourceToResistance: [
    [0, 1, 0],
    [-1, 0, 0],
    [0, 0, 1],
  ],
};
const jointState = {
  jointId: "J1",
  nodeId: "N1",
  reference: { combinationId: "ULS-1" },
  complete: true,
  missingElementEnds: [],
  elementEnds: [
    {
      lineElementId: "E1",
      end: "start",
      coordinateSystem: "element-local",
      atElementEnd: true,
      station: { xi: 0, actions: lineState.actions },
    },
  ],
};
const globalResponses = {
  sectionCuts: [sectionState],
  reactions: [reactionState],
};
const member = { id: "M1", lineElementIds: ["E1"], lineActionMappings: [lineMapping] };
const wall = { id: "W1", sectionCutIds: ["CUT-1"], sectionCutActionMappings: [sectionMapping] };
const slab = { id: "S1", shellElementIds: ["S1"], shellResultantMappings: [shellMapping] };
const foundation = {
  id: "F1",
  supportNodeIds: ["N1"],
  supportReactionMappings: [supportMapping],
};

const sourceModuleUnknown: unknown = await import(pathToFileURL(sourceModulePath).href);
const typescriptModuleUnknown: unknown = await import(pathToFileURL(typescriptModulePath).href);
assertRuntimeModule(sourceModuleUnknown);
assertRuntimeModule(typescriptModuleUnknown);

void test("concurrent FEM demand and resistance-axis functions match the independent JavaScript oracle", () => {
  assertSourceBaseline();

  for (const name of [
    "collectConcurrentLineElementActionStates",
    "projectLineActionStateToResistanceAxes",
    "validateResistanceAxisTransformation",
  ] as const) {
    assert.notStrictEqual(
      sourceModuleUnknown[name],
      typescriptModuleUnknown[name],
      `${name} must execute from independent source and built TypeScript modules`,
    );
  }

  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "collect line states", (module) =>
    module.collectConcurrentLineElementActionStates(structuredClone(lineDemand)),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "filter states", (module) =>
    module.filterConcurrentFemStates(
      module.collectConcurrentLineElementActionStates(structuredClone(lineDemand)),
      { combinationId: "ULS-1" },
    ),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "collect section cuts", (module) =>
    module.collectConcurrentSectionCutStates({
      sectionCutIds: ["CUT-1"],
      globalResponses: structuredClone(globalResponses),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "collect reactions", (module) =>
    module.collectConcurrentSupportReactionStates({
      nodeId: "N1",
      globalResponses: structuredClone(globalResponses),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "collect joints", (module) =>
    module.collectConcurrentJointActionStates(structuredClone({ ...jointState })),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project member states", (module) =>
    module.projectMemberActionStatesToResistanceAxes({
      member: structuredClone(member),
      states: [structuredClone(lineState)],
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project joint states", (module) =>
    module.projectJointActionStatesToResistanceAxes({
      members: [structuredClone(member)],
      states: [structuredClone(jointState)],
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project line state", (module) =>
    module.projectLineActionStateToResistanceAxes({
      state: structuredClone(lineState),
      mapping: structuredClone(lineMapping),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project section state", (module) =>
    module.projectSectionCutStateToResistanceAxes({
      state: structuredClone(sectionState),
      mapping: structuredClone(sectionMapping),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project wall states", (module) =>
    module.projectWallSectionCutStatesToResistanceAxes({
      wall: structuredClone(wall),
      states: [structuredClone(sectionState)],
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project shell state", (module) =>
    module.projectShellResultantStateToResistanceAxes({
      state: structuredClone(shellState),
      mapping: structuredClone(shellMapping),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project slab states", (module) =>
    module.projectSlabResultantStatesToResistanceAxes({
      slab: structuredClone(slab),
      states: [structuredClone(shellState)],
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project support state", (module) =>
    module.projectSupportReactionStateToResistanceAxes({
      state: structuredClone(reactionState),
      mapping: structuredClone(supportMapping),
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "project foundation states", (module) =>
    module.projectFoundationReactionStatesToResistanceAxes({
      foundation: structuredClone(foundation),
      states: [structuredClone(reactionState)],
    }),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "proper axis validation", (module) =>
    module.validateResistanceAxisTransformation(structuredClone(properAxisMatrix())),
  );
  comparePair(sourceModuleUnknown, typescriptModuleUnknown, "surface axis validation", (module) =>
    module.validateSurfaceResistanceAxisTransformation([
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ]),
  );

  const invalidMatrices = [
    [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
  ];
  for (const [index, invalidMatrix] of invalidMatrices.entries()) {
    const sourceError = captureError(() =>
      sourceModuleUnknown.validateResistanceAxisTransformation(structuredClone(invalidMatrix)),
    );
    const typescriptError = captureError(() =>
      typescriptModuleUnknown.validateResistanceAxisTransformation(structuredClone(invalidMatrix)),
    );
    assert.deepEqual(typescriptError, sourceError, `invalid matrix ${index} error parity`);
  }

  const sourceMissingComponentError = captureError(() =>
    sourceModuleUnknown.collectConcurrentLineElementActionStates({
      lineElementId: "E1",
      actionStates: [
        {
          coordinateSystem: "element-local",
          stations: [{ xi: 0, actions: { N: -10, Vy: 2, Vz: 3, My: 4, Mz: 5 } }],
        },
      ],
    }),
  );
  const typescriptMissingComponentError = captureError(() =>
    typescriptModuleUnknown.collectConcurrentLineElementActionStates({
      lineElementId: "E1",
      actionStates: [
        {
          coordinateSystem: "element-local",
          stations: [{ xi: 0, actions: { N: -10, Vy: 2, Vz: 3, My: 4, Mz: 5 } }],
        },
      ],
    }),
  );
  assert.deepEqual(typescriptMissingComponentError, sourceMissingComponentError);
});
