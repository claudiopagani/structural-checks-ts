import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeModule = Record<string, unknown>;
type RuntimeOpening = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type RuntimeOpeningsModel = {
  toJSON(): unknown;
  totalLength(): number;
  maxHeight(): number;
  openings: readonly RuntimeOpening[];
  openingEnvelope(opening: RuntimeOpening): unknown;
};
type RuntimePierModel = {
  toJSON(): unknown;
  xEnd(): number;
};
type RuntimeSpandrelModel = {
  toJSON(): unknown;
  length(): number;
};

interface RootRuntimeModule extends RuntimeModule {
  MasonryWallOpeningsModel: new (input: unknown) => RuntimeOpeningsModel;
  MasonryWallPierModel: new (input: unknown) => RuntimePierModel;
  MasonryWallSpandrelModel: new (input: unknown) => RuntimeSpandrelModel;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.MasonryWallOpeningsModel === "function" &&
    typeof value.MasonryWallPierModel === "function" &&
    typeof value.MasonryWallSpandrelModel === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual([...typescriptJson], [...sourceJson], `${label}: exact Unicode`);
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The masonry wall opening model operation threw a non-Error value.", {
        cause: error,
      });
    }
    return { name: error.name, message: error.message };
  }
}

function material(): { toJSON(): unknown } {
  return {
    toJSON: () => ({ name: "malta — μ", fm: 2.4 }),
  };
}

void test("masonry wall opening models match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue)
  ) {
    throw new Error("Masonry wall opening model exports do not expose the expected API.");
  }

  for (const name of [
    "MasonryWallOpeningsModel",
    "MasonryWallPierModel",
    "MasonryWallSpandrelModel",
  ] as const) {
    const sourceValue: unknown = sourceRootModuleValue[name];
    const typescriptValue: unknown = typescriptRootModuleValue[name];
    assert.equal(typeof sourceValue, "function", `${name} source constructor`);
    assert.equal(typeof typescriptValue, "function", `${name} TypeScript constructor`);
    assert.notEqual(typescriptValue, sourceValue, `${name} independent implementation`);
    assert.equal(typescriptRootModuleValue[name], typescriptValue, `${name} TypeScript root alias`);
    assert.equal(sourceRootModuleValue[name], sourceValue, `${name} source root alias`);
  }

  const openingsOptions = {
    id: "allineamento-δ",
    label: "Muro μ — facciata",
    units: { force: "kN", length: "cm" },
    walls: [
      {
        id: "muro-α",
        length: 240,
        height: 300,
        thickness: 30,
        material: { name: "laterizio — α" },
        verticalLineLoad: {
          roof: { value: 1.25, description: "carico — copertura" },
          floor: 2,
        },
        metadata: { source: "fixture — γ" },
      },
      {
        id: "muro-β",
        length: 160,
        height: 280,
        thickness: 25,
        verticalLineLoad: 3.5,
      },
    ],
    openings: [
      {
        id: "apertura-μ",
        x: 30,
        y: 80,
        width: 90,
        height: 210,
        ringFrame: { profileWidthInPlane: 4, metadata: { label: "cerchiatura" } },
        lintel: { bearingLength: 12, metadata: { note: "architrave" } },
        metadata: { label: "porta — ingresso" },
      },
    ],
    settings: {
      normativePreset: "tuscany-openings-2022",
      residualPierWarningThreshold: 15,
      customLabel: "stato — fatto",
    },
    metadata: { source: "oracolo — NTC", author: "工程" },
  };
  const sourceOpenings = new sourceRootModuleValue.MasonryWallOpeningsModel(openingsOptions);
  const typescriptOpenings = new typescriptRootModuleValue.MasonryWallOpeningsModel(
    openingsOptions,
  );
  assertExactParity(sourceOpenings.toJSON(), typescriptOpenings.toJSON(), "openings model JSON");
  assert.equal(typescriptOpenings.totalLength(), sourceOpenings.totalLength());
  assert.equal(typescriptOpenings.maxHeight(), sourceOpenings.maxHeight());
  const sourceOpening = sourceOpenings.openings[0];
  const typescriptOpening = typescriptOpenings.openings[0];
  if (sourceOpening === undefined || typescriptOpening === undefined) {
    throw new Error("The parity fixture did not create an opening.");
  }
  assertExactParity(
    sourceOpenings.openingEnvelope(sourceOpening),
    typescriptOpenings.openingEnvelope(typescriptOpening),
    "opening envelope",
  );

  const pierOptions = {
    id: "pila-δ",
    wallId: "muro-α",
    sourceWallIds: ["muro-α", "muro-α", "muro-β"],
    alignmentId: "allineamento-δ",
    x: 0.3,
    length: 1.2,
    effectiveLength: 1.1,
    height: 2.8,
    thickness: 0.3,
    material: material(),
    tributaryVerticalLoad: 12.5,
    tributaryLoadByWall: { "muro-α": 8, "muro-β": 4.5 },
    deformableHeight: 2.4,
    rigidBottomLength: 0.2,
    rigidTopLength: 0.2,
    topBoundaryMode: "diaphragm — rigido",
    mechanics: { stiffness: 42 },
    capacity: { shear: 18 },
    metadata: { label: "pila — γ" },
  };
  const sourcePier = new sourceRootModuleValue.MasonryWallPierModel(pierOptions);
  const typescriptPier = new typescriptRootModuleValue.MasonryWallPierModel(pierOptions);
  assertExactParity(sourcePier.toJSON(), typescriptPier.toJSON(), "pier model JSON");
  assert.equal(typescriptPier.xEnd(), sourcePier.xEnd());

  const spandrelOptions = {
    id: "fascia-β",
    alignmentId: "allineamento-δ",
    xStart: 0.3,
    xEnd: 1.5,
    height: 0.6,
    thickness: 0.3,
    material: material(),
    sourceWallIds: ["muro-α", "muro-α", "muro-β"],
    deformableLength: 1,
    rigidLeftLength: 0.1,
    rigidRightLength: 0.1,
    mechanics: { stiffness: 24 },
    metadata: { label: "fascia — ζ" },
  };
  const sourceSpandrel = new sourceRootModuleValue.MasonryWallSpandrelModel(spandrelOptions);
  const typescriptSpandrel = new typescriptRootModuleValue.MasonryWallSpandrelModel(
    spandrelOptions,
  );
  assertExactParity(sourceSpandrel.toJSON(), typescriptSpandrel.toJSON(), "spandrel model JSON");
  assert.equal(typescriptSpandrel.length(), sourceSpandrel.length());

  const invalidPier = { ...pierOptions, id: "" };
  assert.deepEqual(
    captureError(() => new sourceRootModuleValue.MasonryWallPierModel(invalidPier)),
    captureError(() => new typescriptRootModuleValue.MasonryWallPierModel(invalidPier)),
    "pier validation error",
  );
  const invalidSpandrel = { ...spandrelOptions, xEnd: 0.2 };
  assert.deepEqual(
    captureError(() => new sourceRootModuleValue.MasonryWallSpandrelModel(invalidSpandrel)),
    captureError(() => new typescriptRootModuleValue.MasonryWallSpandrelModel(invalidSpandrel)),
    "spandrel validation error",
  );
  const invalidOpenings = { ...openingsOptions, units: null };
  assert.deepEqual(
    captureError(() => new sourceRootModuleValue.MasonryWallOpeningsModel(invalidOpenings)),
    captureError(() => new typescriptRootModuleValue.MasonryWallOpeningsModel(invalidOpenings)),
    "openings unit error",
  );
  const emptyOpenings = { ...openingsOptions, walls: [] };
  assert.deepEqual(
    captureError(() => new sourceRootModuleValue.MasonryWallOpeningsModel(emptyOpenings)),
    captureError(() => new typescriptRootModuleValue.MasonryWallOpeningsModel(emptyOpenings)),
    "openings missing-wall error",
  );
});
