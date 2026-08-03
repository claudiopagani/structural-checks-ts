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

interface RuntimeClassificationModule {
  readonly classifySteelSection: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly classifySteelSection: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isClassificationModule(value: unknown): value is RuntimeClassificationModule {
  return isRecord(value) && typeof value.classifySteelSection === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return isRecord(value) && "classifySteelSection" in value;
}

async function loadClassificationModule(
  root: string,
  relativePath: string,
): Promise<RuntimeClassificationModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isClassificationModule(module)) {
    throw new Error(`The module ${relativePath} does not expose steel section classification.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose steel section classification.");
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

function section(family: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    family,
    profileName: `${family}-λ`,
    height: 200,
    width: 100,
    webThickness: 6,
    flangeThickness: 10,
    rootRadius: 8,
    area: 3000,
    inertiaY: 20000000,
    inertiaZ: 1500000,
    ...overrides,
  };
}

const material = { fyk: 275 };

void test("steel section classification matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadClassificationModule(
    sourceRoot,
    "src/applications/steel-frames/checks/SteelSectionClassification.js",
  );
  const typescript = await loadClassificationModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/SteelSectionClassification.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(sourceRootModule.classifySteelSection, source.classifySteelSection);
  assert.equal(typescriptRootModule.classifySteelSection, typescript.classifySteelSection);
  assert.notEqual(source.classifySteelSection, typescript.classifySteelSection);

  const ipeOptions = {
    section: section("IPE", { profileName: "IPE200-λ" }),
    material,
    nEd: 0,
    mEd: 20000000,
  };
  const ipeSource = source.classifySteelSection(ipeOptions);
  const ipeTypescript = typescript.classifySteelSection(ipeOptions);
  exactJson(ipeSource, ipeTypescript, "I/H profile classification");
  assert.ok(isRecord(ipeSource));
  assert.ok(isRecord(ipeTypescript));
  assert.equal(ipeTypescript.class, ipeSource.class, "exact I/H section class");

  exactJson(
    source.classifySteelSection({
      section: section("UPN", { width: 80, webThickness: 7, flangeThickness: 11 }),
      material,
      nEd: 0,
      mEd: 20000000,
    }),
    typescript.classifySteelSection({
      section: section("UPN", { width: 80, webThickness: 7, flangeThickness: 11 }),
      material,
      nEd: 0,
      mEd: 20000000,
    }),
    "UPN profile classification",
  );

  for (const [family, overrides] of [
    ["SHS", { height: 200, width: 200, webThickness: 8, flangeThickness: 8 }],
    ["CHS", { height: 219.1, width: 219.1, webThickness: 8, flangeThickness: 8 }],
    ["ROUND", { height: 40, width: 40, webThickness: 40, flangeThickness: 40 }],
    ["FLAT", { height: 100, width: 10, webThickness: 10, flangeThickness: 10 }],
    ["L", { height: 100, width: 100, webThickness: 10, flangeThickness: 10 }],
    ["LU", { height: 120, width: 80, webThickness: 8, flangeThickness: 8 }],
    ["T", { height: 100, width: 100, webThickness: 10, flangeThickness: 10 }],
  ] as const) {
    const options = { section: section(family, overrides), material, nEd: 10000, mEd: 1000000 };
    exactJson(
      source.classifySteelSection(options),
      typescript.classifySteelSection(options),
      `${family} profile classification`,
    );
  }

  exactJson(
    source.classifySteelSection({
      section: section("RHS", { height: 200, width: 100, webThickness: 6.3, flangeThickness: 6.3 }),
      material,
      nEd: 20000,
      mEd: 4000000,
      mzEd: 1000000,
    }),
    typescript.classifySteelSection({
      section: section("RHS", { height: 200, width: 100, webThickness: 6.3, flangeThickness: 6.3 }),
      material,
      nEd: 20000,
      mEd: 4000000,
      mzEd: 1000000,
    }),
    "RHS biaxial classification",
  );
  exactJson(
    source.classifySteelSection({
      section: section("RHS", { inertiaZ: null }),
      material,
      mzEd: 1000000,
    }),
    typescript.classifySteelSection({
      section: section("RHS", { inertiaZ: null }),
      material,
      mzEd: 1000000,
    }),
    "RHS missing Iz behavior",
  );
  exactJson(
    source.classifySteelSection({
      section: section("IPE"),
      material,
      nEd: -10000,
      axialForceConvention: "compression-negative",
      mEd: 1e-12,
    }),
    typescript.classifySteelSection({
      section: section("IPE"),
      material,
      nEd: -10000,
      axialForceConvention: "compression-negative",
      mEd: 1e-12,
    }),
    "compression convention and tiny action tolerances",
  );
  exactJson(
    source.classifySteelSection({ section: { family: "I-λ" }, material }),
    typescript.classifySteelSection({ section: { family: "I-λ" }, material }),
    "unsupported Unicode family",
  );
  exactJson(
    source.classifySteelSection({ section: section("IPE") }),
    typescript.classifySteelSection({ section: section("IPE") }),
    "missing yield strength",
  );
  exactJson(
    source.classifySteelSection({ section: { family: "IPE" }, material }),
    typescript.classifySteelSection({ section: { family: "IPE" }, material }),
    "missing geometry",
  );

  assertErrorParity(
    () => source.classifySteelSection(null),
    () => typescript.classifySteelSection(null),
    "null section classification options error",
  );
});
