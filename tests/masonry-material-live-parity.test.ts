import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeMasonryMaterial {
  readonly masonryType: string;
  readonly unitType: string | null;
  readonly mortarType: string | null;
  readonly fm: number | null | undefined;
  readonly tau0: number | null | undefined;
  readonly fv0: number | null | undefined;
  isExistingMaterial(): boolean;
  clone(): RuntimeMasonryMaterial;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  readonly MasonryMaterial: new (options: Record<string, unknown>) => RuntimeMasonryMaterial;
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    "MasonryMaterial" in value &&
    typeof Reflect.get(value, "MasonryMaterial") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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

void test("MasonryMaterial matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("MasonryMaterial exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.MasonryMaterial, typescriptModuleValue.MasonryMaterial);
  const options = {
    id: "masonry-\u03B1",
    name: "Masonry \u03B2",
    masonryType: "brick",
    unitType: "solid",
    mortarType: "lime",
    fm: 4.5,
    tau0: 0.08,
    fv0: 0.15,
    units: { force: "N", length: "mm" },
    metadata: { label: "muratura \u03B3" },
  };
  const sourceMaterial = new sourceModuleValue.MasonryMaterial(options);
  const typescriptMaterial = new typescriptModuleValue.MasonryMaterial(options);

  assert.equal(sourceMaterial.isExistingMaterial(), false);
  assert.equal(typescriptMaterial.isExistingMaterial(), false);
  assert.deepEqual(Object.keys(typescriptMaterial), Object.keys(sourceMaterial));
  assert.deepEqual(typescriptMaterial.toJSON(), sourceMaterial.toJSON());
  assert.equal(
    JSON.stringify(typescriptMaterial.toJSON()),
    JSON.stringify(sourceMaterial.toJSON()),
  );
  assert.deepEqual(typescriptMaterial.clone().toJSON(), sourceMaterial.clone().toJSON());

  assert.deepEqual(
    errorSnapshot(
      () =>
        new sourceModuleValue.MasonryMaterial({
          name: "Missing units",
          masonryType: "brick",
        }),
    ),
    errorSnapshot(
      () =>
        new typescriptModuleValue.MasonryMaterial({
          name: "Missing units",
          masonryType: "brick",
        }),
    ),
  );
});
