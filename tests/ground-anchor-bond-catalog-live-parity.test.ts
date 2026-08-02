import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeEntry {
  id: string;
  name: string;
  ultimateTransferLoad: number;
  capacityDivisor: number;
  reference: Record<string, unknown>;
}

interface RuntimeModule {
  GROUND_ANCHOR_BOND_CATALOG: Record<string, RuntimeEntry>;
  GROUND_ANCHOR_BOND_CATALOG_IDS: readonly string[];
  GROUND_ANCHOR_BOND_CATALOG_REFERENCE: Record<string, unknown>;
  getGroundAnchorBondCatalogEntry(id: string): RuntimeEntry;
  listGroundAnchorBondCatalogEntries(): RuntimeEntry[];
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "GROUND_ANCHOR_BOND_CATALOG") === "object" &&
    Array.isArray(Reflect.get(value, "GROUND_ANCHOR_BOND_CATALOG_IDS")) &&
    typeof Reflect.get(value, "GROUND_ANCHOR_BOND_CATALOG_REFERENCE") === "object" &&
    typeof Reflect.get(value, "getGroundAnchorBondCatalogEntry") === "function" &&
    typeof Reflect.get(value, "listGroundAnchorBondCatalogEntries") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function compareCatalogs(sourceModule: RuntimeModule, typescriptModule: RuntimeModule): void {
  assert.deepEqual(
    typescriptModule.GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    sourceModule.GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
  );
  assert.deepEqual(
    typescriptModule.GROUND_ANCHOR_BOND_CATALOG_IDS,
    sourceModule.GROUND_ANCHOR_BOND_CATALOG_IDS,
  );
  assert.deepEqual(
    typescriptModule.GROUND_ANCHOR_BOND_CATALOG,
    sourceModule.GROUND_ANCHOR_BOND_CATALOG,
  );
  assert.equal(
    JSON.stringify(typescriptModule.GROUND_ANCHOR_BOND_CATALOG),
    JSON.stringify(sourceModule.GROUND_ANCHOR_BOND_CATALOG),
  );

  const sourceEntries = sourceModule.listGroundAnchorBondCatalogEntries();
  const typescriptEntries = typescriptModule.listGroundAnchorBondCatalogEntries();
  assert.deepEqual(typescriptEntries, sourceEntries);
  assert.equal(JSON.stringify(typescriptEntries), JSON.stringify(sourceEntries));
  for (const id of sourceModule.GROUND_ANCHOR_BOND_CATALOG_IDS) {
    assert.deepEqual(
      typescriptModule.getGroundAnchorBondCatalogEntry(id),
      sourceModule.getGroundAnchorBondCatalogEntry(id),
    );
  }

  const sourceCopy = sourceModule.getGroundAnchorBondCatalogEntry("sand-medium-dense");
  const typescriptCopy = typescriptModule.getGroundAnchorBondCatalogEntry("sand-medium-dense");
  sourceCopy.ultimateTransferLoad = 1;
  typescriptCopy.ultimateTransferLoad = 1;
  assert.equal(
    sourceModule.getGroundAnchorBondCatalogEntry("sand-medium-dense").ultimateTransferLoad,
    typescriptModule.getGroundAnchorBondCatalogEntry("sand-medium-dense").ultimateTransferLoad,
  );
  assert.deepEqual([...sourceCopy.name], [...typescriptCopy.name]);
}

void test("ground-anchor bond catalog matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Ground-anchor bond catalog exports do not expose the expected API.");
  }
  assert.notEqual(
    Reflect.get(sourceModuleValue, "getGroundAnchorBondCatalogEntry"),
    Reflect.get(typescriptModuleValue, "getGroundAnchorBondCatalogEntry"),
  );
  compareCatalogs(sourceModuleValue, typescriptModuleValue);

  const sourceError = (() => {
    try {
      sourceModuleValue.getGroundAnchorBondCatalogEntry("missing-α");
    } catch (error) {
      return error;
    }
    return null;
  })();
  const typescriptError = (() => {
    try {
      typescriptModuleValue.getGroundAnchorBondCatalogEntry("missing-α");
    } catch (error) {
      return error;
    }
    return null;
  })();
  assert.ok(sourceError instanceof Error);
  assert.ok(typescriptError instanceof Error);
  assert.equal(typescriptError.name, sourceError.name);
  assert.equal(typescriptError.message, sourceError.message);
});
