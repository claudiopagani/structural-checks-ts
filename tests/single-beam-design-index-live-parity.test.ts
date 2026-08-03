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

function captureError(action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function callExport(value: unknown, argument: unknown): unknown {
  if (typeof value !== "function") {
    throw new Error("Expected a callable public export.");
  }
  return Reflect.apply(value, undefined, [argument]);
}

void test("single-beam design index matches the independent pinned JavaScript barrel", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(sourceRoot, "src/applications/single-beam-design/index.js");
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/index.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.deepEqual(Object.keys(typescriptModule), Object.keys(sourceModule), "exact export names");

  for (const exportName of Object.keys(sourceModule)) {
    const sourceExport = sourceModule[exportName];
    const typescriptExport = typescriptModule[exportName];
    assert.equal(typeof typescriptExport, typeof sourceExport, `${exportName}: export type`);
    assert.equal(
      typescriptRootModule[exportName],
      typescriptExport,
      `${exportName}: TypeScript root alias`,
    );
    assert.equal(sourceRootModule[exportName], sourceExport, `${exportName}: source root alias`);
    if (typeof sourceExport === "function") {
      assert.notEqual(typescriptExport, sourceExport, `${exportName}: independent implementation`);
    } else {
      assert.deepEqual(typescriptExport, sourceExport, `${exportName}: exact constant`);
    }
  }

  const validationInput = {
    id: "single-beam-δ",
    title: "Trave è",
    schemaVersion: "unsupported",
  };
  assert.equal(
    serialized(callExport(typescriptModule.validateBeamReportDto, validationInput)),
    serialized(callExport(sourceModule.validateBeamReportDto, validationInput)),
    "exact validation JSON",
  );

  const report = {
    json: { id: "single-beam-δ", title: "Trave è" },
    markdown: "# Trave è",
  };
  assert.equal(
    serialized(callExport(typescriptModule.createBeamReportArtifacts, report)),
    serialized(callExport(sourceModule.createBeamReportArtifacts, report)),
    "exact artifact JSON and Unicode",
  );

  assert.deepEqual(
    captureError(() => callExport(typescriptModule.createBeamReportArtifacts, undefined)),
    captureError(() => callExport(sourceModule.createBeamReportArtifacts, undefined)),
    "exact missing report error",
  );
});
