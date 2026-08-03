import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");

type RuntimeModule = Record<string, unknown>;

const publicNames = [
  "GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION",
  "GEOTECHNICAL_DESIGN_SITUATION_TYPES",
  "GEOTECHNICAL_DRAINAGE_CONDITIONS",
  "GEOTECHNICAL_INTERNAL_UNITS",
  "GEOTECHNICAL_LIMIT_STATES",
  "GEOTECHNICAL_SEISMIC_MODELS",
  "GEOTECHNICAL_TIME_CONDITIONS",
  "GROUND_MODEL_SCHEMA_VERSION",
  "GROUND_PROFILE_SCHEMA_VERSION",
  "SOIL_DEFORMATION_MODELS",
  "SOIL_DRAINAGE_CONDITIONS",
  "SOIL_MODULUS_DEFINITIONS",
  "SOIL_PARAMETER_BASES",
  "SOIL_SETTLEMENT_COMPONENTS",
  "SOIL_STRENGTH_MODELS",
] as const;

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) ?? -1);
}

function assertValueParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  if (typeof source === "string") {
    assert.equal(typeof typescript, "string", `${label}: string type`);
    if (typeof typescript !== "string") {
      throw new Error(`Expected ${label} to remain a string.`);
    }
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: Unicode code points`);
  }
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("geotechnical domain constants match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceDomainModule = await loadModule(sourceRoot, "src/domain/geotechnics/index.js");
  const typescriptDomainModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "domain/geotechnics/index.js",
  );

  for (const name of publicNames) {
    const sourceValue = sourceRootModule[name];
    const typescriptValue = typescriptRootModule[name];
    const sourceDomainValue = sourceDomainModule[name];
    const typescriptDomainValue = typescriptDomainModule[name];
    assertValueParity(sourceValue, typescriptValue, `root.${name}`);
    assert.equal(sourceDomainValue, sourceValue, `source domain alias: ${name}`);
    assert.equal(typescriptDomainValue, typescriptValue, `TypeScript domain alias: ${name}`);
  }
});
