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

interface RuntimeFemModule {
  readonly createSteelMemberFem3DResult: (input: unknown, options?: unknown) => unknown;
  readonly validateSteelMemberFem3DResult: (input: unknown, options?: unknown) => unknown;
  readonly steelMemberFem3DToLegacyAnalysisResult: (contract: unknown) => unknown;
}

type InputRecord = Record<string, unknown>;

function isRecord(value: unknown): value is InputRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeFemModule(value: unknown): value is RuntimeFemModule {
  return (
    isRecord(value) &&
    typeof value.createSteelMemberFem3DResult === "function" &&
    typeof value.validateSteelMemberFem3DResult === "function" &&
    typeof value.steelMemberFem3DToLegacyAnalysisResult === "function"
  );
}

async function loadFemModule(root: string, relativePath: string): Promise<RuntimeFemModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeFemModule(module)) {
    throw new Error(`The module ${relativePath} does not expose the FEM contract.`);
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

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = json(source);
  const typescriptJson = json(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
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

const units = { force: "N", length: "mm" };

function station(
  stationValue: number,
  actions: InputRecord = {},
  displacements: InputRecord = {},
): InputRecord {
  return {
    station: stationValue,
    coordinates: { x: stationValue, y: 0, z: 0 },
    N: actions.N ?? 100000,
    Vy: actions.Vy ?? 40000,
    Vz: actions.Vz ?? 5000,
    My: actions.My ?? 30e6,
    Mz: actions.Mz ?? 2e6,
    T: actions.T ?? 0,
    B: actions.B ?? 0,
    u: displacements.u ?? 0,
    v: displacements.v ?? 0,
    w: displacements.w ?? 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  };
}

function fem3d(): InputRecord {
  return {
    units,
    fem3d: {
      member: {
        id: "Mλ",
        length: 6000,
        ends: {
          start: {
            coordinates: { x: 0, y: 0, z: 0 },
            restraints: { ux: true, uy: true, uz: true },
          },
          end: {
            coordinates: { x: 6000, y: 0, z: 0 },
            restraints: { uy: true, uz: true },
          },
        },
        stability: {
          sway: false,
          nonSway: true,
          effectiveLengthFactorY: 1,
          effectiveLengthFactorZ: 1,
        },
        restraintSegments: [
          {
            id: "R1",
            from: 0,
            to: 3000,
            lateral: true,
            torsional: true,
            momentDiagram: { type: "linear" },
          },
          {
            id: "R2",
            from: 3000,
            to: 6000,
            lateral: true,
            torsional: true,
            momentDiagram: { type: "linear" },
          },
        ],
        webPanels: [
          {
            id: "P1",
            from: 0,
            to: 3000,
            length: 3000,
            endPost: "rigid",
            stiffeners: [{ station: 3000, rigid: true }],
          },
          { id: "P2", from: 3000, to: 6000, endPost: "non-rigid" },
        ],
        concentratedLoads: [
          {
            id: "F1",
            combinationId: "ULS-1",
            station: 3000,
            force: 60000,
            bearingLength: 100,
            loadType: "internal",
          },
        ],
        metadata: { description: "FEM 3D λ fixture" },
      },
      combinations: [
        {
          id: "ULS-1",
          limitState: "SLU",
          combinationType: "fundamental",
          stations: [
            station(0, { My: 20e6, B: 12 }),
            station(3000, { My: 40e6, Vy: 70000, B: 12 }),
            station(6000, { My: -10e6, B: 12 }),
          ],
          metadata: { note: "ULS λ" },
        },
        {
          id: "SLE-rare",
          limitState: "SLS",
          combinationType: "rare",
          stations: [
            station(0, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: 0 }),
            station(3000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: -12 }),
            station(6000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }, { v: 0 }),
          ],
        },
      ],
      metadata: { source: "independent-λ" },
    },
  };
}

void test("steel FEM 3D contract matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadFemModule(
    sourceRoot,
    "src/applications/steel-frames/fem/SteelMemberFem3DContract.js",
  );
  const typescript = await loadFemModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/fem/SteelMemberFem3DContract.js",
  );
  const sourceRootModule = await loadFemModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadFemModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(
    source.createSteelMemberFem3DResult,
    typescript.createSteelMemberFem3DResult,
    "source and TypeScript factories must be independently executed",
  );
  assert.equal(
    sourceRootModule.validateSteelMemberFem3DResult,
    source.validateSteelMemberFem3DResult,
  );
  assert.equal(
    typescriptRootModule.steelMemberFem3DToLegacyAnalysisResult,
    typescript.steelMemberFem3DToLegacyAnalysisResult,
  );

  const input = fem3d();
  const sourceValidation = source.validateSteelMemberFem3DResult(input, { strict: true });
  const typescriptValidation = typescript.validateSteelMemberFem3DResult(input, { strict: true });
  exactJson(sourceValidation, typescriptValidation, "strict validation result");

  const sourceResult = source.createSteelMemberFem3DResult(input);
  const typescriptResult = typescript.createSteelMemberFem3DResult(input);
  exactJson(sourceResult, typescriptResult, "created FEM contract");

  exactJson(
    source.steelMemberFem3DToLegacyAnalysisResult(sourceResult),
    typescript.steelMemberFem3DToLegacyAnalysisResult(typescriptResult),
    "legacy analysis result conversion",
  );

  const aliasesInput: InputRecord = {
    units,
    geometry: { length: 1200 },
    supports: [{ station: 0, restraints: { uy: true } }],
    memberId: "alias-λ",
    combinations: {
      alias: {
        type: "ULS",
        context: { combinationType: "fundamental", combinationId: "alias" },
        internalForces: {
          samples: {
            first: {
              position: 0,
              coordinate: { x: 0, y: 0, z: 0 },
              principalActions: { vY: 2, vZ: 3, mY: 4, mZ: 5 },
              n: 1,
              t: 6,
              bimoment: 7,
              displacements: { ux: 0, uy: 0, uz: 0 },
              rotations: { rx: 0, ry: 0, rz: 0 },
            },
          },
        },
      },
    },
  };
  exactJson(
    source.validateSteelMemberFem3DResult(aliasesInput),
    typescript.validateSteelMemberFem3DResult(aliasesInput),
    "alias and object-entry normalization",
  );

  assertErrorParity(
    () => source.createSteelMemberFem3DResult({}),
    () => typescript.createSteelMemberFem3DResult({}),
    "strict missing-input error",
  );
  exactJson(
    source.validateSteelMemberFem3DResult(null),
    typescript.validateSteelMemberFem3DResult(null),
    "null validation error result",
  );
  assertErrorParity(
    () => source.validateSteelMemberFem3DResult(input, null),
    () => typescript.validateSteelMemberFem3DResult(input, null),
    "null validation options error",
  );
});
