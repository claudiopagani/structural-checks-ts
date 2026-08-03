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
type RuntimeRendererConstructor = new () => RuntimeRenderer;

interface RuntimeRendererModule extends RuntimeRecord {
  MasonryPierCapacityCurveComparisonMarkdownRenderer: RuntimeRendererConstructor;
}

interface RuntimeRenderer {
  render: (report: unknown) => unknown;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRendererModule(value: unknown): value is RuntimeRendererModule {
  return (
    isRecord(value) &&
    typeof value.MasonryPierCapacityCurveComparisonMarkdownRenderer === "function"
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
      throw new Error("The renderer threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function createReport(): RuntimeRecord {
  return {
    title: "Confronto curva di capacita μ | α",
    description: "Descrizione ✓ con carattere | separatore",
    units: { force: "kN", length: "m" },
    model: { id: "alignment-α", label: "Allineamento μ" },
    pier: {
      id: "alignment-α-pier-1",
      wallId: "wall-1",
      topRotation: "free",
      governingMode: "rocking-toe-crushing",
    },
    aggregated: {
      performance: {
        ks: 1234.56789,
        Vy: 456.789,
        du: 0.012345,
        peakBaseShear: 500.25,
        governingMode: "rocking-toe-crushing",
      },
    },
    fem: {
      performance: {
        ks: 1200.1234,
        Vy: 460.789,
        du: 0.013,
        peakBaseShear: 510.5,
        hingeCount: 3,
      },
      finalState: { termination: { reason: "converged-✓" } },
    },
    comparison: {
      metrics: [
        {
          id: "ks",
          label: "Rigidezza μ",
          aggregatedValue: 1234.56789,
          femValue: 1200.1234,
          delta: -34.44449,
          variationPercent: -2.789,
        },
        {
          id: "Vy",
          aggregatedValue: Infinity,
          femValue: NaN,
          delta: null,
          variationPercent: "non disponibile",
        },
      ],
      sampledCurvePoints: [
        {
          displacement: 0.00123456,
          aggregatedBaseShear: 100.25,
          femBaseShear: 98.75,
          delta: -1.5,
          variationPercent: -1.496,
        },
      ],
    },
    reading: {
      outcome: "consistent",
      headline: "Confronto coerente μ",
      governingMetricId: "ks",
      messages: ["Lettura α", "Nessuna anomalia ✓"],
    },
    warnings: ["Avviso | μ", ""],
    assumptions: ["Assunzione α"],
  };
}

void test("masonry pier capacity-curve renderer matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonMarkdownRenderer.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonMarkdownRenderer.js",
  );
  if (!isRendererModule(sourceModuleValue) || !isRendererModule(typescriptModuleValue)) {
    throw new Error("Masonry pier renderer modules do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.MasonryPierCapacityCurveComparisonMarkdownRenderer,
    typescriptModuleValue.MasonryPierCapacityCurveComparisonMarkdownRenderer,
    "renderer independent implementation",
  );

  const sourceRenderer = new sourceModuleValue.MasonryPierCapacityCurveComparisonMarkdownRenderer();
  const typescriptRenderer =
    new typescriptModuleValue.MasonryPierCapacityCurveComparisonMarkdownRenderer();
  if (!isRenderer(sourceRenderer) || !isRenderer(typescriptRenderer)) {
    throw new Error("Masonry pier renderer instances do not expose the expected API.");
  }

  const report = createReport();
  assertExactParity(
    sourceRenderer.render(report),
    typescriptRenderer.render(report),
    "complete report",
  );
  assertExactParity(sourceRenderer.render({}), typescriptRenderer.render({}), "empty report");
  assertExactParity(
    sourceRenderer.render({
      title: "Fallback μ",
      comparison: { metrics: [], sampledCurvePoints: [] },
      warnings: null,
      assumptions: null,
      reading: null,
    }),
    typescriptRenderer.render({
      title: "Fallback μ",
      comparison: { metrics: [], sampledCurvePoints: [] },
      warnings: null,
      assumptions: null,
      reading: null,
    }),
    "fallback report",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    ["null report", () => sourceRenderer.render(null), () => typescriptRenderer.render(null)],
    [
      "undefined report",
      () => sourceRenderer.render(undefined),
      () => typescriptRenderer.render(undefined),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of errorCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} error`);
  }
});
