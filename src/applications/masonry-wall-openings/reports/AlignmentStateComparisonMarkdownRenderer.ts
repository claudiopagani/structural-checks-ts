export type AlignmentStateComparisonReportValue = unknown;

export interface AlignmentStateComparisonReportUnits extends Record<string, unknown> {
  force?: AlignmentStateComparisonReportValue;
  length?: AlignmentStateComparisonReportValue;
}

export interface AlignmentStateComparisonReportCriteria extends Record<string, unknown> {
  stiffnessTolerancePercent?: AlignmentStateComparisonReportValue;
}

export interface AlignmentStateComparisonReportCriterion extends Record<string, unknown> {
  type?: AlignmentStateComparisonReportValue;
  toleranceRatio?: unknown;
}

export interface AlignmentStateComparisonReportCheck extends Record<string, unknown> {
  id?: AlignmentStateComparisonReportValue;
  description?: AlignmentStateComparisonReportValue;
  stateOfFactValue?: AlignmentStateComparisonReportValue;
  designValue?: AlignmentStateComparisonReportValue;
  delta?: AlignmentStateComparisonReportValue;
  variationPercent?: AlignmentStateComparisonReportValue;
  criterion?: AlignmentStateComparisonReportCriterion | null;
  ok?: AlignmentStateComparisonReportValue;
}

export interface AlignmentStateComparisonReportStageSummary extends Record<string, unknown> {
  status?: AlignmentStateComparisonReportValue;
  ks?: AlignmentStateComparisonReportValue;
  Vy?: AlignmentStateComparisonReportValue;
  du?: AlignmentStateComparisonReportValue;
  maxBaseShear?: AlignmentStateComparisonReportValue;
  pierCount?: AlignmentStateComparisonReportValue;
  ringFrameCount?: AlignmentStateComparisonReportValue;
}

export interface AlignmentStateComparisonReportComparison extends Record<string, unknown> {
  criteria?: AlignmentStateComparisonReportCriteria | null;
  checks?: readonly AlignmentStateComparisonReportCheck[] | null;
  stageSummaries?: {
    stateOfFact?: AlignmentStateComparisonReportStageSummary | null;
    design?: AlignmentStateComparisonReportStageSummary | null;
  } | null;
  overall?: unknown;
}

export interface AlignmentStateComparisonReportReading extends Record<string, unknown> {
  headline?: AlignmentStateComparisonReportValue;
  outcome?: AlignmentStateComparisonReportValue;
  governingCheckId?: AlignmentStateComparisonReportValue;
  messages?: readonly AlignmentStateComparisonReportValue[] | null;
}

export interface AlignmentStateComparisonReportModel extends Record<string, unknown> {
  id?: AlignmentStateComparisonReportValue;
  label?: AlignmentStateComparisonReportValue;
  wallCount?: AlignmentStateComparisonReportValue;
  openingCount?: AlignmentStateComparisonReportValue;
  totalLength?: AlignmentStateComparisonReportValue;
  maxHeight?: AlignmentStateComparisonReportValue;
  settings?: {
    [key: string]: unknown;
    normativePreset?: AlignmentStateComparisonReportValue;
  } | null;
}

export interface AlignmentStateComparisonReport {
  title?: AlignmentStateComparisonReportValue;
  description?: AlignmentStateComparisonReportValue;
  units?: AlignmentStateComparisonReportUnits | null;
  model?: AlignmentStateComparisonReportModel | null;
  comparison?: AlignmentStateComparisonReportComparison | null;
  reading?: AlignmentStateComparisonReportReading | null;
  warnings?: readonly AlignmentStateComparisonReportValue[] | null;
  assumptions?: readonly AlignmentStateComparisonReportValue[] | null;
}

const sourceStringImplementation: (value: unknown) => string = String;
const numberImplementation: (value: unknown) => number = Number;

function sourceString(value: unknown): string {
  return sourceStringImplementation(value);
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

function formatUnits(units: AlignmentStateComparisonReportUnits | null | undefined): string {
  if (!units) {
    return "-";
  }

  return `${sourceString(units.force ?? "-")}, ${sourceString(units.length ?? "-")}`;
}

function multiplyByHundred(value: unknown): number {
  return numberImplementation(value) * 100;
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

function criteriaRows(
  report: AlignmentStateComparisonReport,
): readonly (readonly AlignmentStateComparisonReportValue[])[] {
  const criteria = report.comparison?.criteria ?? {};
  const checks = report.comparison?.checks ?? [];

  return [
    [
      "Rigidezza ks",
      `variazione entro +/-${formatNumber(criteria.stiffnessTolerancePercent, 2)}%`,
      checks.find((check) => check.id === "stiffness-variation")?.ok ? "si" : "no",
    ],
    [
      "Resistenza Vy",
      "il progetto non deve ridurre Vy",
      checks.find((check) => check.id === "strength-non-decreasing")?.ok ? "si" : "no",
    ],
    [
      "Deformabilita du",
      "il progetto non deve ridurre du",
      checks.find((check) => check.id === "deformability-non-decreasing")?.ok ? "si" : "no",
    ],
  ];
}

function stageRows(
  report: AlignmentStateComparisonReport,
): readonly (readonly AlignmentStateComparisonReportValue[])[] {
  const stateOfFact = report.comparison?.stageSummaries?.stateOfFact ?? {};
  const design = report.comparison?.stageSummaries?.design ?? {};

  return [
    [
      "Stato di fatto",
      stateOfFact.status ?? "-",
      formatNumber(stateOfFact.ks),
      formatNumber(stateOfFact.Vy),
      formatNumber(stateOfFact.du),
      formatNumber(stateOfFact.maxBaseShear),
      stateOfFact.pierCount ?? "-",
      stateOfFact.ringFrameCount ?? "-",
    ],
    [
      "Progetto",
      design.status ?? "-",
      formatNumber(design.ks),
      formatNumber(design.Vy),
      formatNumber(design.du),
      formatNumber(design.maxBaseShear),
      design.pierCount ?? "-",
      design.ringFrameCount ?? "-",
    ],
  ];
}

function checkRows(
  report: AlignmentStateComparisonReport,
): readonly (readonly AlignmentStateComparisonReportValue[])[] {
  return (report.comparison?.checks ?? []).map((check) => [
    check.id,
    check.description,
    formatNumber(check.stateOfFactValue),
    formatNumber(check.designValue),
    formatNumber(check.delta),
    formatPercent(check.variationPercent),
    check.criterion?.type === "variation-band"
      ? `+/-${formatNumber(multiplyByHundred(check.criterion?.toleranceRatio ?? 0), 2)}%`
      : ">= stato di fatto",
    check.ok ? "si" : "no",
  ]);
}

export class AlignmentStateComparisonMarkdownRenderer {
  render(report: AlignmentStateComparisonReport): string {
    const reading = report.reading ?? {};
    const warnings = report.warnings ?? [];
    const assumptions = report.assumptions ?? [];
    const messages = reading.messages ?? [];
    const warningLines =
      warnings.length > 0
        ? warnings.map((warning) => `* ${sourceString(warning)}`).join("\n")
        : "* Nessun warning.";
    const assumptionLines =
      assumptions.length > 0
        ? assumptions.map((assumption) => `* ${sourceString(assumption)}`).join("\n")
        : "* Nessuna assunzione aggiuntiva.";
    const readingLines =
      messages.length > 0
        ? messages.map((message) => `* ${sourceString(message)}`).join("\n")
        : "* Nessuna lettura sintetica disponibile.";

    return [
      `# ${sourceString(report.title)}`,
      "",
      sourceString(
        report.description ??
          "Report di confronto ante/post sull'analisi sismica aggregata dell'allineamento murario.",
      ),
      "",
      "## Modello",
      "",
      `* ID: ${sourceString(report.model?.id ?? "-")}`,
      `* Etichetta: ${sourceString(report.model?.label ?? "-")}`,
      `* Unita: ${formatUnits(report.units)}`,
      `* Muri: ${sourceString(report.model?.wallCount ?? "-")}`,
      `* Aperture: ${sourceString(report.model?.openingCount ?? "-")}`,
      `* Lunghezza totale: ${formatNumber(report.model?.totalLength)} ${sourceString(report.units?.length ?? "")}`.trim(),
      `* Altezza massima: ${formatNumber(report.model?.maxHeight)} ${sourceString(report.units?.length ?? "")}`.trim(),
      `* Preset normativo: ${sourceString(report.model?.settings?.normativePreset ?? "-")}`,
      "",
      "## Criteri di Accettazione",
      "",
      markdownTable(["Grandezza", "Regola", "OK"], criteriaRows(report)),
      "",
      "## Sintesi Stati",
      "",
      markdownTable(
        ["Stato", "Esito", "ks", "Vy", "du", "Vmax", "Maschi", "Cerchiature"],
        stageRows(report),
      ),
      "",
      "## Confronto",
      "",
      markdownTable(
        [
          "Grandezza",
          "Descrizione",
          "Stato di fatto",
          "Progetto",
          "Delta",
          "Delta %",
          "Regola",
          "OK",
        ],
        checkRows(report),
      ),
      "",
      "## Lettura del Confronto",
      "",
      `* Esito sintetico: ${sourceString(reading.headline ?? "-")}`,
      `* Outcome: ${sourceString(reading.outcome ?? "-")}`,
      `* Criterio governante: ${sourceString(reading.governingCheckId ?? "-")}`,
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
