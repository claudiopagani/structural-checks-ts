interface MasonryPierCapacityCurveComparisonReportUnits extends Record<string, unknown> {
  force?: unknown;
  length?: unknown;
}

interface MasonryPierCapacityCurveComparisonPerformance extends Record<string, unknown> {
  ks?: unknown;
  Vy?: unknown;
  du?: unknown;
  peakBaseShear?: unknown;
  governingMode?: unknown;
  hingeCount?: unknown;
}

interface MasonryPierCapacityCurveComparisonFinalState extends Record<string, unknown> {
  termination?: {
    reason?: unknown;
  } | null;
}

interface MasonryPierCapacityCurveComparisonStage extends Record<string, unknown> {
  performance?: MasonryPierCapacityCurveComparisonPerformance | null;
  finalState?: MasonryPierCapacityCurveComparisonFinalState | null;
}

interface MasonryPierCapacityCurveComparisonPier extends Record<string, unknown> {
  id?: unknown;
  wallId?: unknown;
  topRotation?: unknown;
  governingMode?: unknown;
}

interface MasonryPierCapacityCurveComparisonMetric extends Record<string, unknown> {
  label?: unknown;
  id?: unknown;
  aggregatedValue?: unknown;
  femValue?: unknown;
  delta?: unknown;
  variationPercent?: unknown;
}

interface MasonryPierCapacityCurveComparisonSampledCurvePoint extends Record<string, unknown> {
  displacement?: unknown;
  aggregatedBaseShear?: unknown;
  femBaseShear?: unknown;
  delta?: unknown;
  variationPercent?: unknown;
}

interface MasonryPierCapacityCurveComparisonComparison extends Record<string, unknown> {
  metrics?: readonly MasonryPierCapacityCurveComparisonMetric[] | null;
  sampledCurvePoints?: readonly MasonryPierCapacityCurveComparisonSampledCurvePoint[] | null;
}

interface MasonryPierCapacityCurveComparisonReading extends Record<string, unknown> {
  outcome?: unknown;
  headline?: unknown;
  governingMetricId?: unknown;
  messages?: readonly unknown[] | null;
}

export interface MasonryPierCapacityCurveComparisonReport extends Record<string, unknown> {
  title?: unknown;
  description?: unknown;
  units?: MasonryPierCapacityCurveComparisonReportUnits | null;
  model?: {
    id?: unknown;
    label?: unknown;
  } | null;
  pier?: MasonryPierCapacityCurveComparisonPier | null;
  aggregated?: MasonryPierCapacityCurveComparisonStage | null;
  fem?: MasonryPierCapacityCurveComparisonStage | null;
  comparison?: MasonryPierCapacityCurveComparisonComparison | null;
  reading?: MasonryPierCapacityCurveComparisonReading | null;
  warnings?: readonly unknown[] | null;
  assumptions?: readonly unknown[] | null;
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

function formatNumber(value: unknown, decimals = 4): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value == null ? "-" : sourceString(value);
  }

  return String(Number(value.toFixed(decimals)));
}

function formatPercent(value: unknown, decimals = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  const rounded = Number(value.toFixed(decimals));

  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatText(value: unknown): string {
  if (value == null || value === "") {
    return "-";
  }

  return sourceString(value).replaceAll("|", "\\|");
}

function formatUnits(
  units: MasonryPierCapacityCurveComparisonReportUnits | null | undefined,
): string {
  if (!units) {
    return "-";
  }

  return `${templateString(units.force ?? "-")}, ${templateString(units.length ?? "-")}`;
}

function markdownTable(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  if (!rows.length) {
    return "_Nessun dato disponibile._";
  }

  const header = `| ${headers.map(formatText).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((value) => formatText(value)).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function summaryRows(
  report: MasonryPierCapacityCurveComparisonReport,
): readonly (readonly unknown[])[] {
  const aggregated = report.aggregated?.performance ?? {};
  const fem = report.fem?.performance ?? {};
  const femTermination = report.fem?.finalState?.termination?.reason ?? "-";

  return [
    [
      "Metodo aggregato",
      formatNumber(aggregated.ks),
      formatNumber(aggregated.Vy),
      formatNumber(aggregated.du),
      formatNumber(aggregated.peakBaseShear),
      aggregated.governingMode ?? "-",
      "-",
    ],
    [
      "FEM non lineare",
      formatNumber(fem.ks),
      formatNumber(fem.Vy),
      formatNumber(fem.du),
      formatNumber(fem.peakBaseShear),
      `${templateString(fem.hingeCount ?? 0)} cerniere`,
      femTermination,
    ],
  ];
}

function metricRows(
  report: MasonryPierCapacityCurveComparisonReport,
): readonly (readonly unknown[])[] {
  return (report.comparison?.metrics ?? []).map((metric) => [
    metric.label ?? metric.id,
    formatNumber(metric.aggregatedValue),
    formatNumber(metric.femValue),
    formatNumber(metric.delta),
    formatPercent(metric.variationPercent),
  ]);
}

function sampleRows(
  report: MasonryPierCapacityCurveComparisonReport,
): readonly (readonly unknown[])[] {
  return (report.comparison?.sampledCurvePoints ?? []).map((point) => [
    formatNumber(point.displacement),
    formatNumber(point.aggregatedBaseShear),
    formatNumber(point.femBaseShear),
    formatNumber(point.delta),
    formatPercent(point.variationPercent),
  ]);
}

export class MasonryPierCapacityCurveComparisonMarkdownRenderer {
  render(report: MasonryPierCapacityCurveComparisonReport): string {
    const reading = report.reading ?? {};
    const warnings = report.warnings ?? [];
    const assumptions = report.assumptions ?? [];
    const messages = reading.messages ?? [];
    const warningLines =
      warnings.length > 0
        ? warnings.map((warning) => `* ${templateString(warning)}`).join("\n")
        : "* Nessun warning.";
    const assumptionLines =
      assumptions.length > 0
        ? assumptions.map((assumption) => `* ${templateString(assumption)}`).join("\n")
        : "* Nessuna assunzione aggiuntiva.";
    const readingLines =
      messages.length > 0
        ? messages.map((message) => `* ${templateString(message)}`).join("\n")
        : "* Nessuna lettura sintetica disponibile.";

    return [
      `# ${templateString(report.title)}`,
      "",
      sourceString(
        report.description ??
          "Report di confronto tra curva di capacita aggregata del maschio e pushover FEM non lineare del corrispondente macroelemento.",
      ),
      "",
      "## Modello",
      "",
      `* Allineamento: ${templateString(report.model?.label ?? report.model?.id ?? "-")}`,
      `* ID allineamento: ${templateString(report.model?.id ?? "-")}`,
      `* Unita: ${templateString(formatUnits(report.units))}`,
      `* Maschio: ${templateString(report.pier?.id ?? "-")}`,
      `* Muro: ${templateString(report.pier?.wallId ?? "-")}`,
      `* Vincolo in sommita: ${templateString(report.pier?.topRotation ?? "-")}`,
      `* Meccanismo aggregato governante: ${templateString(report.pier?.governingMode ?? "-")}`,
      "",
      "## Sintesi Curve",
      "",
      markdownTable(
        ["Modello", "ks", "Vy", "du", "Vmax", "Note", "Terminazione"],
        summaryRows(report),
      ),
      "",
      "## Confronto Indicatori",
      "",
      markdownTable(["Indicatore", "Aggregato", "FEM", "Delta", "Delta %"], metricRows(report)),
      "",
      "## Punti Campionati",
      "",
      markdownTable(
        ["Spostamento", "V aggregato", "V FEM", "Delta", "Delta %"],
        sampleRows(report),
      ),
      "",
      "## Lettura",
      "",
      `* Outcome: ${templateString(reading.outcome ?? "-")}`,
      `* Esito sintetico: ${templateString(reading.headline ?? "-")}`,
      `* Indicatore governante: ${templateString(reading.governingMetricId ?? "-")}`,
      "",
      readingLines,
      "",
      "## Warning",
      "",
      warningLines,
      "",
      "## Assunzioni",
      "",
      assumptionLines,
      "",
    ].join("\n");
  }
}
