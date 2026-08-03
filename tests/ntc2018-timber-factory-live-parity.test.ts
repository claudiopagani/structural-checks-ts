import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  GlulamTimberMaterial,
  SolidTimberMaterial,
  TimberMaterial,
  createNTC2018TimberMaterial,
} from "../dist/index.js";
import type { CreateNTC2018TimberMaterialOptions } from "../dist/index.js";

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
const sourceFactory = sourceFactoryModule.createNTC2018TimberMaterial;
const sourceRootFactory = sourceIndex.createNTC2018TimberMaterial;

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
  overrides: Partial<CreateNTC2018TimberMaterialOptions> = {},
): CreateNTC2018TimberMaterialOptions {
  return {
    strengthClass: "C30",
    units: { force: "N", length: "mm" },
    ...overrides,
  };
}

void test("NTC 2018 timber factory matches the pinned JavaScript implementation", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.equal(typeof sourceFactory, "function");
  assert.equal(typeof sourceRootFactory, "function");

  const cases: CreateNTC2018TimberMaterialOptions[] = [
    createOptions(),
    createOptions({
      strengthClass: "C14",
      id: "TIMBER-Ø-14",
      name: "Legno Δ — C14",
      gammaM: 1.3,
      serviceClass: 3,
      kmod: 0.6,
      metadata: { source: "catalog-Ø", label: "C14 — legno" },
    }),
    createOptions({
      strengthClass: "GL32c",
      units: { force: "kN", length: "m" },
      gammaM: 1.45,
      serviceClass: 2,
      kmod: 0.7,
    }),
    createOptions({ strengthClass: "GL24h", metadata: { note: "Unicode ✓" } }),
  ];

  for (const options of cases) {
    const target = createNTC2018TimberMaterial(options);
    const source = callUnknownFactory(sourceFactory, options);

    assert.equal(target instanceof TimberMaterial, true);
    assert.equal(
      target instanceof SolidTimberMaterial || target instanceof GlulamTimberMaterial,
      true,
    );
    assert.equal(JSON.stringify(target.toJSON()), serializeUnknownMaterial(source));
  }

  const targetAlias = createNTC2018TimberMaterial(createOptions({ strengthClass: "GL24c" }));
  const sourceAlias = callUnknownFactory(
    sourceRootFactory,
    createOptions({ strengthClass: "GL24c" }),
  );
  assert.equal(JSON.stringify(targetAlias.toJSON()), serializeUnknownMaterial(sourceAlias));

  const errorCases: unknown[] = [
    { strengthClass: "C30" },
    { strengthClass: "C999", units: { force: "N", length: "mm" } },
    { strengthClass: "C30", units: { force: "kip", length: "mm" } },
  ];

  for (const options of errorCases) {
    const targetError = errorSignature(() =>
      callUnknownFactory(createNTC2018TimberMaterial, options),
    );
    const sourceError = errorSignature(() => callUnknownFactory(sourceFactory, options));
    assert.deepEqual(targetError, sourceError);
  }
});
