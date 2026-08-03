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

interface RuntimeLateralTorsionalModule {
  readonly calculateElasticCriticalMomentLT: (options?: unknown) => unknown;
  readonly verifySteelLateralTorsionalBuckling: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly calculateElasticCriticalMomentLT: unknown;
  readonly verifySteelLateralTorsionalBuckling: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLateralTorsionalModule(value: unknown): value is RuntimeLateralTorsionalModule {
  return (
    isRecord(value) &&
    typeof value.calculateElasticCriticalMomentLT === "function" &&
    typeof value.verifySteelLateralTorsionalBuckling === "function"
  );
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    "calculateElasticCriticalMomentLT" in value &&
    "verifySteelLateralTorsionalBuckling" in value
  );
}

async function loadLateralTorsionalModule(
  root: string,
  relativePath: string,
): Promise<RuntimeLateralTorsionalModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isLateralTorsionalModule(module)) {
    throw new Error(
      `The module ${relativePath} does not expose lateral-torsional buckling checks.`,
    );
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose lateral-torsional buckling checks.");
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

const section = {
  family: "IPE",
  height: 200,
  width: 100,
  inertiaZ: 1420000,
  torsionalConstant: 12000,
  warpingConstant: 800000000,
  metadata: {
    unitSystem: { force: "N", length: "mm" },
    catalogUnitSystem: { force: "N", length: "mm" },
  },
};

const material = {
  elasticModulus: 210000,
  poissonRatio: 0.3,
  fyk: 275,
  metadata: { gammaM1: 1.05 },
};

const verificationOptions = {
  section,
  material,
  mEd: 60000000,
  sectionClass: 1,
  bendingSectionModulus: 220000,
  unbracedLength: 3000,
};

void test("steel lateral-torsional buckling matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadLateralTorsionalModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelLateralTorsionalBuckling.js",
  );
  const typescript = await loadLateralTorsionalModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelLateralTorsionalBuckling.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(
    sourceRootModule.calculateElasticCriticalMomentLT,
    source.calculateElasticCriticalMomentLT,
  );
  assert.equal(
    typescriptRootModule.calculateElasticCriticalMomentLT,
    typescript.calculateElasticCriticalMomentLT,
  );
  assert.equal(
    sourceRootModule.verifySteelLateralTorsionalBuckling,
    source.verifySteelLateralTorsionalBuckling,
  );
  assert.equal(
    typescriptRootModule.verifySteelLateralTorsionalBuckling,
    typescript.verifySteelLateralTorsionalBuckling,
  );
  assert.notEqual(
    source.verifySteelLateralTorsionalBuckling,
    typescript.verifySteelLateralTorsionalBuckling,
  );

  const automaticSource = source.calculateElasticCriticalMomentLT({
    section,
    material,
    unbracedLength: 3000,
  });
  const automaticTypescript = typescript.calculateElasticCriticalMomentLT({
    section,
    material,
    unbracedLength: 3000,
  });
  exactJson(automaticSource, automaticTypescript, "automatic critical moment");
  assert.ok(isRecord(automaticSource));
  assert.ok(isRecord(automaticTypescript));
  assert.equal(automaticTypescript.value, automaticSource.value, "exact critical moment value");

  exactJson(
    source.verifySteelLateralTorsionalBuckling(verificationOptions),
    typescript.verifySteelLateralTorsionalBuckling(verificationOptions),
    "automatic lateral-torsional buckling verification",
  );
  exactJson(
    source.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      criticalMoment: 150000000,
      criticalMomentSource: "catalog-λ",
      curve: "c",
      imperfectionFactor: 0.49,
      beta: 1.1,
      lambda0: 0.2,
      fFactor: 0.95,
      kChi: 0.98,
    }),
    typescript.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      criticalMoment: 150000000,
      criticalMomentSource: "catalog-λ",
      curve: "c",
      imperfectionFactor: 0.49,
      beta: 1.1,
      lambda0: 0.2,
      fFactor: 0.95,
      kChi: 0.98,
    }),
    "user-provided critical moment and Unicode source",
  );
  exactJson(
    source.calculateElasticCriticalMomentLT({
      section: { family: "L-λ" },
      material,
      unbracedLength: 3000,
    }),
    typescript.calculateElasticCriticalMomentLT({
      section: { family: "L-λ" },
      material,
      unbracedLength: 3000,
    }),
    "unsupported family and Unicode warning",
  );
  exactJson(
    source.calculateElasticCriticalMomentLT({
      section,
      material: { fyk: 275 },
      unbracedLength: null,
    }),
    typescript.calculateElasticCriticalMomentLT({
      section,
      material: { fyk: 275 },
      unbracedLength: null,
    }),
    "missing automatic critical moment inputs",
  );
  exactJson(
    source.verifySteelLateralTorsionalBuckling({
      section: { family: "CHS" },
      material,
      mEd: 10000000,
      sectionClass: 1,
      bendingSectionModulus: 220000,
    }),
    typescript.verifySteelLateralTorsionalBuckling({
      section: { family: "CHS" },
      material,
      mEd: 10000000,
      sectionClass: 1,
      bendingSectionModulus: 220000,
    }),
    "axisymmetric-section exemption",
  );
  exactJson(
    source.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      sectionClass: 4,
    }),
    typescript.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      sectionClass: 4,
    }),
    "class 4 unsupported behavior",
  );
  exactJson(
    source.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      material: { fyk: 275 },
      criticalMoment: null,
    }),
    typescript.verifySteelLateralTorsionalBuckling({
      ...verificationOptions,
      material: { fyk: 275 },
      criticalMoment: null,
    }),
    "missing verification inputs",
  );

  assertErrorParity(
    () => source.calculateElasticCriticalMomentLT(null),
    () => typescript.calculateElasticCriticalMomentLT(null),
    "null critical moment options error",
  );
  assertErrorParity(
    () => source.verifySteelLateralTorsionalBuckling(null),
    () => typescript.verifySteelLateralTorsionalBuckling(null),
    "null lateral-torsional verification options error",
  );
});
