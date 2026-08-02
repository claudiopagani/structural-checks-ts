import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeConnector {
  readonly kser: number;
  readonly ku: number;
  readonly fvrk: number;
  embedmentStrength(rhoK: number): number;
  yieldMoment(): number;
  timberTimberCharacteristicResistance(section1Thickness: number): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeConnectorModule {
  readonly TimberDowelConnector: new (options?: unknown) => RuntimeConnector;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConnectorModule(value: unknown): value is RuntimeConnectorModule {
  return isRecord(value) && typeof value.TimberDowelConnector === "function";
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
    id: "dowel-16",
    name: "Dowel \u6728",
    diameter: 0.016,
    timberDensityMean: 410,
    timberDensityCharacteristicSection1: 380,
    timberDensityCharacteristicSection2: 410,
    ultimateTensileStrength: 360,
    penetrationLength: 0.09,
    spacing: 0.05,
    gammaConnection: 1.5,
    kmod: 0.9,
    units: { force: "kN", length: "m" },
    metadata: { label: "Dowel: \u03bb-\u00e9" },
  };
}

async function loadModules(): Promise<{
  source: RuntimeConnectorModule;
  typescript: RuntimeConnectorModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "connectors", "TimberDowelConnector.js"))
      .href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "connectors", "TimberDowelConnector.js"),
    ).href
  );

  if (!isConnectorModule(sourceModule) || !isConnectorModule(typescriptModule)) {
    throw new Error("TimberDowelConnector modules do not expose the expected constructor.");
  }

  return { source: sourceModule, typescript: typescriptModule };
}

void test("TimberDowelConnector matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();

  assert.notEqual(source.TimberDowelConnector, typescript.TimberDowelConnector);

  const sourceConnector = new source.TimberDowelConnector(connectorFixture());
  const typescriptConnector = new typescript.TimberDowelConnector(connectorFixture());
  assert.equal(sourceConnector instanceof source.TimberDowelConnector, true);
  assert.equal(typescriptConnector instanceof typescript.TimberDowelConnector, true);
  assert.equal(sourceConnector instanceof typescript.TimberDowelConnector, false);
  assert.equal(typescriptConnector instanceof source.TimberDowelConnector, false);
  assertExactValues(sourceConnector.toJSON(), typescriptConnector.toJSON(), "connector JSON");
  assert.equal(
    sourceConnector.embedmentStrength(380),
    typescriptConnector.embedmentStrength(380),
    "embedment strength",
  );
  assert.equal(sourceConnector.yieldMoment(), typescriptConnector.yieldMoment(), "yield moment");
  assertExactValues(
    sourceConnector.timberTimberCharacteristicResistance(40),
    typescriptConnector.timberTimberCharacteristicResistance(40),
    "timber-timber resistance",
  );

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

  assertErrorParity(
    () =>
      new source.TimberDowelConnector({
        diameter: 16,
        timberDensityMean: 410,
        timberDensityCharacteristicSection1: 380,
        timberDensityCharacteristicSection2: 410,
        ultimateTensileStrength: 360,
        penetrationLength: 90,
        spacing: 50,
      }),
    () =>
      new typescript.TimberDowelConnector({
        diameter: 16,
        timberDensityMean: 410,
        timberDensityCharacteristicSection1: 380,
        timberDensityCharacteristicSection2: 410,
        ultimateTensileStrength: 360,
        penetrationLength: 90,
        spacing: 50,
      }),
    "missing units",
  );
  assertErrorParity(
    () =>
      new source.TimberDowelConnector({
        diameter: 0,
        timberDensityMean: 410,
        timberDensityCharacteristicSection1: 380,
        timberDensityCharacteristicSection2: 410,
        ultimateTensileStrength: 360,
        penetrationLength: 90,
        spacing: 50,
        units: { force: "N", length: "mm" },
      }),
    () =>
      new typescript.TimberDowelConnector({
        diameter: 0,
        timberDensityMean: 410,
        timberDensityCharacteristicSection1: 380,
        timberDensityCharacteristicSection2: 410,
        ultimateTensileStrength: 360,
        penetrationLength: 90,
        spacing: 50,
        units: { force: "N", length: "mm" },
      }),
    "invalid diameter",
  );
  assertErrorParity(
    () => new source.TimberDowelConnector(),
    () => new typescript.TimberDowelConnector(),
    "missing constructor options",
  );
});
