import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeLaw {
  stress(strain: number): number;
}

interface RuntimeConstitutiveLawModule extends Record<string, unknown> {
  readonly ConcreteNoTensionLaw: new (options?: unknown) => RuntimeLaw;
  readonly ConcreteParabolaRectangleLaw: new (options?: unknown) => RuntimeLaw;
  readonly ConcreteStressBlockLaw: new (options?: unknown) => RuntimeLaw;
  readonly ConcreteTriangularRectangleLaw: new (options?: unknown) => RuntimeLaw;
  readonly SteelElasticLaw: new (options?: unknown) => RuntimeLaw;
  readonly SteelElasticPlasticHardeningLaw: new (options?: unknown) => RuntimeLaw;
  readonly SteelElasticPerfectlyPlasticLaw: new (options?: unknown) => RuntimeLaw;
}

interface RuntimeConcreteLawModule {
  readonly ConcreteNoTensionLaw: new (options?: unknown) => RuntimeLaw;
}

const exportNames = [
  "ConcreteNoTensionLaw",
  "ConcreteParabolaRectangleLaw",
  "ConcreteStressBlockLaw",
  "ConcreteTriangularRectangleLaw",
  "SteelElasticLaw",
  "SteelElasticPerfectlyPlasticLaw",
  "SteelElasticPlasticHardeningLaw",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConstitutiveLawModule(value: unknown): value is RuntimeConstitutiveLawModule {
  return isRecord(value) && exportNames.every((name) => typeof value[name] === "function");
}

function isConcreteLawModule(value: unknown): value is RuntimeConcreteLawModule {
  return isRecord(value) && typeof value.ConcreteNoTensionLaw === "function";
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

function assertExactStrings(source: readonly string[], typescript: readonly string[]): void {
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), "exact export-name JSON");
  assert.deepEqual(typescript, source, "exact export-name order");
  source.forEach((name, index) => {
    const typescriptName = typescript[index];
    assert.equal(typescriptName, name);
    if (typescriptName === undefined) throw new Error(`Missing exported name: ${name}`);
    assert.deepEqual(codePoints(typescriptName), codePoints(name), `${name}: Unicode`);
  });
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
  source: RuntimeConstitutiveLawModule;
  typescript: RuntimeConstitutiveLawModule;
  sourceDirect: RuntimeConcreteLawModule;
  typescriptDirect: RuntimeConcreteLawModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "constitutive-laws", "index.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "constitutive-laws", "index.js")).href
  );
  const sourceDirectModule: unknown = await import(
    pathToFileURL(
      path.join(sourceRoot, "src", "domain", "constitutive-laws", "ConcreteNoTensionLaw.js"),
    ).href
  );
  const typescriptDirectModule: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "constitutive-laws", "ConcreteNoTensionLaw.js"),
    ).href
  );

  if (
    !isConstitutiveLawModule(sourceModule) ||
    !isConstitutiveLawModule(typescriptModule) ||
    !isConcreteLawModule(sourceDirectModule) ||
    !isConcreteLawModule(typescriptDirectModule)
  ) {
    throw new Error("Constitutive-law index modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceDirect: sourceDirectModule,
    typescriptDirect: typescriptDirectModule,
  };
}

void test("constitutive-law index matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceDirect, typescriptDirect } = await loadModules();

  const sourceNames = Object.keys(source);
  const typescriptNames = Object.keys(typescript);
  assertExactStrings(sourceNames, typescriptNames);
  assert.deepEqual(sourceNames, exportNames);

  exportNames.forEach((name) => {
    assert.notEqual(source[name], typescript[name], `${name}: independent implementation`);
  });

  assert.equal(source.ConcreteNoTensionLaw, sourceDirect.ConcreteNoTensionLaw);
  assert.equal(typescript.ConcreteNoTensionLaw, typescriptDirect.ConcreteNoTensionLaw);

  const sourceConcrete = new source.ConcreteNoTensionLaw({ ecm: 30000, compressionCap: 12 });
  const typescriptConcrete = new typescript.ConcreteNoTensionLaw({
    ecm: 30000,
    compressionCap: 12,
  });
  assert.equal(sourceConcrete.stress(-0.0002), typescriptConcrete.stress(-0.0002));
  assert.equal(sourceConcrete.stress(0.0002), typescriptConcrete.stress(0.0002));

  assertErrorParity(
    () => new source.ConcreteNoTensionLaw(),
    () => new typescript.ConcreteNoTensionLaw(),
    "missing constructor options",
  );
  assert.equal(source["UnsupportedLaw"], undefined);
  assert.equal(typescript["UnsupportedLaw"], undefined);
});
