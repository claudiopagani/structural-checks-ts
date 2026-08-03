import {
  AlignmentStateComparisonMarkdownRenderer,
  type AlignmentStateComparisonReportCheck,
  type AlignmentStateComparisonReportComparison,
  type AlignmentStateComparisonReportCriteria,
  type AlignmentStateComparisonReport,
  type AlignmentStateComparisonReportModel,
  type AlignmentStateComparisonReportReading,
  type AlignmentStateComparisonReportStageSummary,
  type AlignmentStateComparisonReportUnits,
  type AlignmentStateComparisonReportValue,
} from "./AlignmentStateComparisonMarkdownRenderer.js";

export const ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION =
  "masonry-wall-openings-state-comparison-report/v1";

type PlainValue = null | number | string | boolean | undefined;

interface ReportObject extends Record<string, unknown> {
  toJSON?: unknown;
}

export interface AlignmentStateComparisonReportBuilderModel {
  id: AlignmentStateComparisonReportValue;
  label?: AlignmentStateComparisonReportValue;
  units?: unknown;
  walls?: readonly unknown[] | null;
  openings?: readonly unknown[] | null;
  totalLength?: (() => unknown) | null;
  maxHeight?: (() => unknown) | null;
  settings?: unknown;
}

export interface AlignmentStateComparisonReportBuilderOutputs {
  criteria?: unknown;
  stateOfFact?: { performanceSummary?: unknown } | null;
  design?: { performanceSummary?: unknown } | null;
  comparison?: { checks?: unknown; overall?: unknown } | null;
  reading?: unknown;
}

export interface AlignmentStateComparisonReportBuilderComparisonResult {
  toJSON?: () => unknown;
  outputs?: AlignmentStateComparisonReportBuilderOutputs | null;
  warnings?: readonly unknown[] | null;
  assumptions?: readonly unknown[] | null;
  metadata?: Record<string, unknown> | null;
  status?: unknown;
}

export type AlignmentStateComparisonReportBuilderMetadata = Record<string, unknown>;

export interface AlignmentStateComparisonReportBuilderRendererObject {
  render: (report: AlignmentStateComparisonReport) => string;
}

export type AlignmentStateComparisonReportBuilderRenderer =
  | ((report: AlignmentStateComparisonReport) => string)
  | AlignmentStateComparisonReportBuilderRendererObject;

export interface AlignmentStateComparisonReportBuilderOptions {
  applicationId?: string;
  schemaVersion?: string;
  metadata?: AlignmentStateComparisonReportBuilderMetadata;
  markdownRenderer?: AlignmentStateComparisonReportBuilderRenderer;
}

export interface AlignmentStateComparisonReportBuilderBuildInput {
  model?: AlignmentStateComparisonReportBuilderModel;
  comparisonResult?: AlignmentStateComparisonReportBuilderComparisonResult;
  metadata?: AlignmentStateComparisonReportBuilderMetadata;
}

interface AlignmentStateComparisonReportBuilderBuildJsonInput {
  model: AlignmentStateComparisonReportBuilderModel;
  comparisonResult: AlignmentStateComparisonReportBuilderComparisonResult;
  metadata?: AlignmentStateComparisonReportBuilderMetadata;
}

export interface AlignmentStateComparisonReportBuilderJson extends AlignmentStateComparisonReport {
  schemaVersion: string;
  applicationId: string;
  id: string;
  title: string;
  description: string;
  units: AlignmentStateComparisonReportUnits | null;
  model: AlignmentStateComparisonReportModel;
  comparison: AlignmentStateComparisonReportComparison;
  reading: AlignmentStateComparisonReportReading;
  warnings: AlignmentStateComparisonReportValue[];
  assumptions: AlignmentStateComparisonReportValue[];
  metadata: Record<string, unknown>;
}

export interface AlignmentStateComparisonReportBuilderReport {
  json: AlignmentStateComparisonReportBuilderJson;
  markdown: string;
}

function isPlainObject(value: object): boolean {
  return Object.getPrototypeOf(value) === Object.prototype;
}

const sourceStringImplementation: (value: unknown) => string = String;

function sourceString(value: unknown): string {
  return sourceStringImplementation(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownFunction(
  value: unknown,
): value is (...arguments_: readonly unknown[]) => unknown {
  return typeof value === "function";
}

function toPlain(
  value: unknown,
  seen = new WeakSet<object>(),
): PlainValue | unknown[] | ReportObject {
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: value.name || null,
    };
  }

  if (typeof value !== "object") {
    if (typeof value === "bigint" || typeof value === "symbol") {
      return String(value);
    }

    return undefined;
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item, seen));
  }

  const toJSONValue = "toJSON" in value ? value.toJSON : undefined;
  if (isUnknownFunction(toJSONValue) && !isPlainObject(value)) {
    return toPlain(toJSONValue(), seen);
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toPlain(item, seen)]));
}

function unique(
  items: readonly AlignmentStateComparisonReportValue[],
): AlignmentStateComparisonReportValue[] {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

function resultRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  return {};
}

function reportUnits(value: unknown): AlignmentStateComparisonReportUnits | null {
  if (value == null) {
    return null;
  }

  const record = resultRecord(toPlain(value));
  return { ...record };
}

function reportCriteria(value: unknown): AlignmentStateComparisonReportCriteria {
  return resultRecord(toPlain(value));
}

function reportCheck(value: unknown): AlignmentStateComparisonReportCheck {
  return resultRecord(value);
}

function reportStageSummary(value: unknown): AlignmentStateComparisonReportStageSummary {
  return resultRecord(toPlain(value));
}

function reportReading(value: unknown): AlignmentStateComparisonReportReading {
  return resultRecord(toPlain(value));
}

function reportModel(
  model: AlignmentStateComparisonReportBuilderModel,
): AlignmentStateComparisonReportModel {
  const settings = resultRecord(toPlain(model.settings ?? {}));

  return {
    id: model.id,
    label: model.label ?? model.id,
    wallCount: model.walls?.length ?? 0,
    openingCount: model.openings?.length ?? 0,
    totalLength: typeof model.totalLength === "function" ? model.totalLength() : null,
    maxHeight: typeof model.maxHeight === "function" ? model.maxHeight() : null,
    settings,
  };
}

function reportComparison(
  outputs: Record<string, unknown>,
): AlignmentStateComparisonReportComparison {
  const comparison = resultRecord(outputs.comparison);
  const stateOfFact = resultRecord(outputs.stateOfFact);
  const design = resultRecord(outputs.design);
  const checks = toPlain(comparison.checks ?? []);

  return {
    criteria: reportCriteria(outputs.criteria ?? {}),
    stageSummaries: {
      stateOfFact: reportStageSummary(stateOfFact.performanceSummary ?? {}),
      design: reportStageSummary(design.performanceSummary ?? {}),
    },
    checks: Array.isArray(checks) ? checks.map((check) => reportCheck(check)) : [],
    overall: toPlain(comparison.overall ?? {}),
  };
}

export class AlignmentStateComparisonReportBuilder {
  readonly applicationId: string;
  readonly schemaVersion: string;
  readonly metadata: AlignmentStateComparisonReportBuilderMetadata;
  readonly markdownRenderer: AlignmentStateComparisonReportBuilderRenderer;

  constructor({
    applicationId = "masonry-wall-openings",
    schemaVersion = ALIGNMENT_STATE_COMPARISON_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new AlignmentStateComparisonMarkdownRenderer(),
  }: AlignmentStateComparisonReportBuilderOptions = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = { ...metadata };
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    comparisonResult,
    metadata = {},
  }: AlignmentStateComparisonReportBuilderBuildInput = {}): AlignmentStateComparisonReportBuilderReport {
    if (!model) {
      throw new Error("AlignmentStateComparisonReportBuilder requires a model.");
    }

    if (!comparisonResult) {
      throw new Error("AlignmentStateComparisonReportBuilder requires a comparisonResult.");
    }

    const json = this.buildJson({
      model,
      comparisonResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    comparisonResult,
    metadata = {},
  }: AlignmentStateComparisonReportBuilderBuildJsonInput): AlignmentStateComparisonReportBuilderJson {
    const resultJsonValue =
      typeof comparisonResult.toJSON === "function"
        ? comparisonResult.toJSON()
        : toPlain(comparisonResult);
    const resultJson = resultRecord(resultJsonValue);
    const outputs = resultRecord(resultJson.outputs ?? {});
    const reportId = `${sourceString(model.id)}-state-comparison-report`;
    const resultMetadata = resultRecord(resultJson.metadata);

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: reportId,
      title: `Confronto ante/post ${sourceString(model.label ?? model.id)}`,
      description:
        "Report sintetico del confronto tra stato di fatto e progetto basato sull'analisi sismica aggregata dell'allineamento murario.",
      units: reportUnits(model.units),
      model: reportModel(model),
      comparison: reportComparison(outputs),
      reading: reportReading(outputs.reading ?? {}),
      warnings: unique(Array.isArray(resultJson.warnings) ? resultJson.warnings : []),
      assumptions: unique(Array.isArray(resultJson.assumptions) ? resultJson.assumptions : []),
      metadata: {
        ...this.metadata,
        ...metadata,
        comparisonType: resultMetadata.comparisonType ?? null,
        resultStatus: resultJson.status,
        generatedBy: "AlignmentStateComparisonReportBuilder",
      },
    };
  }

  renderMarkdown(report: AlignmentStateComparisonReport): string {
    if (typeof this.markdownRenderer === "function") {
      return this.markdownRenderer(report);
    }

    if (typeof this.markdownRenderer?.render === "function") {
      return this.markdownRenderer.render(report);
    }

    throw new Error(
      "AlignmentStateComparisonReportBuilder requires a markdown renderer with a render() method.",
    );
  }

  buildMarkdown(report: AlignmentStateComparisonReport): string {
    return this.renderMarkdown(report);
  }
}
