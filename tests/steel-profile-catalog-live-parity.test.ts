import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeCatalogModule {
  readonly STEEL_PROFILE_CATALOG_UNITS: Record<string, string>;
  readonly STEEL_PROFILE_SECTION_DATABASE: Readonly<Record<string, Record<string, unknown>>>;
  readonly STEEL_PROFILE_SECTION_NAMES: readonly string[];
  readonly STEEL_PROFILE_FAMILIES: readonly string[];
  getSteelProfileSectionData(profileName: string): Record<string, unknown> | null;
  listSteelProfileSectionsByFamily(family: string): string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCatalogModule(value: unknown): value is RuntimeCatalogModule {
  return (
    isRecord(value) &&
    isRecord(value.STEEL_PROFILE_CATALOG_UNITS) &&
    isRecord(value.STEEL_PROFILE_SECTION_DATABASE) &&
    Array.isArray(value.STEEL_PROFILE_SECTION_NAMES) &&
    Array.isArray(value.STEEL_PROFILE_FAMILIES) &&
    typeof value.getSteelProfileSectionData === "function" &&
    typeof value.listSteelProfileSectionsByFamily === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

async function loadModules(): Promise<{
  source: RuntimeCatalogModule;
  typescript: RuntimeCatalogModule;
  sourceRoot: RuntimeCatalogModule;
  typescriptRoot: RuntimeCatalogModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "geometry", "steelProfileCatalog.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "geometry", "steelProfileCatalog.js"))
      .href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isCatalogModule(sourceModule) ||
    !isCatalogModule(typescriptModule) ||
    !isCatalogModule(sourceRootModule) ||
    !isCatalogModule(typescriptRootModule)
  ) {
    throw new Error("Steel profile catalog modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

void test("steel profile catalog matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.STEEL_PROFILE_SECTION_DATABASE, typescript.STEEL_PROFILE_SECTION_DATABASE);
  assert.equal(sourceRoot.STEEL_PROFILE_CATALOG_UNITS, source.STEEL_PROFILE_CATALOG_UNITS);
  assert.equal(typescriptRoot.STEEL_PROFILE_CATALOG_UNITS, typescript.STEEL_PROFILE_CATALOG_UNITS);
  assert.equal(
    Reflect.get(sourceRoot, "getSteelProfileSectionData"),
    Reflect.get(source, "getSteelProfileSectionData"),
  );
  assert.equal(
    Reflect.get(typescriptRoot, "getSteelProfileSectionData"),
    Reflect.get(typescript, "getSteelProfileSectionData"),
  );
  assert.deepEqual(typescript.STEEL_PROFILE_CATALOG_UNITS, source.STEEL_PROFILE_CATALOG_UNITS);
  assert.deepEqual(typescript.STEEL_PROFILE_SECTION_NAMES, source.STEEL_PROFILE_SECTION_NAMES);
  assert.deepEqual(typescript.STEEL_PROFILE_FAMILIES, source.STEEL_PROFILE_FAMILIES);
  assert.deepEqual(
    typescript.STEEL_PROFILE_SECTION_DATABASE,
    source.STEEL_PROFILE_SECTION_DATABASE,
  );
  assert.equal(
    JSON.stringify(typescript.STEEL_PROFILE_SECTION_DATABASE),
    JSON.stringify(source.STEEL_PROFILE_SECTION_DATABASE),
  );
  assert.equal(Object.isFrozen(typescript.STEEL_PROFILE_SECTION_DATABASE), true);
  assert.equal(Object.isFrozen(source.STEEL_PROFILE_SECTION_DATABASE), true);
  assert.equal(Object.isFrozen(typescript.STEEL_PROFILE_SECTION_NAMES), true);
  assert.equal(Object.isFrozen(source.STEEL_PROFILE_SECTION_NAMES), true);
  assert.equal(Object.isFrozen(typescript.STEEL_PROFILE_FAMILIES), true);
  assert.equal(Object.isFrozen(source.STEEL_PROFILE_FAMILIES), true);

  for (const profileName of ["IPE300", "UPN200", "CHS114.3X5", "SHS100X100X5"]) {
    assert.deepEqual(
      typescript.getSteelProfileSectionData(profileName),
      source.getSteelProfileSectionData(profileName),
    );
  }
  assert.equal(typescript.getSteelProfileSectionData("UNKNOWN_PROFILE"), null);
  assert.equal(source.getSteelProfileSectionData("UNKNOWN_PROFILE"), null);
  for (const family of ["IPE", "HEA", "CHS", "ROUND", "UNKNOWN_FAMILY"]) {
    assert.deepEqual(
      typescript.listSteelProfileSectionsByFamily(family),
      source.listSteelProfileSectionsByFamily(family),
    );
  }
});
