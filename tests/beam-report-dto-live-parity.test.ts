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
type ValidationFunction = (report: unknown) => unknown;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidationFunction(value: unknown): value is ValidationFunction {
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

function assertValidationParity(
  sourceValidate: ValidationFunction,
  typescriptValidate: ValidationFunction,
  report: unknown,
  label: string,
): void {
  const sourceResult = sourceValidate(report);
  const typescriptResult = typescriptValidate(report);
  assert.deepEqual(typescriptResult, sourceResult, `${label}: exact result`);
  assert.equal(
    JSON.stringify(typescriptResult),
    JSON.stringify(sourceResult),
    `${label}: exact JSON`,
  );
}

void test("beam report DTO matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/dto/BeamReportDto.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/dto/BeamReportDto.js",
  );
  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceValidate = sourceModule.validateBeamReportDto;
  const typescriptValidate = typescriptModule.validateBeamReportDto;
  if (!isValidationFunction(sourceValidate) || !isValidationFunction(typescriptValidate)) {
    throw new Error("Expected both DTO modules to export validateBeamReportDto.");
  }

  assert.equal(
    typescriptModule.BEAM_REPORT_SCHEMA_VERSION,
    sourceModule.BEAM_REPORT_SCHEMA_VERSION,
    "schema version",
  );
  assert.equal(
    JSON.stringify(typescriptModule.BEAM_REPORT_SCHEMA_VERSION),
    JSON.stringify(sourceModule.BEAM_REPORT_SCHEMA_VERSION),
    "schema version JSON",
  );
  assert.notEqual(typescriptValidate, sourceValidate, "independent validation functions");
  assert.equal(
    typescriptRootModule.BEAM_REPORT_SCHEMA_VERSION,
    typescriptModule.BEAM_REPORT_SCHEMA_VERSION,
    "TypeScript root schema alias",
  );
  assert.equal(
    sourceRootModule.BEAM_REPORT_SCHEMA_VERSION,
    sourceModule.BEAM_REPORT_SCHEMA_VERSION,
    "JavaScript root schema alias",
  );
  assert.equal(
    typescriptRootModule.validateBeamReportDto,
    typescriptValidate,
    "TypeScript root validator alias",
  );
  assert.equal(
    sourceRootModule.validateBeamReportDto,
    sourceValidate,
    "JavaScript root validator alias",
  );

  const validReport = {
    schemaVersion: "beam-report/v1",
    applicationId: "single-beam-design",
    id: "trave-δ-报告",
    title: "Trave in c.a. α",
    description: "Unicode report DTO",
    units: { force: "kN", length: "m" },
    model: { name: "modello-è" },
    analysis: {
      id: "analysis-1",
      units: { force: "kN", length: "m" },
      analysisModel: "elastic",
      loadCaseIds: [],
      combinationIds: [],
      loadCases: {},
      combinations: {},
      envelopes: {},
      sectionRotation: {},
      principalAxes: {},
      sectionRigidity: {},
      principalActionEnvelopes: {},
      raw: {},
    },
    verification: null,
    governing: {},
    warnings: [],
    assumptions: [],
    metadata: { label: "à" },
  };
  const cases: readonly [string, unknown][] = [
    ["null", null],
    ["number", 7],
    ["string", "report"],
    ["array", []],
    ["empty object", {}],
    [
      "invalid schema and analysis",
      {
        schemaVersion: "wrong",
        applicationId: null,
        id: undefined,
        title: "",
        units: null,
        model: [],
        analysis: {
          loadCaseIds: "no",
          combinationIds: null,
          loadCases: [],
          combinations: null,
          envelopes: "no",
          sectionRotation: null,
          principalAxes: [],
          sectionRigidity: 1,
          principalActionEnvelopes: null,
          raw: false,
        },
        governing: null,
        warnings: "no",
        assumptions: null,
        metadata: [],
        verification: {
          applicationId: null,
          status: undefined,
          checks: {},
          outputs: [],
          warnings: null,
          assumptions: "no",
          metadata: false,
        },
      },
    ],
    ["valid Unicode report", validReport],
    ["unsupported verification value", { ...validReport, verification: 0 }],
  ];

  for (const [label, report] of cases) {
    assertValidationParity(sourceValidate, typescriptValidate, report, label);
  }
});
