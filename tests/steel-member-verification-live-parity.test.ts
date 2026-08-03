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

interface RuntimeResult {
  readonly status: unknown;
  readonly checks: readonly unknown[];
  readonly outputs: unknown;
  readonly metadata: unknown;
  readonly toJSON: () => unknown;
}

interface RuntimeRootModule {
  readonly SteelMemberVerification: new (options?: unknown) => {
    verify: (input?: unknown) => RuntimeResult;
  };
  readonly createSteelProfileSection: (options: unknown) => unknown;
  readonly createNTC2018StructuralSteelMaterial: (options: unknown) => unknown;
}

interface RuntimeDirectModule {
  readonly SteelMemberVerification: RuntimeRootModule["SteelMemberVerification"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.SteelMemberVerification === "function" &&
    typeof value.createSteelProfileSection === "function" &&
    typeof value.createNTC2018StructuralSteelMaterial === "function"
  );
}

function isRuntimeDirectModule(value: unknown): value is RuntimeDirectModule {
  return isRecord(value) && typeof value.SteelMemberVerification === "function";
}

async function loadRootModule(root: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeRootModule(module))
    throw new Error("Missing SteelMemberVerification root exports.");
  return module;
}

async function loadTargetRootModule(): Promise<RuntimeRootModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeRootModule(module))
    throw new Error("Missing built SteelMemberVerification root exports.");
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<RuntimeDirectModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRuntimeDirectModule(module)) throw new Error(`Missing direct export in ${relativePath}.`);
  return module;
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
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

function station(
  stationValue: number,
  overrides: Record<string, number> = {},
): Record<string, unknown> {
  return {
    station: stationValue,
    coordinates: { x: stationValue, y: 0, z: 0 },
    N: overrides.N ?? 100000,
    Vy: overrides.Vy ?? 40000,
    Vz: overrides.Vz ?? 5000,
    My: overrides.My ?? 30e6,
    Mz: overrides.Mz ?? 2e6,
    T: overrides.T ?? 0,
    B: overrides.B ?? 0,
    u: 0,
    v: overrides.v ?? 0,
    w: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  };
}

function fem3d(bimoment = 0): Record<string, unknown> {
  const units = { force: "N", length: "mm" };
  return {
    units,
    fem3d: {
      member: {
        id: "M-λ",
        length: 6000,
        ends: {
          start: {
            coordinates: { x: 0, y: 0, z: 0 },
            restraints: { ux: true, uy: true, uz: true },
          },
          end: { coordinates: { x: 6000, y: 0, z: 0 }, restraints: { uy: true, uz: true } },
        },
        stability: {
          sway: false,
          nonSway: true,
          effectiveLengthFactorY: 1,
          effectiveLengthFactorZ: 1,
        },
        restraintSegments: [
          {
            id: "R-λ1",
            from: 0,
            to: 3000,
            lateral: true,
            torsional: true,
            momentDiagram: { type: "linear" },
          },
          {
            id: "R-λ2",
            from: 3000,
            to: 6000,
            lateral: true,
            torsional: true,
            momentDiagram: { type: "linear" },
          },
        ],
        webPanels: [
          {
            id: "P-λ1",
            from: 0,
            to: 3000,
            length: 3000,
            endPost: "rigid",
            stiffeners: [{ station: 3000, rigid: true }],
          },
          { id: "P-λ2", from: 3000, to: 6000, endPost: "non-rigid" },
        ],
        concentratedLoads: [
          {
            id: "F-λ",
            combinationId: "ULS-λ",
            station: 3000,
            force: 60000,
            bearingLength: 100,
            loadType: "internal",
          },
        ],
        metadata: { label: "FEM 3D λ" },
      },
      combinations: [
        {
          id: "ULS-λ",
          limitState: "SLU",
          combinationType: "fundamental",
          stations: [
            station(0, { My: 20e6, B: bimoment }),
            station(3000, { My: 40e6, Vy: 70000, B: bimoment }),
            station(6000, { My: -10e6, B: bimoment }),
          ],
          metadata: { label: "ULS λ" },
        },
        {
          id: "SLE-λ",
          limitState: "SLE",
          combinationType: "rare",
          stations: [
            station(0, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }),
            station(3000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0, v: -12 }),
            station(6000, { N: 0, Vy: 0, Vz: 0, My: 0, Mz: 0 }),
          ],
        },
      ],
    },
  };
}

function createFixture(root: RuntimeRootModule): { section: unknown; material: unknown } {
  const units = { force: "N", length: "mm" };
  return {
    section: root.createSteelProfileSection({ profileName: "IPE200", units }),
    material: root.createNTC2018StructuralSteelMaterial({ grade: "S275", units }),
  };
}

void test("SteelMemberVerification matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadTargetRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelMemberVerification.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelMemberVerification.js",
  );

  assert.notEqual(sourceDirect.SteelMemberVerification, typescriptDirect.SteelMemberVerification);
  assert.equal(sourceRootModule.SteelMemberVerification, sourceDirect.SteelMemberVerification);
  assert.equal(
    typescriptRootModule.SteelMemberVerification,
    typescriptDirect.SteelMemberVerification,
  );
  assert.notEqual(
    sourceRootModule.SteelMemberVerification,
    typescriptRootModule.SteelMemberVerification,
  );

  const sourceFixture = createFixture(sourceRootModule);
  const typescriptFixture = createFixture(typescriptRootModule);
  const sourceVerification = new sourceRootModule.SteelMemberVerification({
    metadata: { label: "λ" },
  });
  const typescriptVerification = new typescriptRootModule.SteelMemberVerification({
    metadata: { label: "λ" },
  });

  exactJson(sourceVerification.verify(), typescriptVerification.verify(), "missing input scaffold");
  exactJson(
    sourceVerification.verify({
      section: sourceFixture.section,
      material: sourceFixture.material,
      analysisResult: {},
    }),
    typescriptVerification.verify({
      section: typescriptFixture.section,
      material: typescriptFixture.material,
      analysisResult: {},
    }),
    "non-FEM incomplete input",
  );
  exactJson(
    sourceVerification.verify({
      section: sourceFixture.section,
      material: sourceFixture.material,
      analysisResult: fem3d(),
    }),
    typescriptVerification.verify({
      section: typescriptFixture.section,
      material: typescriptFixture.material,
      analysisResult: fem3d(),
    }),
    "complete FEM 3D verification",
  );
  const sourceWarping = sourceVerification.verify({
    section: sourceFixture.section,
    material: sourceFixture.material,
    analysisResult: fem3d(10e6),
  });
  const typescriptWarping = typescriptVerification.verify({
    section: typescriptFixture.section,
    material: typescriptFixture.material,
    analysisResult: fem3d(10e6),
  });
  exactJson(sourceWarping, typescriptWarping, "unsupported warping input");
  assert.equal(sourceWarping.status, "not-supported");

  assertErrorParity(
    () => sourceVerification.verify(null),
    () => typescriptVerification.verify(null),
    "null verification input error",
  );
});
