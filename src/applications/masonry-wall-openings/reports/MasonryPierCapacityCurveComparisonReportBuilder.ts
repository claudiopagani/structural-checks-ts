import {
  MasonryPierCapacityCurveComparisonMarkdownRenderer,
  type MasonryPierCapacityCurveComparisonReport,
} from "./MasonryPierCapacityCurveComparisonMarkdownRenderer.js";

export const MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION =
  "masonry-wall-openings-pier-capacity-comparison-report/v1";

type PlainValue = null | number | string | boolean | undefined;

interface PlainObject extends Record<string, unknown> {
  toJSON?: unknown;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderOutputs
  extends Record<string, unknown> {
  pier?: Record<string, unknown> | null;
  aggregated?: Record<string, unknown> | null;
  fem?: Record<string, unknown> | null;
  comparison?: Record<string, unknown> | null;
  reading?: Record<string, unknown> | null;
}

interface MasonryPierCapacityCurveComparisonResultJson extends Record<string, unknown> {
  outputs?: MasonryPierCapacityCurveComparisonReportBuilderOutputs | null;
  warnings?: readonly unknown[] | null;
  assumptions?: readonly unknown[] | null;
  metadata?: Record<string, unknown> | null;
  status?: unknown;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderModel {
  id: unknown;
  label?: unknown;
  units?: unknown;
  walls?: readonly unknown[] | null;
  openings?: readonly unknown[] | null;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult {
  toJSON?: () => unknown;
  outputs?: MasonryPierCapacityCurveComparisonReportBuilderOutputs | null;
  warnings?: readonly unknown[] | null;
  assumptions?: readonly unknown[] | null;
  metadata?: Record<string, unknown> | null;
  status?: unknown;
}

export type MasonryPierCapacityCurveComparisonReportBuilderMetadata = Record<string, unknown>;

export interface MasonryPierCapacityCurveComparisonReportBuilderOptions {
  applicationId?: string;
  schemaVersion?: string;
  metadata?: MasonryPierCapacityCurveComparisonReportBuilderMetadata | null;
  markdownRenderer?: MasonryPierCapacityCurveComparisonReportBuilderRenderer;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderBuildInput {
  model?: MasonryPierCapacityCurveComparisonReportBuilderModel;
  analysisResult?: MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult;
  metadata?: MasonryPierCapacityCurveComparisonReportBuilderMetadata | null;
}

interface MasonryPierCapacityCurveComparisonReportBuilderBuildJsonInput {
  model: MasonryPierCapacityCurveComparisonReportBuilderModel;
  analysisResult: MasonryPierCapacityCurveComparisonReportBuilderAnalysisResult;
  metadata?: MasonryPierCapacityCurveComparisonReportBuilderMetadata | null;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderRendererObject {
  render: (report: MasonryPierCapacityCurveComparisonReport) => string;
}

export type MasonryPierCapacityCurveComparisonReportBuilderRenderer =
  | ((report: MasonryPierCapacityCurveComparisonReport) => string)
  | MasonryPierCapacityCurveComparisonReportBuilderRendererObject;

export interface MasonryPierCapacityCurveComparisonReportBuilderJson
  extends MasonryPierCapacityCurveComparisonReport {
  schemaVersion: string;
  applicationId: string;
  id: string;
  title: string;
  description: string;
  units: Record<string, unknown> | null;
  model: {
    id: unknown;
    label: unknown;
    wallCount: number;
    openingCount: number;
  };
  pier: Record<string, unknown>;
  aggregated: Record<string, unknown>;
  fem: Record<string, unknown>;
  comparison: Record<string, unknown>;
  reading: Record<string, unknown>;
  warnings: unknown[];
  assumptions: unknown[];
  metadata: Record<string, unknown>;
}

export interface MasonryPierCapacityCurveComparisonReportBuilderReport {
  json: MasonryPierCapacityCurveComparisonReportBuilderJson;
  markdown: string;
}

function isPlainObject(value: object): boolean {
  return Object.getPrototypeOf(value) === Object.prototype;
}

const sourceStringImplementation: (value: unknown) => string = String;

function sourceString(value: unknown): string {
  return sourceStringImplementation(value);
}

function templateString(value: unknown): string {
  if (typeof value === "symbol") {
    throw new TypeError("Cannot convert a Symbol value to a string");
  }

  return sourceString(value);
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
): PlainValue | unknown[] | PlainObject {
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
    return sourceString(value);
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

function resultRecord(value: unknown): MasonryPierCapacityCurveComparisonResultJson {
  if (isRecord(value)) {
    return value;
  }

  return {};
}

function reportRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  return {};
}

function reportUnits(value: unknown): Record<string, unknown> | null {
  const plain = toPlain(value);

  return plain === null ? null : reportRecord(plain);
}

function unique(items: readonly unknown[]): unknown[] {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

export class MasonryPierCapacityCurveComparisonReportBuilder {
  readonly applicationId: string;
  readonly schemaVersion: string;
  readonly metadata: MasonryPierCapacityCurveComparisonReportBuilderMetadata;
  readonly markdownRenderer: MasonryPierCapacityCurveComparisonReportBuilderRenderer;

  constructor({
    applicationId = "masonry-wall-openings",
    schemaVersion = MASONRY_PIER_CAPACITY_CURVE_COMPARISON_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new MasonryPierCapacityCurveComparisonMarkdownRenderer(),
  }: MasonryPierCapacityCurveComparisonReportBuilderOptions = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = { ...metadata };
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    analysisResult,
    metadata = {},
  }: MasonryPierCapacityCurveComparisonReportBuilderBuildInput = {}): MasonryPierCapacityCurveComparisonReportBuilderReport {
    if (!model) {
      throw new Error("MasonryPierCapacityCurveComparisonReportBuilder requires a model.");
    }

    if (!analysisResult) {
      throw new Error(
        "MasonryPierCapacityCurveComparisonReportBuilder requires an analysisResult.",
      );
    }

    const json = this.buildJson({
      model,
      analysisResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    analysisResult,
    metadata = {},
  }: MasonryPierCapacityCurveComparisonReportBuilderBuildJsonInput): MasonryPierCapacityCurveComparisonReportBuilderJson {
    const resultJsonValue =
      typeof analysisResult.toJSON === "function"
        ? analysisResult.toJSON()
        : toPlain(analysisResult);
    const resultJson = resultRecord(resultJsonValue);
    const outputs: MasonryPierCapacityCurveComparisonReportBuilderOutputs =
      resultJson.outputs ?? {};
    const reportId = `${templateString(model.id)}-${templateString(outputs.pier?.id ?? "pier")}-capacity-comparison-report`;

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: reportId,
      title: `Confronto curva di capacita ${templateString(outputs.pier?.id ?? model.id)}`,
      description:
        "Report sintetico di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.",
      units: reportUnits(model.units ?? null),
      model: {
        id: model.id,
        label: model.label ?? model.id,
        wallCount: model.walls?.length ?? 0,
        openingCount: model.openings?.length ?? 0,
      },
      pier: reportRecord(toPlain(outputs.pier ?? {})),
      aggregated: {
        performance: reportRecord(toPlain(outputs.aggregated?.performanceSummary ?? {})),
        capacityCurve: reportRecord(toPlain(outputs.aggregated?.capacityCurve ?? {})),
      },
      fem: {
        performance: reportRecord(toPlain(outputs.fem?.performanceSummary ?? {})),
        capacityCurve: reportRecord(toPlain(outputs.fem?.capacityCurve ?? {})),
        hingeEvents: toPlain(outputs.fem?.hingeEvents ?? []),
        finalState: reportRecord(toPlain(outputs.fem?.finalState ?? {})),
      },
      comparison: reportRecord(toPlain(outputs.comparison ?? {})),
      reading: reportRecord(toPlain(outputs.reading ?? {})),
      warnings: unique(resultJson.warnings ?? []),
      assumptions: unique(resultJson.assumptions ?? []),
      metadata: {
        ...this.metadata,
        ...metadata,
        resultStatus: resultJson.status,
        comparisonType: resultJson.metadata?.comparisonType ?? null,
        generatedBy: "MasonryPierCapacityCurveComparisonReportBuilder",
      },
    };
  }

  renderMarkdown(report: MasonryPierCapacityCurveComparisonReportBuilderJson): string {
    if (typeof this.markdownRenderer === "function") {
      return this.markdownRenderer(report);
    }

    if (typeof this.markdownRenderer?.render === "function") {
      return this.markdownRenderer.render(report);
    }

    throw new Error(
      "MasonryPierCapacityCurveComparisonReportBuilder requires a markdown renderer with a render() method.",
    );
  }
}
