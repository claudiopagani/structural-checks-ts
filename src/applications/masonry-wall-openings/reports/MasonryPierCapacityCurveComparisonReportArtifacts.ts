export interface MasonryPierCapacityCurveComparisonReportJson extends Record<string, unknown> {
  id?: unknown;
  schemaVersion?: unknown;
  title?: unknown;
}

export interface MasonryPierCapacityCurveComparisonReportArtifactInput {
  json?: MasonryPierCapacityCurveComparisonReportJson | null;
  markdown?: unknown;
}

export interface CreateMasonryPierCapacityCurveComparisonReportArtifactsOptions {
  baseName?: unknown;
  includeJson?: boolean;
  includeMarkdown?: boolean;
  jsonSpacing?: number | string;
}

export interface MasonryPierCapacityCurveComparisonReportArtifactMetadata {
  schemaVersion: unknown;
  reportId: unknown;
  title: unknown;
}

export interface MasonryPierCapacityCurveComparisonReportArtifact {
  kind: "masonry-pier-capacity-comparison-report";
  format: "json" | "markdown";
  fileName: string;
  mediaType: "application/json" | "text/markdown";
  content: string;
  metadata: MasonryPierCapacityCurveComparisonReportArtifactMetadata;
}

const sourceStringImplementation: (value: unknown) => string = String;

function sourceString(value: unknown): string {
  return sourceStringImplementation(value);
}

function sanitizeFileToken(value: unknown): string {
  const defaultName = "masonry-pier-capacity-comparison-report";

  return (
    sourceString(value ?? defaultName)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || defaultName
  );
}

function requireMarkdown(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      "createMasonryPierCapacityCurveComparisonReportArtifacts requires report.markdown.",
    );
  }

  return value;
}

export function createMasonryPierCapacityCurveComparisonReportArtifacts(
  report?: MasonryPierCapacityCurveComparisonReportArtifactInput | null,
  {
    baseName = null,
    includeJson = true,
    includeMarkdown = true,
    jsonSpacing = 2,
  }: CreateMasonryPierCapacityCurveComparisonReportArtifactsOptions = {},
): MasonryPierCapacityCurveComparisonReportArtifact[] {
  const markdown = report?.markdown;

  if (!report?.json) {
    throw new Error(
      "createMasonryPierCapacityCurveComparisonReportArtifacts requires report.json.",
    );
  }

  const validatedMarkdown = includeMarkdown ? requireMarkdown(markdown) : null;

  const normalizedBaseName = sanitizeFileToken(baseName ?? report.json.id);
  const artifacts: MasonryPierCapacityCurveComparisonReportArtifact[] = [];

  if (includeJson) {
    artifacts.push({
      kind: "masonry-pier-capacity-comparison-report",
      format: "json",
      fileName: `${normalizedBaseName}.json`,
      mediaType: "application/json",
      content: JSON.stringify(report.json, null, jsonSpacing),
      metadata: {
        schemaVersion: report.json.schemaVersion ?? null,
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  if (includeMarkdown && validatedMarkdown !== null) {
    artifacts.push({
      kind: "masonry-pier-capacity-comparison-report",
      format: "markdown",
      fileName: `${normalizedBaseName}.md`,
      mediaType: "text/markdown",
      content: validatedMarkdown,
      metadata: {
        schemaVersion: report.json.schemaVersion ?? null,
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  return artifacts;
}
