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
type RendererLike = { render: (report: unknown) => unknown };
type RendererConstructor = new () => RendererLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRendererConstructor(value: unknown): value is RendererConstructor {
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

function captureError(renderer: RendererLike, report: unknown): unknown {
  try {
    return renderer.render(report);
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

void test("beam report Markdown renderer matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/reports/BeamReportMarkdownRenderer.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/reports/BeamReportMarkdownRenderer.js",
  );
  const sourceConstructor = sourceModule.BeamReportMarkdownRenderer;
  const typescriptConstructor = typescriptModule.BeamReportMarkdownRenderer;
  if (!isRendererConstructor(sourceConstructor) || !isRendererConstructor(typescriptConstructor)) {
    throw new Error("Expected both modules to export BeamReportMarkdownRenderer.");
  }

  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.BeamReportMarkdownRenderer, sourceConstructor, "source root alias");
  assert.equal(
    typescriptRootModule.BeamReportMarkdownRenderer,
    typescriptConstructor,
    "TypeScript root alias",
  );

  const report = {
    title: "Trave di prova δ",
    description: "Report con valori | e Unicode è",
    id: "beam-report-01",
    units: { force: "kN", length: "m" },
    analysis: {
      raw: {
        analysisModel: "elastic-2D",
        combinations: {
          "comb-ULS": {
            id: "comb-ULS",
            context: { limitState: "ULS", combinationType: "fundamental" },
            factors: { G1: 1.35, Qk: -1.23456 },
            geometry: { length: 6.125, horizontalSpan: 6 },
            supports: [
              {
                id: "S1",
                nodeId: "N1",
                station: 0,
                type: "pinned",
                restraints: { ux: true, uy: true, rz: false },
              },
            ],
            loads: [
              {
                id: "load-G1",
                loadCaseId: "G1",
                actionType: "permanent|dead",
                loadDurationClass: "permanent",
                factor: 1.35,
              },
            ],
            sectionProperties: {
              axialRigidity: 123456.789,
              flexuralRigidity: 456.789,
              flexuralRigidityY: 400.123,
              flexuralRigidityZ: 300.987,
              shearRigidity: 789.456,
              shearRigidityY: 700.123,
              shearRigidityZ: 600.789,
              metadata: { kmod: 0.8, kdef: 0.6 },
            },
          },
        },
        loadCases: {
          G1: {
            id: "G1",
            loads: [
              {
                id: "load-G1",
                loadCaseId: "G1",
                actionType: "permanent|dead",
                loadDurationClass: "permanent",
                factor: 1,
              },
            ],
          },
          Qk: {
            id: "Qk",
            loads: [
              {
                id: "load-Qk",
                loadCaseId: "Qk",
                actionType: "variable",
                factor: Number.NaN,
              },
            ],
          },
        },
        envelopes: {
          combinations: {
            maxAbsBendingMoment: {
              resultId: "comb-ULS",
              limitState: "ULS",
              value: 12.34567,
              sample: { station: 3.25 },
            },
            maxAbsBendingMomentY: null,
            maxAbsBendingMomentZ: {
              resultId: "comb-ULS",
              value: Number.POSITIVE_INFINITY,
            },
            maxAbsShearForce: undefined,
            minShearForce: {
              resultId: "comb-ULS",
              limitState: "ULS",
              value: -4.321,
              sample: { station: 1 },
            },
            maxAbsShearForceY: null,
            maxAbsShearForceZ: null,
          },
          uls: {},
          sle: {
            maxAbsVerticalDisplacement: {
              resultId: "comb-SLE",
              limitState: "SLE",
              value: 0.123456,
              sample: { station: 2 },
            },
          },
        },
      },
      sectionRotation: {
        alpha: Math.PI / 12,
        inputAlpha: 15,
        inputUnits: "deg",
        convention: "counter-clockwise",
        primaryAxis: "principalY",
      },
      principalAxes: {},
      sectionRigidity: {
        verticalFlexuralRigiditySource: "projected-yz",
        verticalShearRigiditySource: "projected-yz",
      },
      principalActionEnvelopes: {
        all: {
          maxAbsBendingMomentY: { resultId: "all", value: 1.23456, station: 1 },
          maxAbsShearForceY: { resultId: "all", limitState: "ULS", value: 2, station: 2 },
        },
        combinations: {},
        uls: {
          maxAbsBendingMomentZ: { resultId: "uls", limitState: "ULS", value: 3, station: 3 },
          maxAbsShearForceZ: { resultId: "uls", value: 4, station: 4 },
        },
        sle: {},
      },
    },
    verification: {
      status: "ok",
      checks: [
        {
          id: "bending|check",
          description: "Bending è",
          demand: 10.12345,
          capacity: 20,
          utilizationRatio: 0.50617,
          ok: true,
          metadata: { family: "ULS", ratio: 0.50617, enabled: true, ignored: { value: 1 } },
        },
        {
          id: "shear",
          description: null,
          demand: null,
          capacity: Number.POSITIVE_INFINITY,
          utilizationRatio: Number.NaN,
          ok: false,
          metadata: {},
        },
      ],
    },
    governing: { utilizationRatio: 0.50617, checkId: "bending|check" },
    warnings: ["Warning è", "Pipe | escaped"],
    assumptions: ["Assunzione δ"],
  };

  const sourceRenderer = new sourceConstructor();
  const typescriptRenderer = new typescriptConstructor();
  const sourceMarkdown: unknown = sourceRenderer.render(report);
  const typescriptMarkdown: unknown = typescriptRenderer.render(report);
  if (typeof sourceMarkdown !== "string" || typeof typescriptMarkdown !== "string") {
    throw new Error("Expected both Markdown renderers to return strings.");
  }
  assert.equal(typescriptMarkdown, sourceMarkdown, "exact Markdown");
  assert.equal(JSON.stringify(typescriptMarkdown), JSON.stringify(sourceMarkdown), "exact JSON");
  assert.ok(typescriptMarkdown.includes("\\|"), "pipe escaping");
  assert.ok(typescriptMarkdown.includes("Warning è"), "Unicode warning");

  const emptyReport = {
    ...report,
    description: "",
    warnings: [],
    assumptions: [],
    analysis: {
      ...report.analysis,
      raw: {
        ...report.analysis.raw,
        combinations: {},
        loadCases: {},
        envelopes: {},
      },
    },
    verification: null,
  };
  const emptySourceMarkdown: unknown = sourceRenderer.render(emptyReport);
  const emptyTypescriptMarkdown: unknown = typescriptRenderer.render(emptyReport);
  assert.equal(emptyTypescriptMarkdown, emptySourceMarkdown, "empty/default branches");
  if (typeof emptyTypescriptMarkdown !== "string") {
    throw new Error("Expected the empty TypeScript report to return Markdown.");
  }
  assert.ok(emptyTypescriptMarkdown.includes("Nessun dato disponibile."), "empty table branch");

  for (const invalidReport of [undefined, {}]) {
    assert.deepEqual(
      captureError(typescriptRenderer, invalidReport),
      captureError(sourceRenderer, invalidReport),
      "invalid report: exact error",
    );
  }
});
