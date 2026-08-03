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
type CreateBeamReportArtifacts = (report: unknown, options?: unknown) => unknown;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArtifactFactory(value: unknown): value is CreateBeamReportArtifacts {
  return typeof value === "function";
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

function captureError(
  factory: CreateBeamReportArtifacts,
  report: unknown,
  options?: unknown,
): unknown {
  try {
    return factory(report, options);
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

void test("beam report artifacts match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/reports/BeamReportArtifacts.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/reports/BeamReportArtifacts.js",
  );
  const sourceFactory = sourceModule.createBeamReportArtifacts;
  const typescriptFactory = typescriptModule.createBeamReportArtifacts;
  if (!isArtifactFactory(sourceFactory) || !isArtifactFactory(typescriptFactory)) {
    throw new Error("Expected both modules to export createBeamReportArtifacts.");
  }

  assert.notEqual(typescriptFactory, sourceFactory, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.createBeamReportArtifacts, sourceFactory, "source root alias");
  assert.equal(
    typescriptRootModule.createBeamReportArtifacts,
    typescriptFactory,
    "TypeScript root alias",
  );

  const report = {
    json: {
      id: "Trave/δ-報告 01",
      title: "Trave in legno è",
      schemaVersion: "beam-report/v1",
      analysis: {
        maxMoment: 12.5,
        maxShear: -3.25,
        station: 2,
      },
    },
    markdown: "# Trave in legno è\n\n## Esito δ 報告",
  };

  const cases: readonly [string, unknown, unknown][] = [
    ["default artifacts", report, undefined],
    [
      "custom sanitized basename and spacing",
      report,
      { baseName: "  Report/δ 報告  ", jsonSpacing: 4 },
    ],
    ["json only", report, { includeMarkdown: false }],
    ["markdown only", report, { includeJson: false }],
    ["neither format", report, { includeJson: false, includeMarkdown: false }],
    ["missing metadata values", { json: { id: "metadata-only" }, markdown: "" }, undefined],
  ];

  for (const [label, caseReport, options] of cases) {
    const sourceResult: unknown = sourceFactory(caseReport, options);
    const typescriptResult: unknown = typescriptFactory(caseReport, options);
    assert.deepEqual(typescriptResult, sourceResult, `${label}: exact result`);
    assert.equal(
      JSON.stringify(typescriptResult),
      JSON.stringify(sourceResult),
      `${label}: exact JSON`,
    );
  }

  const errorCases: readonly [string, unknown, unknown][] = [
    ["missing report", undefined, undefined],
    ["missing report json", {}, undefined],
    ["missing markdown", { json: { id: "beam" } }, undefined],
    ["missing markdown when requested", { json: { id: "beam" } }, { includeMarkdown: 1 }],
    ["null options", report, null],
  ];

  for (const [label, caseReport, options] of errorCases) {
    assert.deepEqual(
      captureError(typescriptFactory, caseReport, options),
      captureError(sourceFactory, caseReport, options),
      `${label}: exact error`,
    );
  }

  const circularJson: RuntimeRecord = { id: "circular", title: "cycle" };
  circularJson.self = circularJson;
  assert.deepEqual(
    captureError(typescriptFactory, { json: circularJson, markdown: "" }),
    captureError(sourceFactory, { json: circularJson, markdown: "" }),
    "circular JSON: exact error",
  );
});
