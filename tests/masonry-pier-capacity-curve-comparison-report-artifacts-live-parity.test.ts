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
type RuntimeArtifactFactory = (report?: unknown, options?: unknown) => unknown;

interface RuntimeArtifactModule extends RuntimeRecord {
  createMasonryPierCapacityCurveComparisonReportArtifacts: RuntimeArtifactFactory;
}

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isArtifactModule(value: unknown): value is RuntimeArtifactModule {
  return (
    isRecord(value) &&
    typeof value.createMasonryPierCapacityCurveComparisonReportArtifacts === "function"
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
}

function assertArtifactStringParity(source: unknown, typescript: unknown, label: string): void {
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
      throw new Error("The artifact factory threw a non-Error value.", { cause: error });
    }
    return { name: error.name, message: error.message };
  }
}

function createReport(): RuntimeRecord {
  return {
    json: {
      id: "alignment-α-pier-μ-capacity-comparison-report",
      schemaVersion: "masonry-wall-openings-pier-capacity-comparison-report/v1",
      title: "Confronto capacità μ",
      comparison: { status: "consistent", value: 1.2345 },
    },
    markdown: "# Confronto capacità μ\n\n## Sintesi Curve\n\n✓ α | β",
  };
}

void test("masonry pier capacity-curve artifacts match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonReportArtifacts.js",
  );
  const typescriptModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/reports/MasonryPierCapacityCurveComparisonReportArtifacts.js",
  );
  if (!isArtifactModule(sourceModuleValue) || !isArtifactModule(typescriptModuleValue)) {
    throw new Error("Masonry pier artifact modules do not expose the expected API.");
  }

  assert.notEqual(
    sourceModuleValue.createMasonryPierCapacityCurveComparisonReportArtifacts,
    typescriptModuleValue.createMasonryPierCapacityCurveComparisonReportArtifacts,
    "artifact factory independent implementation",
  );

  const sourceFactory = sourceModuleValue.createMasonryPierCapacityCurveComparisonReportArtifacts;
  const typescriptFactory =
    typescriptModuleValue.createMasonryPierCapacityCurveComparisonReportArtifacts;
  const report = createReport();
  const cases: readonly [string, unknown, unknown][] = [
    ["default options", undefined, undefined],
    ["custom Unicode base name", { baseName: "  Report capacità/μ  " }, undefined],
    ["JSON only", { includeMarkdown: false, jsonSpacing: 0 }, undefined],
    ["Markdown only", { includeJson: false, baseName: "solo-α" }, undefined],
    ["string spacing", { jsonSpacing: "\t" }, undefined],
  ];

  for (const [label, options] of cases) {
    const sourceArtifacts = sourceFactory(report, options);
    const typescriptArtifacts = typescriptFactory(report, options);
    assertExactParity(typescriptArtifacts, sourceArtifacts, label);
    if (isUnknownArray(sourceArtifacts) && isUnknownArray(typescriptArtifacts)) {
      for (let index = 0; index < sourceArtifacts.length; index += 1) {
        const sourceArtifact = sourceArtifacts[index];
        const typescriptArtifact = typescriptArtifacts[index];
        if (isRecord(sourceArtifact) && isRecord(typescriptArtifact)) {
          const fields: readonly string[] = ["fileName", "content"];
          for (const field of fields) {
            assertArtifactStringParity(
              sourceArtifact[field],
              typescriptArtifact[field],
              `${label} ${field}`,
            );
          }
        }
      }
    }
  }

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    ["missing report", () => sourceFactory(undefined), () => typescriptFactory(undefined)],
    [
      "missing JSON",
      () => sourceFactory({ markdown: "# report" }),
      () => typescriptFactory({ markdown: "# report" }),
    ],
    [
      "missing Markdown",
      () => sourceFactory({ json: { id: "report-α" } }),
      () => typescriptFactory({ json: { id: "report-α" } }),
    ],
    [
      "missing JSON despite JSON disabled",
      () => sourceFactory({ markdown: "# report" }, { includeJson: false }),
      () => typescriptFactory({ markdown: "# report" }, { includeJson: false }),
    ],
  ];
  for (const [label, sourceRun, typescriptRun] of errorCases) {
    assertExactParity(captureError(sourceRun), captureError(typescriptRun), `${label} error`);
  }
});
