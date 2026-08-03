import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SteelMaterial, createNTC2018StructuralSteelMaterial } from "../dist/index.js";
import type { CreateNTC2018StructuralSteelMaterialOptions } from "../dist/index.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceFactoryPath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "materials",
  "createNTC2018Material.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceFactoryModule = (await import(pathToFileURL(sourceFactoryPath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;
const sourceFactory = sourceFactoryModule.createNTC2018StructuralSteelMaterial;
const sourceRootFactory = sourceIndex.createNTC2018StructuralSteelMaterial;
type UnknownCallable = (this: unknown, ...args: unknown[]) => unknown;

function isUnknownCallable(value: unknown): value is UnknownCallable {
  return typeof value === "function";
}

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }

  throw new Error("Expected the callback to throw.");
}

function callUnknownFactory(factory: unknown, options: unknown): unknown {
  if (!isUnknownCallable(factory)) {
    throw new Error("Expected a callable factory export.");
  }

  return factory.call(undefined, options);
}

function serializeUnknownMaterial(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected a material object.");
  }

  return JSON.stringify(value);
}

function createOptions(
  overrides: Partial<CreateNTC2018StructuralSteelMaterialOptions> = {},
): CreateNTC2018StructuralSteelMaterialOptions {
  return {
    grade: "S275",
    units: { force: "N", length: "mm" },
    ...overrides,
  };
}

void test("NTC 2018 structural-steel factory matches the pinned JavaScript implementation", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.equal(typeof sourceFactory, "function");
  assert.equal(typeof sourceRootFactory, "function");

  const cases: CreateNTC2018StructuralSteelMaterialOptions[] = [
    createOptions(),
    createOptions({
      grade: "S235",
      id: "STEEL-235",
      name: "Acciaio strutturale Ø235",
      gammaM0: 1.0,
      density: 7850,
      elasticModulus: 210000,
      metadata: { source: "catalog-Δ", label: "S235 — acciaio" },
    }),
    createOptions({
      grade: "S355",
      units: { force: "kN", length: "m" },
      density: 78.5,
      elasticModulus: 210,
      gammaM0: 1.1,
    }),
  ];

  for (const options of cases) {
    const target = createNTC2018StructuralSteelMaterial(options);
    const source = callUnknownFactory(sourceFactory, options);

    assert.equal(target instanceof SteelMaterial, true);
    assert.equal(target.constructor.name, "SteelMaterial");
    assert.equal(JSON.stringify(target.toJSON()), serializeUnknownMaterial(source));
  }

  const targetAlias = createNTC2018StructuralSteelMaterial(createOptions({ grade: "S355" }));
  const sourceAlias = callUnknownFactory(sourceRootFactory, createOptions({ grade: "S355" }));
  assert.equal(JSON.stringify(targetAlias.toJSON()), serializeUnknownMaterial(sourceAlias));

  const errorCases: unknown[] = [
    { grade: "S275" },
    { grade: "S999", units: { force: "N", length: "mm" } },
    { grade: "S275", units: { force: "kip", length: "mm" } },
  ];

  for (const options of errorCases) {
    const targetError = errorSignature(() =>
      callUnknownFactory(createNTC2018StructuralSteelMaterial, options),
    );
    const sourceError = errorSignature(() => callUnknownFactory(sourceFactory, options));
    assert.deepEqual(targetError, sourceError);
  }
});
