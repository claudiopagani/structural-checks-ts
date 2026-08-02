import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

type RuntimeModule = Record<string, unknown>;

interface HistoricalMaterial {
  toJSON(): unknown;
  isExistingMaterial(): boolean;
}

type HistoricalFactory = (options: Record<string, unknown>) => HistoricalMaterial;

type HistoricalLookup = (grade: string) => unknown;

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHistoricalFactory(value: unknown): value is HistoricalFactory {
  return typeof value === "function";
}

function isHistoricalLookup(value: unknown): value is HistoricalLookup {
  return typeof value === "function";
}

function requireHistoricalFactory(value: unknown): HistoricalFactory {
  if (!isHistoricalFactory(value)) {
    throw new Error("Expected the historical factory to be callable.");
  }
  return value;
}

function requireHistoricalLookup(value: unknown): HistoricalLookup {
  if (!isHistoricalLookup(value)) {
    throw new Error("Expected the historical lookup to be callable.");
  }
  return value;
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertUnicodeParity(source: unknown, typescript: unknown, label: string): void {
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", `${label}: string type`);
    if (typeof typescript !== "string") {
      throw new Error(`Expected ${label} to remain a string.`);
    }
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: Unicode code points`);
    return;
  }

  if (Array.isArray(source)) {
    assert.ok(Array.isArray(typescript), `${label}: array type`);
    if (!Array.isArray(typescript)) {
      throw new Error(`Expected ${label} to remain an array.`);
    }
    assert.equal(typescript.length, source.length, `${label}: array length`);
    source.forEach((entry, index) => {
      assertUnicodeParity(entry, typescript[index], `${label}[${index}]`);
    });
    return;
  }

  if (isRecord(source)) {
    assert.ok(isRecord(typescript), `${label}: object type`);
    if (!isRecord(typescript)) {
      throw new Error(`Expected ${label} to remain an object.`);
    }
    for (const key of Object.keys(source)) {
      assertUnicodeParity(source[key], typescript[key], `${label}.${key}`);
    }
  }
}

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assertUnicodeParity(source, typescript, label);
}

function captureError(
  run: () => unknown,
): { ok: true } | { ok: false; name: string; message: string } {
  try {
    run();
    return { ok: true };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw new Error("Expected the baseline to throw an Error instance.", { cause: error });
    }
    return { ok: false, name: error.name, message: error.message };
  }
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("Italian historical reinforcement exports match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");

  const sourceIndex = await loadModule(sourceRoot, "src/norms/italian-historical/index.js");
  const typescriptIndex = await loadModule(
    path.join(repositoryRoot, "dist"),
    "norms/italian-historical/index.js",
  );
  const sourceKeys = Object.keys(sourceIndex);
  assert.deepEqual(
    Object.keys(typescriptIndex),
    sourceKeys,
    "exact Italian historical export order",
  );
  for (const key of sourceKeys) {
    const sourceValue = sourceIndex[key];
    const typescriptValue = typescriptIndex[key];
    if (typeof sourceValue === "function") {
      assert.equal(typeof typescriptValue, "function", `${key}: function export`);
      assert.notEqual(sourceValue, typescriptValue, `${key}: independent implementation`);
    } else {
      assertValueParity(sourceValue, typescriptValue, key);
    }
  }

  assertValueParity(
    sourceIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
    typescriptIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
    "grade catalog",
  );
  assertValueParity(
    sourceIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS,
    typescriptIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS,
    "standard catalog",
  );
  assert.equal(
    Object.isFrozen(sourceIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES),
    Object.isFrozen(typescriptIndex.ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES),
    "grade catalog frozen state",
  );

  const sourceFactoryValue = sourceIndex.createItalianHistoricalReinforcementSteelMaterial;
  const typescriptFactoryValue = typescriptIndex.createItalianHistoricalReinforcementSteelMaterial;
  const sourceLookupValue = sourceIndex.getItalianHistoricalReinforcementSteelGrade;
  const typescriptLookupValue = typescriptIndex.getItalianHistoricalReinforcementSteelGrade;
  const sourceFactory = requireHistoricalFactory(sourceFactoryValue);
  const typescriptFactory = requireHistoricalFactory(typescriptFactoryValue);
  const sourceLookup = requireHistoricalLookup(sourceLookupValue);
  const typescriptLookup = requireHistoricalLookup(typescriptLookupValue);

  const factoryInputs: Record<string, unknown>[] = [
    { grade: "A41", units: { force: "N", length: "mm" } },
    {
      grade: "A38",
      existing: true,
      knowledgeLevel: 2,
      units: { force: "N", length: "mm" },
    },
    {
      grade: "Aq50",
      name: "Acciaio storico μ",
      yieldMeanStrength: 0.45,
      ultimateMeanStrength: 0.55,
      units: { force: "kN", length: "m" },
    },
  ];
  for (const input of factoryInputs) {
    const sourceMaterial = sourceFactory(input);
    const typescriptMaterial = typescriptFactory(input);
    assertValueParity(sourceMaterial.toJSON(), typescriptMaterial.toJSON(), "material JSON");
    assert.equal(
      typescriptMaterial.isExistingMaterial(),
      sourceMaterial.isExistingMaterial(),
      "material existing state",
    );
  }

  assertValueParity(
    sourceLookup("missing-grade"),
    typescriptLookup("missing-grade"),
    "unsupported grade lookup",
  );
  const sourceUnsupported = captureError(() =>
    sourceFactory({ grade: "missing-grade", units: { force: "N", length: "mm" } }),
  );
  const typescriptUnsupported = captureError(() =>
    typescriptFactory({ grade: "missing-grade", units: { force: "N", length: "mm" } }),
  );
  assert.deepEqual(typescriptUnsupported, sourceUnsupported, "unsupported grade error");

  const sourceMissingUnits = captureError(() => sourceFactory({ grade: "A41" }));
  const typescriptMissingUnits = captureError(() => typescriptFactory({ grade: "A41" }));
  assert.deepEqual(typescriptMissingUnits, sourceMissingUnits, "missing units error");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  for (const key of sourceKeys) {
    assert.equal(sourceRootModule[key], sourceIndex[key], `source root alias: ${key}`);
    assert.equal(typescriptRootModule[key], typescriptIndex[key], `TypeScript root alias: ${key}`);
  }
});
