import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeProduct extends Record<string, unknown> {
  readonly layerThicknesses: unknown[];
  readonly metadata: Record<string, unknown>;
}

interface RuntimeCatalogModule {
  readonly getXlamPanelProduct: (productId: unknown) => RuntimeProduct | null;
  readonly listXlamPanelProducts: () => RuntimeProduct[];
  readonly registerXlamPanelProduct: (product: unknown) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCatalogModule(value: unknown): value is RuntimeCatalogModule {
  if (!isRecord(value)) return false;

  return (
    typeof value.getXlamPanelProduct === "function" &&
    typeof value.listXlamPanelProducts === "function" &&
    typeof value.registerXlamPanelProduct === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function assertExactValues(source: unknown, typescript: unknown, label: string): void {
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      assert.equal(left, right, `${label}${valuePath}: exact number`);
      return;
    }

    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left === "string" && typeof right === "string") {
        assert.equal(left, right, `${label}${valuePath}`);
        assert.deepEqual(codePoints(left), codePoints(right), `${label}${valuePath}: Unicode`);
      }
      return;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      if (!Array.isArray(left) || !Array.isArray(right)) return;
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }

    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      if (!isRecord(left) || !isRecord(right)) return;
      const leftKeys = Object.keys(left);
      assert.deepEqual(leftKeys, Object.keys(right), `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
    }
  };

  compare(source, typescript, "");
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

function productFixture(): Record<string, unknown> {
  return {
    id: "demo-producer-120",
    producer: "DemoProducer",
    name: "Pannello CLT 木",
    layerThicknesses: [20, 20, 20, 20, 20, 20],
    activeLayerIndexes: [0, 2, 4],
    metadata: { label: "XLAM: λ-é" },
  };
}

async function loadModules(): Promise<{
  source: RuntimeCatalogModule;
  typescript: RuntimeCatalogModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "catalogs", "xlamPanelCatalog.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "catalogs", "xlamPanelCatalog.js"))
      .href
  );

  if (!isCatalogModule(sourceModule) || !isCatalogModule(typescriptModule)) {
    throw new Error("XLAM catalog modules do not expose the expected public functions.");
  }

  return { source: sourceModule, typescript: typescriptModule };
}

void test("the XLAM panel catalog matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  assert.notEqual(source.getXlamPanelProduct, typescript.getXlamPanelProduct);
  assert.notEqual(source.listXlamPanelProducts, typescript.listXlamPanelProducts);
  assert.notEqual(source.registerXlamPanelProduct, typescript.registerXlamPanelProduct);

  assertExactValues(
    source.getXlamPanelProduct("generic-5s-30-30-30"),
    typescript.getXlamPanelProduct("generic-5s-30-30-30"),
    "default product",
  );

  const sourceFixture = productFixture();
  const typescriptFixture = productFixture();
  source.registerXlamPanelProduct(sourceFixture);
  typescript.registerXlamPanelProduct(typescriptFixture);

  assertExactValues(
    source.getXlamPanelProduct("demo-producer-120"),
    typescript.getXlamPanelProduct("demo-producer-120"),
    "registered product",
  );
  assertExactValues(
    source.listXlamPanelProducts(),
    typescript.listXlamPanelProducts(),
    "catalog listing",
  );
  assertExactValues(
    source.getXlamPanelProduct("missing"),
    typescript.getXlamPanelProduct("missing"),
    "missing product",
  );

  const sourceClone = source.getXlamPanelProduct("demo-producer-120");
  const typescriptClone = typescript.getXlamPanelProduct("demo-producer-120");
  assert.ok(sourceClone && typescriptClone);
  sourceClone.layerThicknesses[0] = 999;
  sourceClone.metadata.label = "mutated";
  typescriptClone.layerThicknesses[0] = 999;
  typescriptClone.metadata.label = "mutated";
  assertExactValues(
    source.getXlamPanelProduct("demo-producer-120"),
    typescript.getXlamPanelProduct("demo-producer-120"),
    "cloned product isolation",
  );

  assertErrorParity(
    () => source.registerXlamPanelProduct({}),
    () => typescript.registerXlamPanelProduct({}),
    "missing product id",
  );
  assertErrorParity(
    () => source.registerXlamPanelProduct(undefined),
    () => typescript.registerXlamPanelProduct(undefined),
    "missing product input",
  );
});
