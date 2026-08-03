type BeamReport = {
  analysis: {
    raw: unknown;
  };
  title: unknown;
  description: unknown;
  id: unknown;
  units: unknown;
  warnings: string[];
  assumptions: string[];
  verification: unknown;
  governing: {
    utilizationRatio: unknown;
    checkId: unknown;
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

function resultEntries(resultMap: unknown = {}): unknown[] {
  return objectEntries(resultMap).map(([, value]) => value);
}

function objectEntries(value: unknown): [string, unknown][] {
  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    return value.split("").map((item, index) => [String(index), item]);
  }

  if (typeof value !== "object" && typeof value !== "function") {
    return [];
  }

  return Object.keys(value).map((key) => [key, Reflect.get(value, key)]);
}

function arrayValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatNumber(value: unknown, decimals = 4): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value == null ? "-" : stringValue(value);
  }

  const rounded = Number(value.toFixed(decimals));

  return stringValue(rounded);
}

function formatText(value: unknown): string {
  if (value == null || value === "") {
    return "-";
  }

  return stringValue(value).replaceAll("|", "\\|");
}

function formatUnits(units: unknown): string {
  if (!units) {
    return "-";
  }

  return `${stringValue(propertyValue(units, "force") ?? "-")}, ${stringValue(
    propertyValue(units, "length") ?? "-",
  )}`;
}

function markdownTable(headers: unknown[], rows: unknown[][]): string {
  if (rows.length === 0) {
    return "_Nessun dato disponibile._";
  }

  const header = `| ${headers.map(formatText).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${row.map((item) => formatText(item)).join(" | ")} |`)
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function stiffnessRow(result: unknown): unknown[] {
  const metadata = propertyValue(propertyValue(result, "sectionProperties"), "metadata") ?? {};

  return [
    propertyValue(result, "id"),
    propertyValue(propertyValue(result, "context"), "limitState") ?? "-",
    propertyValue(propertyValue(result, "context"), "combinationType") ?? "-",
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "axialRigidity")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "flexuralRigidity")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "flexuralRigidityY")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "flexuralRigidityZ")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "shearRigidity")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "shearRigidityY")),
    formatNumber(propertyValue(propertyValue(result, "sectionProperties"), "shearRigidityZ")),
    propertyValue(metadata, "kmod") ??
      propertyValue(metadata, "gamma") ??
      propertyValue(metadata, "gamma1") ??
      "-",
    propertyValue(metadata, "kdef") ?? propertyValue(metadata, "finalStiffness") ?? "-",
  ];
}

function combinationRows(analysisResult: unknown): unknown[][] {
  return resultEntries(propertyValue(analysisResult, "combinations")).map((result) => [
    propertyValue(result, "id"),
    propertyValue(propertyValue(result, "context"), "limitState") ?? "-",
    propertyValue(propertyValue(result, "context"), "combinationType") ?? "-",
    objectEntries(
      propertyValue(result, "factors") ??
        propertyValue(propertyValue(result, "context"), "loadCaseFactors") ??
        {},
    )
      .map(([id, factor]) => `${id}: ${formatNumber(factor, 3)}`)
      .join(", "),
  ]);
}

function loadRows(analysisResult: unknown): unknown[][] {
  const loadsById = new Map<unknown, unknown>();

  for (const result of [
    ...resultEntries(propertyValue(analysisResult, "loadCases")),
    ...resultEntries(propertyValue(analysisResult, "combinations")),
  ]) {
    for (const load of arrayValues(propertyValue(result, "loads"))) {
      const loadId = propertyValue(load, "id");
      if (!loadsById.has(loadId)) {
        loadsById.set(loadId, load);
      }
    }
  }

  return [...loadsById.values()].map((load) => [
    propertyValue(load, "id"),
    propertyValue(load, "loadCaseId"),
    propertyValue(load, "actionType"),
    propertyValue(load, "loadDurationClass") ?? "-",
    formatNumber(propertyValue(load, "factor"), 3),
  ]);
}

function envelopeRow(label: string, item: unknown): unknown[] {
  if (!item) {
    return [label, "-", "-", "-", "-"];
  }

  return [
    label,
    propertyValue(item, "resultId"),
    propertyValue(item, "limitState") ?? "-",
    formatNumber(propertyValue(item, "value")),
    formatNumber(propertyValue(propertyValue(item, "sample"), "station")),
  ];
}

function reactionEnvelopeRow(label: string, item: unknown): unknown[] {
  if (!item) {
    return [label, "-", "-", "-", "-", "-"];
  }

  const sample = propertyValue(item, "sample");

  return [
    label,
    propertyValue(item, "resultId"),
    propertyValue(item, "limitState") ?? "-",
    propertyValue(sample, "supportId") ?? propertyValue(sample, "nodeId") ?? "-",
    formatNumber(propertyValue(item, "value")),
    formatNumber(propertyValue(sample, "station")),
  ];
}

function sectionRotationRows(report: BeamReport): unknown[][] {
  const rotation = propertyValue(report.analysis, "sectionRotation") ?? {};
  const axes = propertyValue(report.analysis, "principalAxes") ?? {};
  const rigidity = propertyValue(report.analysis, "sectionRigidity") ?? {};

  return [
    ["Alpha", formatNumber(propertyValue(rotation, "alpha")), "rad"],
    [
      "Alpha input",
      propertyValue(rotation, "inputAlpha") == null
        ? "-"
        : `${formatNumber(propertyValue(rotation, "inputAlpha"))} ${stringValue(
            propertyValue(rotation, "inputUnits") ?? propertyValue(rotation, "units") ?? "",
          )}`.trim(),
      "-",
    ],
    [
      "Convenzione",
      propertyValue(rotation, "convention") ?? propertyValue(axes, "convention") ?? "-",
      "-",
    ],
    [
      "Asse principale",
      propertyValue(rotation, "primaryAxis") ?? propertyValue(axes, "primaryAxis") ?? "-",
      "-",
    ],
    ["Fonte EI verticale", propertyValue(rigidity, "verticalFlexuralRigiditySource") ?? "-", "-"],
    ["Fonte GA verticale", propertyValue(rigidity, "verticalShearRigiditySource") ?? "-", "-"],
  ];
}

function principalActionEnvelopeRows(report: BeamReport): unknown[][] {
  const envelopes = propertyValue(report.analysis, "principalActionEnvelopes") ?? {};
  const scopes: readonly [string, unknown][] = [
    ["Tutti", propertyValue(envelopes, "all")],
    ["Combinazioni", propertyValue(envelopes, "combinations")],
    ["SLU", propertyValue(envelopes, "uls")],
    ["SLE", propertyValue(envelopes, "sle")],
  ];
  const quantities: readonly [string, string][] = [
    ["MY max assoluto", "maxAbsBendingMomentY"],
    ["MZ max assoluto", "maxAbsBendingMomentZ"],
    ["VY max assoluto", "maxAbsShearForceY"],
    ["VZ max assoluto", "maxAbsShearForceZ"],
  ];

  return scopes.flatMap(([scope, group]) =>
    quantities.map(([label, key]) => {
      const item = propertyValue(group, key);

      return [
        scope,
        label,
        propertyValue(item, "resultId") ?? "-",
        propertyValue(item, "limitState") ?? "-",
        formatNumber(propertyValue(item, "value")),
        formatNumber(propertyValue(item, "station")),
      ];
    }),
  );
}

function verificationRows(verificationResult: unknown): unknown[][] {
  return arrayValues(propertyValue(verificationResult, "checks")).map((check) => [
    propertyValue(check, "id"),
    propertyValue(check, "description") ?? "-",
    formatNumber(propertyValue(check, "demand")),
    formatNumber(propertyValue(check, "capacity")),
    formatNumber(propertyValue(check, "utilizationRatio"), 3),
    propertyValue(check, "ok") === false ? "no" : "si",
  ]);
}

function isReportScalar(value: unknown): boolean {
  return (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  );
}

function verificationDetailRows(verificationResult: unknown): unknown[][] {
  return arrayValues(propertyValue(verificationResult, "checks")).flatMap((check) =>
    objectEntries(propertyValue(check, "metadata") ?? {})
      .filter(([, value]) => isReportScalar(value))
      .map(([key, value]) => [
        propertyValue(check, "id"),
        key,
        typeof value === "number" ? formatNumber(value) : value,
      ]),
  );
}

export class BeamReportMarkdownRenderer {
  render(report: BeamReport): string {
    const analysis = report.analysis;
    const raw = analysis.raw;
    const combinationEntries = resultEntries(propertyValue(raw, "combinations"));
    const loadCaseEntries = resultEntries(propertyValue(raw, "loadCases"));
    const geometry =
      propertyValue(combinationEntries[0], "geometry") ??
      propertyValue(loadCaseEntries[0], "geometry") ??
      null;
    const supportRows =
      propertyValue(combinationEntries[0], "supports") ??
      propertyValue(loadCaseEntries[0], "supports") ??
      [];
    const stiffnessRows = combinationEntries.map(stiffnessRow);
    const rawEnvelopes = propertyValue(raw, "envelopes");
    const envelope =
      propertyValue(rawEnvelopes, "combinations") ?? propertyValue(rawEnvelopes, "all") ?? {};
    const ulsEnvelope = propertyValue(rawEnvelopes, "uls") ?? envelope;
    const sleEnvelope = propertyValue(rawEnvelopes, "sle") ?? envelope;
    const warningLines =
      report.warnings.length > 0
        ? report.warnings.map((warning) => `* ${stringValue(warning)}`).join("\n")
        : "* Nessun warning.";
    const assumptionLines =
      report.assumptions.length > 0
        ? report.assumptions.map((assumption) => `* ${stringValue(assumption)}`).join("\n")
        : "* Nessuna assunzione aggiuntiva.";

    return [
      `# ${stringValue(report.title)}`,
      "",
      stringValue(report.description || "Report di analisi e verifica di trave semplice."),
      "",
      "## Modello",
      "",
      `* ID: ${stringValue(report.id)}`,
      `* Unita: ${formatUnits(report.units)}`,
      `* Modello di analisi: ${stringValue(propertyValue(raw, "analysisModel") ?? "-")}`,
      `* Lunghezza: ${formatNumber(propertyValue(geometry, "length"))} ${stringValue(
        propertyValue(report.units, "length") ?? "",
      )}`.trim(),
      `* Luce orizzontale: ${formatNumber(propertyValue(geometry, "horizontalSpan"))} ${stringValue(
        propertyValue(report.units, "length") ?? "",
      )}`.trim(),
      "",
      "## Assi principali",
      "",
      markdownTable(["Parametro", "Valore", "Unita"], sectionRotationRows(report)),
      "",
      "## Vincoli",
      "",
      markdownTable(
        ["ID", "Nodo", "Stazione", "Tipo", "ux", "uy", "rz"],
        arrayValues(supportRows).map((support) => [
          propertyValue(support, "id"),
          propertyValue(support, "nodeId"),
          formatNumber(propertyValue(support, "station")),
          propertyValue(support, "type") ?? "-",
          propertyValue(propertyValue(support, "restraints"), "ux") ? "si" : "no",
          propertyValue(propertyValue(support, "restraints"), "uy") ? "si" : "no",
          propertyValue(propertyValue(support, "restraints"), "rz") ? "si" : "no",
        ]),
      ),
      "",
      "## Carichi",
      "",
      markdownTable(["ID", "Caso", "Tipo", "Durata", "Fattore"], loadRows(raw)),
      "",
      "## Combinazioni",
      "",
      markdownTable(["ID", "Stato limite", "Tipo", "Fattori"], combinationRows(raw)),
      "",
      "## Rigidezze adottate",
      "",
      markdownTable(
        [
          "ID",
          "SL",
          "Tipo",
          "EA",
          "EI vert.",
          "EI Y",
          "EI Z",
          "GA vert.",
          "GA Y",
          "GA Z",
          "k/gamma",
          "finale/kdef",
        ],
        stiffnessRows,
      ),
      "",
      "## Inviluppi governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Valore", "Stazione"],
        [
          envelopeRow("M max assoluto", propertyValue(ulsEnvelope, "maxAbsBendingMoment")),
          envelopeRow("MY max assoluto", propertyValue(ulsEnvelope, "maxAbsBendingMomentY")),
          envelopeRow("MZ max assoluto", propertyValue(ulsEnvelope, "maxAbsBendingMomentZ")),
          envelopeRow("V max", propertyValue(ulsEnvelope, "maxAbsShearForce")),
          envelopeRow("V min", propertyValue(ulsEnvelope, "minShearForce")),
          envelopeRow("VY max assoluto", propertyValue(ulsEnvelope, "maxAbsShearForceY")),
          envelopeRow("VZ max assoluto", propertyValue(ulsEnvelope, "maxAbsShearForceZ")),
          envelopeRow(
            "Freccia SLE max assoluta",
            propertyValue(sleEnvelope, "maxAbsVerticalDisplacement"),
          ),
        ],
      ),
      "",
      "## Azioni principali",
      "",
      markdownTable(
        ["Dominio", "Grandezza", "Risultato", "SL", "Valore", "Stazione"],
        principalActionEnvelopeRows(report),
      ),
      "",
      "## Reazioni governanti",
      "",
      markdownTable(
        ["Grandezza", "Risultato", "SL", "Supporto", "Valore", "Stazione"],
        [
          reactionEnvelopeRow(
            "Rx max assoluto",
            propertyValue(envelope, "maxAbsHorizontalReaction"),
          ),
          reactionEnvelopeRow("Ry max assoluto", propertyValue(envelope, "maxAbsVerticalReaction")),
          reactionEnvelopeRow(
            "Mrz max assoluto",
            propertyValue(envelope, "maxAbsSupportMomentReaction"),
          ),
        ],
      ),
      "",
      "## Verifiche",
      "",
      markdownTable(
        ["ID", "Descrizione", "Domanda", "Capacita", "Utilizzo", "OK"],
        verificationRows(report.verification),
      ),
      "",
      "## Dettagli verifiche",
      "",
      markdownTable(
        ["Verifica", "Parametro", "Valore"],
        verificationDetailRows(report.verification),
      ),
      "",
      "## Esito",
      "",
      `* Stato: ${stringValue(propertyValue(report.verification, "status") ?? "non verificato")}`,
      `* Utilizzo governante: ${formatNumber(report.governing.utilizationRatio, 3)}`,
      `* Verifica governante: ${stringValue(report.governing.checkId ?? "-")}`,
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
