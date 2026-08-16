/**
 * Shared infrastructure for the masonry-arches scientific benchmark suite.
 *
 * The suite proves the solver; the solver is never tuned to pass the suite. Reference values are
 * read from the provenance-bearing source records under `sources/` (never duplicated, never
 * guessed), solver predictions come from the public library API, and every comparison is
 * classified with a fixed discrepancy taxonomy before any interpretation.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const BENCHMARKS_ROOT = import.meta.dirname;
export const SOURCES_ROOT = path.join(BENCHMARKS_ROOT, "sources");
export const RESULTS_ROOT = path.join(BENCHMARKS_ROOT, "results");

export type DiscrepancyClassification =
  | "SOLVER_BUG"
  | "MISSING_PHYSICS"
  | "MODEL_FORM_DIFFERENCE"
  | "UNAVAILABLE_INPUT"
  | "EXPERIMENTAL_SCATTER"
  | "DIGITIZATION_UNCERTAINTY"
  | "NOT_DIRECTLY_COMPARABLE"
  | "NONE";

export interface ProvenanceRecord {
  readonly kind:
    | "exact"
    | "digitized"
    | "approximate-digitized"
    | "derived"
    | "quoted"
    | "stated-range"
    | "unknown";
  readonly location: string;
  readonly unit: string | null;
  readonly notes?: string | null;
}

/** A scalar reference value with its provenance, as stored in a source record. */
export interface ProvenancedValue {
  readonly value: number | null;
  readonly kind: ProvenanceRecord["kind"];
  readonly location: string;
  readonly unit: string | null;
  readonly notes?: string | null;
}

export interface BenchmarkComparison {
  readonly caseId: string;
  readonly sourceId: string;
  readonly specimenId: string;
  readonly tier: "A" | "B" | "C";
  readonly family: "URM" | "TIE-ROD" | "BONDED-INTRADOS" | "BONDED-EXTRADOS" | "OTHER";
  readonly observable: string;
  readonly referenceValue: number | null;
  readonly predictedValue: number | null;
  readonly units: string | null;
  readonly relativeError: number | null;
  /** Pre-declared acceptance tolerance as a fraction of the reference value. */
  readonly acceptanceTolerance: number | null;
  readonly quantitativeStatus:
    | "within-tolerance"
    | "outside-tolerance"
    | "indeterminate"
    | "qualitative-only";
  readonly mechanismAgreement: "pass" | "partial" | "fail" | "not-assessed";
  readonly discrepancyClassification: DiscrepancyClassification;
  readonly provenance: ProvenanceRecord;
  readonly notes: string;
}

export interface ConvergenceStudyRow {
  readonly caseId: string;
  readonly parameter: string;
  readonly value: number | string;
  readonly observable: string;
  readonly predictedValue: number | null;
  readonly relativeChangeVsPrevious: number | null;
  readonly notes: string;
}

export interface ArcLengthRobustnessRow {
  readonly caseId: string;
  readonly parameter: string;
  readonly value: number;
  readonly termination: string;
  readonly status: string;
  readonly lambdaVerificationLimit: number | null;
  readonly verifiedLimitPoint: number | null;
  readonly maximumObservedLambda: number | null;
  readonly cutbacks: number;
  readonly notes: string;
}

export interface BenchmarkRunResult {
  readonly generatedOn: string;
  readonly solverRevision: string;
  readonly comparisons: readonly BenchmarkComparison[];
  readonly convergenceStudy: readonly ConvergenceStudyRow[];
  readonly arcLengthRobustness: readonly ArcLengthRobustnessRow[];
  readonly pending: readonly {
    readonly caseId: string;
    readonly reason: string;
  }[];
}

export function relativeError(predicted: number, reference: number): number {
  return (predicted - reference) / reference;
}

export function classifyQuantitative(
  predicted: number | null,
  reference: number | null,
  tolerance: number | null,
): BenchmarkComparison["quantitativeStatus"] {
  if (predicted === null || reference === null) return "indeterminate";
  if (tolerance === null) return "qualitative-only";
  return Math.abs(relativeError(predicted, reference)) <= tolerance
    ? "within-tolerance"
    : "outside-tolerance";
}

/** Loads a source record JSON and resolves a value by a dotted path under its specimens array. */
export async function readProvenancedValue(
  sourceId: string,
  specimenId: string,
  observablePath: string,
): Promise<ProvenancedValue> {
  const record = JSON.parse(
    await readFile(path.join(SOURCES_ROOT, `${sourceId}.json`), "utf8"),
  ) as {
    specimens?: {
      id: string;
      observables?: Record<string, unknown>;
    }[];
  };
  const specimen = record.specimens?.find((item) => item.id === specimenId);
  if (specimen === undefined) {
    throw new Error(`Specimen ${specimenId} not found in source record ${sourceId}.`);
  }
  const observable = (specimen.observables ?? {})[observablePath];
  if (
    observable === undefined ||
    observable === null ||
    typeof observable !== "object" ||
    !("value" in observable)
  ) {
    throw new Error(
      `Observable ${observablePath} of ${specimenId} is not a provenanced value in ${sourceId}.`,
    );
  }
  const raw = observable as {
    value: number | null;
    kind?: string;
    location?: string;
    unit?: string | null;
    notes?: string | null;
  };
  return {
    value: raw.value,
    kind: (raw.kind as ProvenanceRecord["kind"]) ?? "unknown",
    location: raw.location ?? "n/a",
    unit: raw.unit ?? null,
    notes: raw.notes ?? null,
  };
}

export interface ReportStatistics {
  readonly sourceCount: number;
  readonly specimenCount: number;
  readonly tierA: number;
  readonly tierB: number;
  readonly tierC: number;
  readonly quantitativeCount: number;
  readonly qualitativeCount: number;
  readonly withinTolerance: number;
  readonly outsideTolerance: number;
  readonly indeterminateSolverRuns: number;
  readonly solverBugs: number;
  readonly modelLimitations: number;
  readonly unavailableInputs: number;
  readonly byFamily: Readonly<Record<string, { readonly total: number; readonly within: number }>>;
  readonly byDiscrepancy: Readonly<Record<string, number>>;
}

export function computeStatistics(comparisons: readonly BenchmarkComparison[]): ReportStatistics {
  const stats: {
    sourceCount: number;
    specimenCount: number;
    tierA: number;
    tierB: number;
    tierC: number;
    quantitativeCount: number;
    qualitativeCount: number;
    withinTolerance: number;
    outsideTolerance: number;
    indeterminateSolverRuns: number;
    solverBugs: number;
    modelLimitations: number;
    unavailableInputs: number;
    byFamily: Record<string, { total: number; within: number }>;
    byDiscrepancy: Record<string, number>;
  } = {
    sourceCount: new Set(comparisons.map((item) => item.sourceId)).size,
    specimenCount: new Set(comparisons.map((item) => item.specimenId)).size,
    tierA: 0,
    tierB: 0,
    tierC: 0,
    quantitativeCount: 0,
    qualitativeCount: 0,
    withinTolerance: 0,
    outsideTolerance: 0,
    indeterminateSolverRuns: 0,
    solverBugs: 0,
    modelLimitations: 0,
    unavailableInputs: 0,
    byFamily: {},
    byDiscrepancy: {},
  };
  for (const item of comparisons) {
    if (item.tier === "A") stats.tierA += 1;
    else if (item.tier === "B") stats.tierB += 1;
    else stats.tierC += 1;
    if (item.quantitativeStatus === "qualitative-only") stats.qualitativeCount += 1;
    else if (item.referenceValue !== null) {
      stats.quantitativeCount += 1;
      if (item.quantitativeStatus === "within-tolerance") stats.withinTolerance += 1;
      else if (item.quantitativeStatus === "outside-tolerance") stats.outsideTolerance += 1;
      else if (item.quantitativeStatus === "indeterminate") stats.indeterminateSolverRuns += 1;
    }
    if (item.discrepancyClassification === "SOLVER_BUG") stats.solverBugs += 1;
    if (
      item.discrepancyClassification === "MISSING_PHYSICS" ||
      item.discrepancyClassification === "MODEL_FORM_DIFFERENCE"
    ) {
      stats.modelLimitations += 1;
    }
    if (item.discrepancyClassification === "UNAVAILABLE_INPUT") stats.unavailableInputs += 1;
    stats.byFamily[item.family] = {
      total: (stats.byFamily[item.family]?.total ?? 0) + 1,
      within:
        (stats.byFamily[item.family]?.within ?? 0) +
        (item.quantitativeStatus === "within-tolerance" ? 1 : 0),
    };
    if (item.discrepancyClassification !== "NONE") {
      stats.byDiscrepancy[item.discrepancyClassification] =
        (stats.byDiscrepancy[item.discrepancyClassification] ?? 0) + 1;
    }
  }
  return stats;
}

export function percent(value: number | null): string {
  return value === null ? "—" : `${(100 * value).toFixed(1)}%`;
}

export async function writeRunResult(run: BenchmarkRunResult): Promise<void> {
  await import("node:fs/promises").then((fs) => fs.mkdir(RESULTS_ROOT, { recursive: true }));
  await writeFile(
    path.join(RESULTS_ROOT, "validation-results.json"),
    `${JSON.stringify(run, null, 2)}\n`,
    "utf8",
  );
}

export async function writeMarkdownReport(run: BenchmarkRunResult, body: string): Promise<void> {
  await import("node:fs/promises").then((fs) => fs.mkdir(RESULTS_ROOT, { recursive: true }));
  const stats = computeStatistics(run.comparisons);
  const tableRows = run.comparisons
    .map((item) => {
      return (
        `| ${item.sourceId} | ${item.specimenId} | ${item.tier} | ${item.family} | ` +
        `${item.observable} | ${item.referenceValue ?? "—"} | ${item.predictedValue ?? "—"} | ` +
        `${percent(item.relativeError)} | ${item.acceptanceTolerance === null ? "—" : percent(item.acceptanceTolerance)} | ` +
        `${item.quantitativeStatus} | ${item.mechanismAgreement} | ${item.discrepancyClassification} | ${item.notes} |`
      );
    })
    .join("\n");
  const report = `# Masonry-arches scientific validation report

Generated: ${run.generatedOn} | Solver revision: ${run.solverRevision}

This report validates the masonry-arches module of \`structural-checks-ts\` against independent
literature benchmarks. The suite proves the solver: no solver parameter was calibrated on the
benchmark data in this step, every comparison uses a pre-declared tolerance, and every discrepancy
is classified with the fixed taxonomy (SOLVER_BUG / MISSING_PHYSICS / MODEL_FORM_DIFFERENCE /
UNAVAILABLE_INPUT / EXPERIMENTAL_SCATTER / DIGITIZATION_UNCERTAINTY / NOT_DIRECTLY_COMPARABLE).

## Summary statistics

- Sources: ${stats.sourceCount} | Specimens: ${stats.specimenCount}
- Tier A: ${stats.tierA} | Tier B: ${stats.tierB} | Tier C: ${stats.tierC}
- Quantitative comparisons: ${stats.quantitativeCount} | qualitative-only: ${stats.qualitativeCount}
- Within tolerance: ${stats.withinTolerance} | outside tolerance: ${stats.outsideTolerance} | solver INDETERMINATE: ${stats.indeterminateSolverRuns}
- SOLVER_BUG: ${stats.solverBugs} | model limitations (MISSING_PHYSICS + MODEL_FORM_DIFFERENCE): ${stats.modelLimitations} | UNAVAILABLE_INPUT: ${stats.unavailableInputs}

No single "accuracy score" is produced: a single scalar would mix analytical, numerical, and
experimental references of different tiers and would be scientifically misleading.

## Main comparison table

| Source | Specimen | Tier | Family | Observable | Reference | Solver | Rel. error | Tolerance | Quantitative | Mechanism | Classification | Notes |
| ------ | -------- | :--: | ------ | ---------- | --------- | ------ | ---------- | --------- | ------------ | --------- | -------------- | ----- |
${tableRows}

${body}

## Pending items

${run.pending.map((item) => `- \`${item.caseId}\`: ${item.reason}`).join("\n") || "- none"}
`;
  await writeFile(path.join(RESULTS_ROOT, "validation-report.md"), report, "utf8");
}

export async function solverRevision(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function moduleUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}
