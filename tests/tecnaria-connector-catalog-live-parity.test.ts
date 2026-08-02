import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeCatalogFamily {
  readonly boardThickness: Record<string, unknown>;
}

interface RuntimeCatalog {
  readonly BASE: RuntimeCatalogFamily;
  readonly MAXI: RuntimeCatalogFamily;
  readonly [type: string]: RuntimeCatalogFamily;
}

interface RuntimeCatalogModule {
  readonly TECNARIA_CONNECTOR_CATALOG: RuntimeCatalog;
  readonly TECNARIA_CONNECTOR_TYPES: readonly unknown[];
  readonly getTecnariaConnectorData: (type?: unknown, boardThickness?: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCatalogModule(value: unknown): value is RuntimeCatalogModule {
  return (
    isRecord(value) &&
    isRecord(value.TECNARIA_CONNECTOR_CATALOG) &&
    Array.isArray(value.TECNARIA_CONNECTOR_TYPES) &&
    typeof value.getTecnariaConnectorData === "function"
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

async function loadModules(): Promise<{
  source: RuntimeCatalogModule;
  typescript: RuntimeCatalogModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(
      path.join(sourceRoot, "src", "domain", "connectors", "tecnariaConnectorCatalog.js"),
    ).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "connectors", "tecnariaConnectorCatalog.js"),
    ).href
  );

  if (!isCatalogModule(sourceModule) || !isCatalogModule(typescriptModule)) {
    throw new Error("Tecnaria connector catalog modules do not expose the expected API.");
  }

  return { source: sourceModule, typescript: typescriptModule };
}

void test("Tecnaria connector catalog matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  assert.notEqual(source.TECNARIA_CONNECTOR_CATALOG, typescript.TECNARIA_CONNECTOR_CATALOG);
  assert.notEqual(source.TECNARIA_CONNECTOR_TYPES, typescript.TECNARIA_CONNECTOR_TYPES);
  assert.equal(Object.isFrozen(source.TECNARIA_CONNECTOR_TYPES), true);
  assert.equal(Object.isFrozen(typescript.TECNARIA_CONNECTOR_TYPES), true);

  assertExactValues(
    source.TECNARIA_CONNECTOR_CATALOG,
    typescript.TECNARIA_CONNECTOR_CATALOG,
    "catalog",
  );
  assertExactValues(source.TECNARIA_CONNECTOR_TYPES, typescript.TECNARIA_CONNECTOR_TYPES, "types");

  const lookups: readonly [unknown, unknown][] = [
    ["BASE", 0],
    ["BASE", "2"],
    ["MAXI", 4],
    ["UNKNOWN", 0],
    ["MAXI", 1],
    [null, 0],
    [undefined, undefined],
  ];

  lookups.forEach(([type, boardThickness], index) => {
    const sourceValue = source.getTecnariaConnectorData(type, boardThickness);
    const typescriptValue = typescript.getTecnariaConnectorData(type, boardThickness);
    assertExactValues(sourceValue, typescriptValue, `lookup ${index}`);
  });

  const sourceData = source.getTecnariaConnectorData("BASE", 0);
  const typescriptData = typescript.getTecnariaConnectorData("BASE", 0);
  assert.equal(sourceData, source.TECNARIA_CONNECTOR_CATALOG.BASE.boardThickness[0]);
  assert.equal(typescriptData, typescript.TECNARIA_CONNECTOR_CATALOG.BASE.boardThickness[0]);

  assertErrorParity(
    () => source.getTecnariaConnectorData("toString", 0),
    () => typescript.getTecnariaConnectorData("toString", 0),
    "inherited unsupported family",
  );
});
