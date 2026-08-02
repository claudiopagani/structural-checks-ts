import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeConnector {
  toJSON(): Record<string, unknown>;
}

interface RuntimeFactoryModule {
  readonly createTecnariaConnector: (options?: unknown) => RuntimeConnector;
}

interface RuntimeConnectorClassModule {
  readonly TecnariaConnector: new (options?: unknown) => RuntimeConnector;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFactoryModule(value: unknown): value is RuntimeFactoryModule {
  return isRecord(value) && typeof value.createTecnariaConnector === "function";
}

function isConnectorClassModule(value: unknown): value is RuntimeConnectorClassModule {
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
    id: "factory-connector",
    units: { force: "N", length: "mm" },
    metadata: { label: "Factory: \u03bb-\u00e9" },
  };
}

async function loadModules(): Promise<{
  sourceFactory: RuntimeFactoryModule;
  typescriptFactory: RuntimeFactoryModule;
  sourceConnector: RuntimeConnectorClassModule;
  typescriptConnector: RuntimeConnectorClassModule;
}> {
  const sourceFactoryModule: unknown = await import(
    pathToFileURL(
      path.join(sourceRoot, "src", "domain", "connectors", "createTecnariaConnector.js"),
    ).href
  );
  const typescriptFactoryModule: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "connectors", "createTecnariaConnector.js"),
    ).href
  );
  const sourceConnectorModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "connectors", "TecnariaConnector.js")).href
  );
  const typescriptConnectorModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "connectors", "TecnariaConnector.js"))
      .href
  );

  if (
    !isFactoryModule(sourceFactoryModule) ||
    !isFactoryModule(typescriptFactoryModule) ||
    !isConnectorClassModule(sourceConnectorModule) ||
    !isConnectorClassModule(typescriptConnectorModule)
  ) {
    throw new Error("Tecnaria connector factory modules do not expose the expected API.");
  }

  return {
    sourceFactory: sourceFactoryModule,
    typescriptFactory: typescriptFactoryModule,
    sourceConnector: sourceConnectorModule,
    typescriptConnector: typescriptConnectorModule,
  };
}

void test("createTecnariaConnector matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { sourceFactory, typescriptFactory, sourceConnector, typescriptConnector } =
    await loadModules();

  assert.notEqual(sourceFactory.createTecnariaConnector, typescriptFactory.createTecnariaConnector);

  const sourceResult = sourceFactory.createTecnariaConnector(connectorFixture());
  const typescriptResult = typescriptFactory.createTecnariaConnector(connectorFixture());
  assert.equal(sourceResult instanceof sourceConnector.TecnariaConnector, true);
  assert.equal(typescriptResult instanceof typescriptConnector.TecnariaConnector, true);
  assert.equal(sourceResult instanceof typescriptConnector.TecnariaConnector, false);
  assert.equal(typescriptResult instanceof sourceConnector.TecnariaConnector, false);
  assertExactValues(sourceResult.toJSON(), typescriptResult.toJSON(), "factory JSON");

  assertErrorParity(
    () =>
      sourceFactory.createTecnariaConnector({
        type: "MAXI",
        boardThickness: 0,
      }),
    () =>
      typescriptFactory.createTecnariaConnector({
        type: "MAXI",
        boardThickness: 0,
      }),
    "missing units delegation",
  );
  assertErrorParity(
    () =>
      sourceFactory.createTecnariaConnector({
        type: "UNKNOWN",
        boardThickness: 0,
        units: { force: "N", length: "mm" },
      }),
    () =>
      typescriptFactory.createTecnariaConnector({
        type: "UNKNOWN",
        boardThickness: 0,
        units: { force: "N", length: "mm" },
      }),
    "unsupported configuration delegation",
  );
  assertErrorParity(
    () => sourceFactory.createTecnariaConnector(),
    () => typescriptFactory.createTecnariaConnector(),
    "missing options delegation",
  );
});
