type BeamReportArtifactOptions = {
  baseName?: unknown;
  includeJson?: unknown;
  includeMarkdown?: unknown;
  jsonSpacing?: number | string;
};

type BeamReportArtifact = {
  kind: "beam-report";
  format: "json" | "markdown";
  fileName: string;
  mediaType: string;
  content: string | undefined;
  metadata: {
    schemaVersion: unknown;
    reportId: unknown;
    title: unknown;
  };
};

function propertyValue(value: unknown, key: string): unknown {
  return value == null ? undefined : Reflect.get(Object(value), key);
}

function stringValue(value: unknown): string {
  const stringified: unknown = Reflect.apply(String, undefined, [value]);
  if (typeof stringified !== "string") {
    throw new Error("String conversion did not return a string.");
  }
  return stringified;
}

function sanitizeFileToken(value: unknown): string {
  return (
    stringValue(value ?? "beam-report")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "beam-report"
  );
}

function createArtifactMetadata(reportJson: unknown): BeamReportArtifact["metadata"] {
  return {
    schemaVersion: propertyValue(reportJson, "schemaVersion") ?? null,
    reportId: propertyValue(reportJson, "id"),
    title: propertyValue(reportJson, "title"),
  };
}

export function createBeamReportArtifacts(
  report: unknown,
  {
    baseName = null,
    includeJson = true,
    includeMarkdown = true,
    jsonSpacing = 2,
  }: BeamReportArtifactOptions = {},
): BeamReportArtifact[] {
  const reportJson = propertyValue(report, "json");
  const reportMarkdown = propertyValue(report, "markdown");

  if (!reportJson) {
    throw new Error("createBeamReportArtifacts requires report.json.");
  }

  if (includeMarkdown && typeof reportMarkdown !== "string") {
    throw new Error("createBeamReportArtifacts requires report.markdown.");
  }

  const normalizedBaseName = sanitizeFileToken(baseName ?? propertyValue(reportJson, "id"));
  const artifacts: BeamReportArtifact[] = [];

  if (includeJson) {
    artifacts.push({
      kind: "beam-report",
      format: "json",
      fileName: `${normalizedBaseName}.json`,
      mediaType: "application/json",
      content: JSON.stringify(reportJson, null, jsonSpacing),
      metadata: createArtifactMetadata(reportJson),
    });
  }

  if (includeMarkdown) {
    if (typeof reportMarkdown !== "string") {
      throw new Error("createBeamReportArtifacts requires report.markdown.");
    }

    artifacts.push({
      kind: "beam-report",
      format: "markdown",
      fileName: `${normalizedBaseName}.md`,
      mediaType: "text/markdown",
      content: reportMarkdown,
      metadata: createArtifactMetadata(reportJson),
    });
  }

  return artifacts;
}
