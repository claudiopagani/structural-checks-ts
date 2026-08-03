import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const expectedExportNames = [
  "SectionFiberDiscretizer",
  "StrainField",
  "RCServiceStressSolver",
  "RCSectionStateIntegrator",
  "RCBiaxialDomainBuilder",
  "RCMomentCurvatureAnalyzer",
  "RCUniaxialDomainBuilder",
  "RCUltimateSectionSolver",
];

type RuntimeRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

void test("reinforced concrete section analysis index matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/reinforced-concrete-sections/analysis/index.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/reinforced-concrete-sections/analysis/index.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  const sourceNames = Object.keys(sourceModule).sort();
  const typescriptNames = Object.keys(typescriptModule).sort();
  const sortedExpectedExportNames = [...expectedExportNames].sort();
  assert.deepEqual(typescriptNames, sortedExpectedExportNames, "exact TypeScript export names");
  assert.deepEqual(sourceNames, sortedExpectedExportNames, "exact JavaScript export names");
  assert.equal(JSON.stringify(typescriptNames), JSON.stringify(sourceNames), "exact export JSON");

  for (const exportName of expectedExportNames) {
    const sourceExport = sourceModule[exportName];
    const typescriptExport = typescriptModule[exportName];
    assert.equal(typeof sourceExport, "function", `${exportName} source export`);
    assert.equal(typeof typescriptExport, "function", `${exportName} TypeScript export`);
    assert.notEqual(typescriptExport, sourceExport, `${exportName} independent implementation`);
    assert.equal(sourceRootModule[exportName], sourceExport, `${exportName} source root alias`);
    assert.equal(
      typescriptRootModule[exportName],
      typescriptExport,
      `${exportName} TypeScript root alias`,
    );
  }
});
