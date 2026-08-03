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
type RuntimeRendererConstructor = new () => RuntimeRecord;
type RuntimeArtifactFactory = (report: unknown, options?: unknown) => unknown;

interface RuntimeRendererModule extends RuntimeRecord {
  AlignmentStateComparisonMarkdownRenderer: RuntimeRendererConstructor;
}

interface RuntimeArtifactModule extends RuntimeRecord {
  createAlignmentStateComparisonReportArtifacts: RuntimeArtifactFactory;
}

interface RuntimeRenderer extends RuntimeRecord {
  render: (report: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRendererModule(value: unknown): value is RuntimeRendererModule {
  return isRecord(value) && typeof value.AlignmentStateComparisonMarkdownRenderer === "function";
}

function isArtifactModule(value: unknown): value is RuntimeArtifactModule {
  return (
    isRecord(value) && typeof value.createAlignmentStateComparisonReportArtifacts === "function"
  );
}

function isRenderer(value: unknown): value is RuntimeRenderer {
  return isRecord(value) && typeof value.render === "function";
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
      throw new Error("The report utility threw a non-Error value.", { cause: error });
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

function createReport(): RuntimeRecord {
  return {
    title: "Confronto ante/post Allineamento μ",
    description: "Descrizione | ante/post α",
    units: { force: "kN", length: "m" },
    model: {
      id: "alignment-state-α",
      label: "Allineamento confronto μ",
      wallCount: 2,
      openingCount: 3,
      totalLength: 12.34567,
      maxHeight: 4.56789,
      settings: { normativePreset: "NTC2018-§8.7.1" },
    },
    comparison: {
      criteria: { stiffnessTolerancePercent: 15 },
      stageSummaries: {
        stateOfFact: {
          status: "ok",
          ks: 12.34567,
          Vy: 42.5,
          du: 0.12345,
          maxBaseShear: 55.5,
          pierCount: 4,
          ringFrameCount: 1,
        },
        design: {
          status: "ok",
          ks: 14.5,
          Vy: 48.25,
          du: 0.23456,
          maxBaseShear: 62.75,
          pierCount: 5,
          ringFrameCount: 2,
        },
      },
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
        {
          id: "strength-non-decreasing",
          description: "Resistenza Vy",
          stateOfFactValue: 42.5,
          designValue: 48.25,
          delta: 5.75,
          variationPercent: 13.529,
          criterion: { type: "minimum" },
          ok: true,
        },
        {
          id: "deformability-non-decreasing",
          description: "Deformabilità du",
          stateOfFactValue: 0.12345,
          designValue: 0.23456,
          delta: 0.11111,
          variationPercent: 90,
          criterion: { type: "minimum" },
          ok: true,
        },
      ],
    },
    reading: {
      headline: "Tutti i criteri ante/post configurati",
      outcome: "accepted",
      governingCheckId: "stiffness-variation",
      messages: ["Lettura μ", "Nessuna riduzione α"],
    },
    warnings: ["Avviso | μ"],
    assumptions: ["Assunzione α"],
  };
}

void test("alignment report utilities match independent pinned JavaScript implementations", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRendererModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/AlignmentStateComparisonMarkdownRenderer.js",
  );
  const typescriptRendererModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/AlignmentStateComparisonMarkdownRenderer.js",
  );
  const sourceArtifactModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/AlignmentStateComparisonReportArtifacts.js",
  );
  const typescriptArtifactModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/AlignmentStateComparisonReportArtifacts.js",
  );

  if (
    !isRendererModule(sourceRendererModuleValue) ||
    !isRendererModule(typescriptRendererModuleValue) ||
    !isArtifactModule(sourceArtifactModuleValue) ||
    !isArtifactModule(typescriptArtifactModuleValue)
  ) {
    throw new Error("Alignment report modules do not expose the expected APIs.");
  }

  assert.notEqual(
    sourceRendererModuleValue.AlignmentStateComparisonMarkdownRenderer,
    typescriptRendererModuleValue.AlignmentStateComparisonMarkdownRenderer,
    "renderer independent implementation",
  );
  assert.notEqual(
    sourceArtifactModuleValue.createAlignmentStateComparisonReportArtifacts,
    typescriptArtifactModuleValue.createAlignmentStateComparisonReportArtifacts,
    "artifact factory independent implementation",
  );

  const sourceRenderer = new sourceRendererModuleValue.AlignmentStateComparisonMarkdownRenderer();
  const typescriptRenderer =
    new typescriptRendererModuleValue.AlignmentStateComparisonMarkdownRenderer();
  if (!isRenderer(sourceRenderer) || !isRenderer(typescriptRenderer)) {
    throw new Error("Alignment report renderers do not expose render().");
  }

  const report = createReport();
  const sourceMarkdown = sourceRenderer.render(report);
  const typescriptMarkdown = typescriptRenderer.render(report);
  assertExactParity(sourceMarkdown, typescriptMarkdown, "Markdown rendering");

  const artifactInput = {
    json: {
      id: "alignment-state-report-α",
      schemaVersion: "1.0.0",
      title: "Confronto μ",
      unicode: "cerchiatura-✓",
    },
    markdown: sourceMarkdown,
  };
  const options = {
    baseName: " Report/Confronto α ",
    jsonSpacing: 2,
  };
  const sourceArtifacts = sourceArtifactModuleValue.createAlignmentStateComparisonReportArtifacts(
    artifactInput,
    options,
  );
  const typescriptArtifacts =
    typescriptArtifactModuleValue.createAlignmentStateComparisonReportArtifacts(
      artifactInput,
      options,
    );
  assertExactParity(sourceArtifacts, typescriptArtifacts, "report artifacts");

  const sourceJsonArtifact = isRecord(sourceArtifacts)
    ? undefined
    : isUnknownArray(sourceArtifacts)
      ? sourceArtifacts.find((artifact) => isRecord(artifact) && artifact.format === "json")
      : undefined;
  const typescriptJsonArtifact = isUnknownArray(typescriptArtifacts)
    ? typescriptArtifacts.find((artifact) => isRecord(artifact) && artifact.format === "json")
    : undefined;
  if (isRecord(sourceJsonArtifact) && isRecord(typescriptJsonArtifact)) {
    assertExactParity(
      sourceJsonArtifact.content,
      typescriptJsonArtifact.content,
      "artifact JSON content",
    );
  }

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "missing report.json",
      () => sourceArtifactModuleValue.createAlignmentStateComparisonReportArtifacts({}),
      () => typescriptArtifactModuleValue.createAlignmentStateComparisonReportArtifacts({}),
    ],
    [
      "missing report.markdown",
      () =>
        sourceArtifactModuleValue.createAlignmentStateComparisonReportArtifacts({
          json: { id: "report" },
        }),
      () =>
        typescriptArtifactModuleValue.createAlignmentStateComparisonReportArtifacts({
          json: { id: "report" },
        }),
    ],
    [
      "markdown disabled",
      () =>
        sourceArtifactModuleValue.createAlignmentStateComparisonReportArtifacts(
          { json: { id: "report" } },
          { includeMarkdown: false },
        ),
      () =>
        typescriptArtifactModuleValue.createAlignmentStateComparisonReportArtifacts(
          { json: { id: "report" } },
          { includeMarkdown: false },
        ),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of errorCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} behavior`);
  }
});
