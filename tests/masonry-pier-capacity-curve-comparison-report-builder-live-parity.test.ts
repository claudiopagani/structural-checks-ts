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
type RuntimeBuilderConstructor = new (options?: unknown) => RuntimeBuilder;

interface RuntimeBuilderModule extends RuntimeRecord {
  MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION: unknown;
  MasonryPierCapacityCurveComparisonReportBuilder: RuntimeBuilderConstructor;
}

interface RuntimeBuilder {
  build: (input?: unknown) => unknown;
  buildJson: (input: unknown) => unknown;
  renderMarkdown: (report: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBuilderModule(value: unknown): value is RuntimeBuilderModule {
  return (
    isRecord(value) &&
    typeof value.MasonryPierCapacityCurveComparisonReportBuilder === "function" &&
    Object.hasOwn(value, "MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION")
  );
}

function isBuilder(value: unknown): value is RuntimeBuilder {
  return (
    isRecord(value) &&
    typeof value.build === "function" &&
    typeof value.buildJson === "function" &&
    typeof value.renderMarkdown === "function"
  );
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

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  if (typeof source === "string" && typeof typescript === "string") {
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: exact Unicode`);
  }
}

function captureError(run: () => unknown): { name: string; message: string } | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    if (!(error instanceof Error)) {
      throw new Error("The report builder threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

class SerializableAnalysisResult {
  toJSON(): RuntimeRecord {
    return {
      outputs: {
        pier: { id: "pier-json-μ", governingFamily: "flexural" },
        aggregated: {
          performanceSummary: { ks: 10, Vy: 20, du: 0.1 },
          capacityCurve: { points: [{ displacement: 0, baseShear: 0 }] },
        },
        fem: {
          performanceSummary: { ks: 11, Vy: 21, du: 0.11 },
          capacityCurve: { points: [{ displacement: 0, baseShear: 0 }] },
          hingeEvents: [],
          finalState: { termination: { reason: "converged-μ" } },
        },
        comparison: { metrics: [{ id: "ks", variationPercent: 10 }] },
        reading: { outcome: "consistent", messages: ["Lettura JSON α"] },
      },
      warnings: ["warning-json"],
      assumptions: [],
      metadata: { comparisonType: "json-result" },
      status: "ok",
    };
  }
}

function createModel(): RuntimeRecord {
  return {
    id: "alignment-α",
    label: "Allineamento confronto μ",
    units: { force: "kN", length: "m", symbol: "✓" },
    walls: [{ id: "wall-a" }, { id: "wall-b" }],
    openings: [{ id: "opening-a" }],
  };
}

function createPlainAnalysisResult(): RuntimeRecord {
  const shared = { tag: "condiviso-μ" };
  const circular: RuntimeRecord = { name: "circular-α" };
  circular.self = circular;

  return {
    outputs: {
      pier: {
        id: "alignment-α-pier-1",
        wallId: "wall-a",
        topRotation: "free",
        governingMode: "rocking-toe-crushing",
        shared,
      },
      aggregated: {
        performanceSummary: { ks: 1234.56789, Vy: 456.789, du: 0.012345, shared },
        capacityCurve: { points: [{ displacement: 0, baseShear: 0 }, circular] },
      },
      fem: {
        performanceSummary: { ks: 1200.1234, Vy: 460.789, du: 0.013 },
        capacityCurve: { points: [{ displacement: 0, baseShear: 0 }] },
        hingeEvents: [{ id: "hinge-μ", state: "yielded" }],
        finalState: { termination: { reason: "converged-✓" } },
      },
      comparison: {
        metrics: [{ id: "ks", label: "Rigidezza μ", variationPercent: -2.789 }],
        sampledCurvePoints: [{ displacement: 0.001, aggregatedBaseShear: 100, femBaseShear: 98 }],
      },
      reading: {
        outcome: "attention",
        headline: "Confronto da verificare",
        governingMetricId: "ks",
        messages: ["Lettura α", "Nessuna anomalia ✓"],
      },
    },
    warnings: ["Avviso μ", "", "Avviso μ", null],
    assumptions: ["Assunzione α", "Assunzione α"],
    metadata: { comparisonType: "aggregated-vs-fem", unicode: "✓" },
    status: "ok",
  };
}

void test("masonry pier capacity-curve builder matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonReportBuilder.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonReportBuilder.js",
  );
  if (!isBuilderModule(sourceModuleValue) || !isBuilderModule(typescriptModuleValue)) {
    throw new Error("Masonry pier report builder modules do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryPierCapacityCurveComparisonReportBuilder,
    typescriptModuleValue.MasonryPierCapacityCurveComparisonReportBuilder,
    "report builder independent implementation",
  );
  assertExactParity(
    sourceModuleValue.MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
    typescriptModuleValue.MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
    "schema version",
  );

  const sourceBuilder = new sourceModuleValue.MasonryPierCapacityCurveComparisonReportBuilder({
    metadata: { source: "fixture", unicode: "μ" },
  });
  const typescriptBuilder =
    new typescriptModuleValue.MasonryPierCapacityCurveComparisonReportBuilder({
      metadata: { source: "fixture", unicode: "μ" },
    });
  if (!isBuilder(sourceBuilder) || !isBuilder(typescriptBuilder)) {
    throw new Error("Masonry pier report builder instances do not expose the expected API.");
  }

  const model = createModel();
  const plainResult = createPlainAnalysisResult();
  assertExactParity(
    sourceBuilder.build({ model, analysisResult: plainResult, metadata: { run: "plain" } }),
    typescriptBuilder.build({ model, analysisResult: plainResult, metadata: { run: "plain" } }),
    "plain analysis result",
  );
  assertExactParity(
    sourceBuilder.buildJson({ model, analysisResult: plainResult, metadata: { run: "json" } }),
    typescriptBuilder.buildJson({
      model,
      analysisResult: plainResult,
      metadata: { run: "json" },
    }),
    "plain buildJson",
  );
  const modelWithoutUnits = { ...model, units: null };
  assertExactParity(
    sourceBuilder.buildJson({ model: modelWithoutUnits, analysisResult: plainResult }),
    typescriptBuilder.buildJson({ model: modelWithoutUnits, analysisResult: plainResult }),
    "null model units",
  );

  const jsonResult = new SerializableAnalysisResult();
  assertExactParity(
    sourceBuilder.build({ model, analysisResult: jsonResult }),
    typescriptBuilder.build({ model, analysisResult: jsonResult }),
    "analysis result toJSON branch",
  );

  const sourceCustomBuilder = new sourceModuleValue.MasonryPierCapacityCurveComparisonReportBuilder(
    {
      markdownRenderer: (report: RuntimeRecord) => `custom-${String(report.id)}-μ`,
    },
  );
  const typescriptCustomBuilder =
    new typescriptModuleValue.MasonryPierCapacityCurveComparisonReportBuilder({
      markdownRenderer: (report: RuntimeRecord) => `custom-${String(report.id)}-μ`,
    });
  if (!isBuilder(sourceCustomBuilder) || !isBuilder(typescriptCustomBuilder)) {
    throw new Error("Custom report builders do not expose the expected API.");
  }
  const customReport = sourceBuilder.buildJson({ model, analysisResult: jsonResult });
  assertExactParity(
    sourceCustomBuilder.renderMarkdown(customReport),
    typescriptCustomBuilder.renderMarkdown(customReport),
    "custom renderer delegation",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    ["missing model", () => sourceBuilder.build({}), () => typescriptBuilder.build({})],
    [
      "missing analysisResult",
      () => sourceBuilder.build({ model }),
      () => typescriptBuilder.build({ model }),
    ],
    [
      "invalid renderer",
      () =>
        new sourceModuleValue.MasonryPierCapacityCurveComparisonReportBuilder({
          markdownRenderer: {},
        }).renderMarkdown({}),
      () =>
        new typescriptModuleValue.MasonryPierCapacityCurveComparisonReportBuilder({
          markdownRenderer: {},
        }).renderMarkdown({}),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of errorCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} error`);
  }
});
