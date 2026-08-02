import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeConnector {
  readonly type: unknown;
  readonly boardThickness: number;
  readonly kser: number;
  readonly ku: number;
  readonly fvrk: number;
  toJSON(): Record<string, unknown>;
}

interface RuntimeConnectorModule {
  readonly TecnariaConnector: new (options?: unknown) => RuntimeConnector;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConnectorModule(value: unknown): value is RuntimeConnectorModule {
  return isRecord(value) && typeof value.TecnariaConnector === "function";
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

function connectorFixture(): Record<string, unknown> {
  return {
    type: "MAXI",
    boardThickness: "2",
    id: "tecnaria-connector",
    name: "Connettore \u6728",
    units: { force: "N", length: "mm" },
    metadata: { label: "Catalogo: \u03bb-\u00e9" },
  };
}

async function loadModules(): Promise<{
  source: RuntimeConnectorModule;
  typescript: RuntimeConnectorModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "connectors", "TecnariaConnector.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "connectors", "TecnariaConnector.js"))
      .href
  );

  if (!isConnectorModule(sourceModule) || !isConnectorModule(typescriptModule)) {
    throw new Error("TecnariaConnector modules do not expose the expected constructor.");
  }

  return { source: sourceModule, typescript: typescriptModule };
}

void test("TecnariaConnector matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  assert.notEqual(source.TecnariaConnector, typescript.TecnariaConnector);

  const sourceConnector = new source.TecnariaConnector(connectorFixture());
  const typescriptConnector = new typescript.TecnariaConnector(connectorFixture());
  assert.equal(sourceConnector instanceof source.TecnariaConnector, true);
  assert.equal(typescriptConnector instanceof typescript.TecnariaConnector, true);
  assert.equal(sourceConnector instanceof typescript.TecnariaConnector, false);
  assert.equal(typescriptConnector instanceof source.TecnariaConnector, false);
  assertExactValues(sourceConnector.toJSON(), typescriptConnector.toJSON(), "connector JSON");
  assert.equal(sourceConnector.type, typescriptConnector.type, "connector type");
  assert.equal(
    sourceConnector.boardThickness,
    typescriptConnector.boardThickness,
    "board thickness",
  );
  assert.equal(sourceConnector.kser, typescriptConnector.kser, "Kser");
  assert.equal(sourceConnector.ku, typescriptConnector.ku, "Ku");
  assert.equal(sourceConnector.fvrk, typescriptConnector.fvrk, "Fvrk");

  const sourceSerialized = sourceConnector.toJSON();
  const typescriptSerialized = typescriptConnector.toJSON();
  assert.ok(isRecord(sourceSerialized.metadata) && isRecord(typescriptSerialized.metadata));
  sourceSerialized.metadata.label = "mutated";
  typescriptSerialized.metadata.label = "mutated";
  assertExactValues(
    sourceConnector.toJSON(),
    typescriptConnector.toJSON(),
    "connector clone isolation",
  );

  const sourceDefault = new source.TecnariaConnector({
    type: "BASE",
    boardThickness: 0,
    units: { force: "N", length: "mm" },
  });
  const typescriptDefault = new typescript.TecnariaConnector({
    type: "BASE",
    boardThickness: 0,
    units: { force: "N", length: "mm" },
  });
  assertExactValues(sourceDefault.toJSON(), typescriptDefault.toJSON(), "default connector");

  assertErrorParity(
    () =>
      new source.TecnariaConnector({
        type: "MAXI",
        boardThickness: 0,
      }),
    () =>
      new typescript.TecnariaConnector({
        type: "MAXI",
        boardThickness: 0,
      }),
    "missing units",
  );
  assertErrorParity(
    () =>
      new source.TecnariaConnector({
        type: "UNKNOWN",
        boardThickness: 0,
        units: { force: "N", length: "mm" },
      }),
    () =>
      new typescript.TecnariaConnector({
        type: "UNKNOWN",
        boardThickness: 0,
        units: { force: "N", length: "mm" },
      }),
    "unsupported type",
  );
  assertErrorParity(
    () =>
      new source.TecnariaConnector({
        type: "MAXI",
        boardThickness: 1,
        units: { force: "N", length: "mm" },
      }),
    () =>
      new typescript.TecnariaConnector({
        type: "MAXI",
        boardThickness: 1,
        units: { force: "N", length: "mm" },
      }),
    "unsupported board thickness",
  );
  assertErrorParity(
    () => new source.TecnariaConnector(),
    () => new typescript.TecnariaConnector(),
    "missing constructor options",
  );
});
