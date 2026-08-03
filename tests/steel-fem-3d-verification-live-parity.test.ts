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

interface RuntimeFem3DModule {
  readonly steelUnsupportedFeatureCatalog: () => unknown;
  readonly verifySteelFem3DAdvanced: (options?: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFem3DModule(value: unknown): value is RuntimeFem3DModule {
  return (
    isRecord(value) &&
    typeof value.steelUnsupportedFeatureCatalog === "function" &&
    typeof value.verifySteelFem3DAdvanced === "function"
  );
}

async function loadFem3DModule(root: string, relativePath: string): Promise<RuntimeFem3DModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isFem3DModule(module)) {
    throw new Error(`The module ${relativePath} does not expose the steel FEM 3D checks.`);
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

function identityUnits(): Record<string, (value: number) => number> {
  return {
    force: (value) => value,
    length: (value) => value,
    moment: (value) => value,
  };
}

function station(
  stationValue: number,
  actions: { N?: number; Vy?: number; My?: number; T?: number; B?: number } = {},
): Record<string, unknown> {
  return {
    station: stationValue,
    coordinates: { x: stationValue, y: 0, z: 0 },
    actions: {
      N: actions.N ?? 0,
      Vy: actions.Vy ?? 0,
      My: actions.My ?? 0,
      T: actions.T ?? 0,
      B: actions.B ?? 0,
    },
  };
}

interface FixtureContract {
  member: Record<string, unknown>;
  combinations: readonly Record<string, unknown>[];
}

interface ContractOverrides {
  member?: Record<string, unknown>;
  combinations?: readonly Record<string, unknown>[];
}

function contract(overrides: ContractOverrides = {}): FixtureContract {
  return {
    member: overrides.member ?? {
      frameClassification: { sway: false, nonSway: true },
      effectiveLengths: { y: 1, z: 1 },
      effectiveLengthFactors: { y: 1, z: 1 },
      webPanels: [{ id: "P-λ", from: 0, to: 3000, length: 3000, endPost: "rigid" }],
      concentratedLoads: [
        {
          id: "F-λ",
          combinationId: "ULS-1",
          station: 3000,
          force: 60000,
          bearingLength: 100,
          loadType: "internal",
        },
      ],
    },
    combinations: overrides.combinations ?? [
      {
        id: "ULS-1",
        limitState: "SLU",
        stations: [
          station(0, { N: 100000, Vy: 40000, My: 20000000 }),
          station(3000, { N: 100000, Vy: 70000, My: 40000000 }),
          station(6000, { N: 100000, Vy: 20000, My: -10000000 }),
        ],
      },
    ],
  };
}

function section(): Record<string, unknown> {
  return {
    family: "IPE",
    plasticSectionModulusY: 1000000,
    area: 3000,
    shearAreaY: 1800,
    height: 200,
    flangeThickness: 10,
    rootRadius: 8,
    webThickness: 6,
    width: 100,
  };
}

function material(): Record<string, unknown> {
  return { fyk: 275, metadata: { gammaM0: 1.05 } };
}

function options(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract: contract(),
    section: section(),
    material: material(),
    resultToSectionUnits: identityUnits(),
    sectionToResultUnits: identityUnits(),
    serviceability: { vibration: { enabled: true } },
    ...overrides,
  };
}

void test("steel FEM 3D advanced checks match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadFem3DModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelFem3DVerification.js",
  );
  const typescript = await loadFem3DModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelFem3DVerification.js",
  );
  assert.notEqual(source.verifySteelFem3DAdvanced, typescript.verifySteelFem3DAdvanced);

  exactJson(
    source.steelUnsupportedFeatureCatalog(),
    typescript.steelUnsupportedFeatureCatalog(),
    "unsupported feature catalog",
  );
  exactJson(
    source.verifySteelFem3DAdvanced(options()),
    typescript.verifySteelFem3DAdvanced(options()),
    "complete SLU advanced checks",
  );
  exactJson(
    source.verifySteelFem3DAdvanced(
      options({
        contract: contract({
          member: {
            ...contract().member,
            webPanels: [],
            concentratedLoads: [],
          },
        }),
        section: { ...section(), height: 1000, flangeThickness: 20, webThickness: 4 },
      }),
    ),
    typescript.verifySteelFem3DAdvanced(
      options({
        contract: contract({
          member: {
            ...contract().member,
            webPanels: [],
            concentratedLoads: [],
          },
        }),
        section: { ...section(), height: 1000, flangeThickness: 20, webThickness: 4 },
      }),
    ),
    "missing panel boundaries",
  );
  exactJson(
    source.verifySteelFem3DAdvanced(
      options({
        contract: contract({
          member: {
            ...contract().member,
            concentratedLoads: [],
          },
          combinations: [
            {
              id: "ULS-λ",
              limitState: "SLU",
              stations: [station(0, { N: 100000, T: 5000, B: 100000 })],
            },
          ],
        }),
        section: { ...section(), family: "L" },
      }),
    ),
    typescript.verifySteelFem3DAdvanced(
      options({
        contract: contract({
          member: {
            ...contract().member,
            concentratedLoads: [],
          },
          combinations: [
            {
              id: "ULS-λ",
              limitState: "SLU",
              stations: [station(0, { N: 100000, T: 5000, B: 100000 })],
            },
          ],
        }),
        section: { ...section(), family: "L" },
      }),
    ),
    "unsupported torsional and bimoment features",
  );
  exactJson(
    source.verifySteelFem3DAdvanced(
      options({ resistance: { coldFormed: true, fatigue: { enabled: true } } }),
    ),
    typescript.verifySteelFem3DAdvanced(
      options({ resistance: { coldFormed: true, fatigue: { enabled: true } } }),
    ),
    "cold-formed and fatigue unsupported features",
  );
  assertErrorParity(
    () => source.verifySteelFem3DAdvanced(null),
    () => typescript.verifySteelFem3DAdvanced(null),
    "null FEM 3D options error",
  );
});
