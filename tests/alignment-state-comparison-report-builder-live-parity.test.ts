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
  ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION: unknown;
  AlignmentStateComparisonReportBuilder: RuntimeBuilderConstructor;
}

interface RuntimeBuilder {
  build: (input?: unknown) => unknown;
  buildJson: (input: unknown) => unknown;
  buildMarkdown: (report: unknown) => unknown;
  renderMarkdown: (report: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBuilderModule(value: unknown): value is RuntimeBuilderModule {
  return (
    isRecord(value) &&
    typeof value.AlignmentStateComparisonReportBuilder === "function" &&
    Object.hasOwn(value, "ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION")
  );
}

function isBuilder(value: unknown): value is RuntimeBuilder {
  return (
    isRecord(value) &&
    typeof value.build === "function" &&
    typeof value.buildJson === "function" &&
    typeof value.buildMarkdown === "function" &&
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
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);

  if (typeof source === "string" && typeof typescript === "string") {
    assert.deepEqual(codePoints(typescript), codePoints(source), `${label}: exact Unicode`);
  }
}

class SerializableSettings {
  toJSON(): RuntimeRecord {
    return {
      normativePreset: "NTC2018-§8.7.1",
      label: "impostazione-μ",
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
    totalLength: () => 12.34567,
    maxHeight: () => 4.56789,
    settings: new SerializableSettings(),
  };
}

function createPlainComparisonResult(): RuntimeRecord {
  const shared = { tag: "condiviso-μ" };
  const circular: RuntimeRecord = { name: "circular-α" };
  circular.self = circular;

  return {
    outputs: {
      criteria: { stiffnessTolerancePercent: 15, shared },
      stateOfFact: { performanceSummary: { status: "ok", ks: 12.34567, shared } },
      design: { performanceSummary: { status: "ok", ks: 14.5 } },
      comparison: {
        checks: [
          {
            id: "stiffness-variation",
            description: "Variazione rigidezza | ks",
            stateOfFactValue: 12.34567,
            designValue: 14.5,
            delta: 2.15433,
            variationPercent: 17.45,
            criterion: { type: "variation-band", toleranceRatio: 0.15 },
            ok: true,
          },
        ],
        overall: { status: "accepted", circular },
      },
      reading: {
        headline: "Tutti i criteri configurati",
        outcome: "accepted",
        governingCheckId: "stiffness-variation",
        messages: ["Lettura μ", "Nessuna riduzione α"],
      },
    },
    warnings: ["Avviso μ", "", null, "Avviso μ"],
    assumptions: ["Assunzione α", "Assunzione α"],
    metadata: { comparisonType: "state-of-fact-vs-design", unicode: "✓" },
    status: "ok",
  };
}

function createJsonComparisonResult(): RuntimeRecord {
  return {
    toJSON: () => ({
      outputs: {
        criteria: { stiffnessTolerancePercent: 10 },
        stateOfFact: { performanceSummary: { status: "ok", ks: 10 } },
        design: { performanceSummary: { status: "ok", ks: 11 } },
        comparison: { checks: [], overall: { status: "accepted" } },
        reading: { outcome: "accepted", messages: ["toJSON-μ"] },
      },
      warnings: ["json-warning"],
      assumptions: [],
      metadata: { comparisonType: "json-result" },
      status: "ok",
    }),
  };
}

void test("alignment report builder matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/AlignmentStateComparisonReportBuilder.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/AlignmentStateComparisonReportBuilder.js",
  );
  if (!isBuilderModule(sourceModuleValue) || !isBuilderModule(typescriptModuleValue)) {
    throw new Error("Alignment report builder modules do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.AlignmentStateComparisonReportBuilder,
    typescriptModuleValue.AlignmentStateComparisonReportBuilder,
    "report builder independent implementation",
  );
  assertExactParity(
    sourceModuleValue.ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
    typescriptModuleValue.ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
    "schema version",
  );

  const sourceBuilder = new sourceModuleValue.AlignmentStateComparisonReportBuilder({
    metadata: { source: "fixture", unicode: "μ" },
  });
  const typescriptBuilder = new typescriptModuleValue.AlignmentStateComparisonReportBuilder({
    metadata: { source: "fixture", unicode: "μ" },
  });
  if (!isBuilder(sourceBuilder) || !isBuilder(typescriptBuilder)) {
    throw new Error("Alignment report builder instances do not expose the expected API.");
  }

  const model = createModel();
  const plainResult = createPlainComparisonResult();
  assertExactParity(
    sourceBuilder.build({ model, comparisonResult: plainResult, metadata: { run: "plain" } }),
    typescriptBuilder.build({ model, comparisonResult: plainResult, metadata: { run: "plain" } }),
    "plain comparison result",
  );
  assertExactParity(
    sourceBuilder.buildJson({ model, comparisonResult: plainResult, metadata: { run: "json" } }),
    typescriptBuilder.buildJson({
      model,
      comparisonResult: plainResult,
      metadata: { run: "json" },
    }),
    "plain buildJson",
  );

  const jsonResult = createJsonComparisonResult();
  assertExactParity(
    sourceBuilder.build({ model, comparisonResult: jsonResult }),
    typescriptBuilder.build({ model, comparisonResult: jsonResult }),
    "comparison result toJSON branch",
  );

  const sourceCustomBuilder = new sourceModuleValue.AlignmentStateComparisonReportBuilder({
    markdownRenderer: (report: RuntimeRecord) => `custom-${String(report.id)}-μ`,
  });
  const typescriptCustomBuilder = new typescriptModuleValue.AlignmentStateComparisonReportBuilder({
    markdownRenderer: (report: RuntimeRecord) => `custom-${String(report.id)}-μ`,
  });
  if (!isBuilder(sourceCustomBuilder) || !isBuilder(typescriptCustomBuilder)) {
    throw new Error("Custom report builders do not expose the expected API.");
  }
  const customReport = sourceBuilder.buildJson({ model, comparisonResult: jsonResult });
  assertExactParity(
    sourceCustomBuilder.buildMarkdown(customReport),
    typescriptCustomBuilder.buildMarkdown(customReport),
    "custom renderer delegation",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    ["missing model", () => sourceBuilder.build({}), () => typescriptBuilder.build({})],
    [
      "missing comparisonResult",
      () => sourceBuilder.build({ model }),
      () => typescriptBuilder.build({ model }),
    ],
    [
      "invalid renderer",
      () =>
        new sourceModuleValue.AlignmentStateComparisonReportBuilder({
          markdownRenderer: {},
        }).renderMarkdown({}),
      () =>
        new typescriptModuleValue.AlignmentStateComparisonReportBuilder({
          markdownRenderer: {},
        }).renderMarkdown({}),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of errorCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} error`);
  }
});
