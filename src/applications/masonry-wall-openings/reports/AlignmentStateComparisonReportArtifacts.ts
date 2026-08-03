type ArtifactStringValue = string | number | boolean | bigint | symbol | null | undefined;

export interface AlignmentStateComparisonReportJson extends Record<string, unknown> {
  id?: ArtifactStringValue;
  schemaVersion?: unknown;
  title?: unknown;
}

export interface AlignmentStateComparisonReportArtifactInput {
  json?: AlignmentStateComparisonReportJson | null;
  markdown?: unknown;
}

export interface CreateAlignmentStateComparisonReportArtifactsOptions {
  baseName?: ArtifactStringValue;
  includeJson?: boolean;
  includeMarkdown?: boolean;
  jsonSpacing?: number | string;
}

export interface AlignmentStateComparisonReportArtifactMetadata {
  schemaVersion: unknown;
  reportId: unknown;
  title: unknown;
}

export interface AlignmentStateComparisonReportArtifact {
  kind: "alignment-state-comparison-report";
  format: "json" | "markdown";
  fileName: string;
  mediaType: "application/json" | "text/markdown";
  content: string;
  metadata: AlignmentStateComparisonReportArtifactMetadata;
}

function sanitizeFileToken(value: ArtifactStringValue): string {
  const defaultName = "alignment-state-comparison-report";

  return (
    String(value ?? defaultName)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "alignment-state-comparison-report"
  );
}

export function createAlignmentStateComparisonReportArtifacts(
  report: AlignmentStateComparisonReportArtifactInput,
  {
    baseName = null,
    includeJson = true,
    includeMarkdown = true,
    jsonSpacing = 2,
  }: CreateAlignmentStateComparisonReportArtifactsOptions = {},
): AlignmentStateComparisonReportArtifact[] {
  const markdown = report?.markdown;

  if (!report?.json) {
    throw new Error("createAlignmentStateComparisonReportArtifacts requires report.json.");
  }

  const normalizedBaseName = sanitizeFileToken(baseName ?? report.json.id);
  const artifacts: AlignmentStateComparisonReportArtifact[] = [];

  if (includeJson) {
    artifacts.push({
      kind: "alignment-state-comparison-report",
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

  if (includeMarkdown) {
    if (typeof markdown !== "string") {
      throw new Error("createAlignmentStateComparisonReportArtifacts requires report.markdown.");
    }

    artifacts.push({
      kind: "alignment-state-comparison-report",
      format: "markdown",
      fileName: `${normalizedBaseName}.md`,
      mediaType: "text/markdown",
      content: markdown,
      metadata: {
        schemaVersion: report.json.schemaVersion ?? null,
        reportId: report.json.id,
        title: report.json.title,
      },
    });
  }

  return artifacts;
}
