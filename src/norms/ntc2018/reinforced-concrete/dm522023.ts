// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/reinforced-concrete/dm522023.js.

export interface Dm522023Reference {
  readonly source: string;
  readonly publication?: string;
  readonly provision?: string;
  readonly url: string;
}

export interface Dm522023TemporarySuspension {
  readonly ntc2018Clause: string;
  readonly scope: string;
  readonly suspendedUntil: string;
}

export interface Dm522023Amendments {
  readonly decreeDate: string;
  readonly publicationDate: string;
  readonly effectiveDate: string;
  readonly transitionalDeliveryDeadlineYears: number;
  readonly temporarySuspensions: readonly Dm522023TemporarySuspension[];
  readonly reinforcedConcreteChapter4Overrides: readonly string[];
  readonly reinforcedConcreteChapter7Overrides: readonly string[];
}

export interface Dm522023AmendmentDescription {
  readonly amended: boolean;
  readonly amendment: Dm522023TemporarySuspension | null;
  readonly references: readonly Dm522023Reference[];
}

export const DM522023_REFERENCES: readonly Dm522023Reference[] = Object.freeze([
  Object.freeze({
    source: "D.M. 9 marzo 2023, n. 52",
    publication: "G.U. Serie Generale n. 69 del 22 marzo 2023",
    url: "https://www.gazzettaufficiale.it/eli/id/2023/03/22/23A01847/sg",
  }),
  Object.freeze({
    source: "D.M. 17 gennaio 2018",
    provision: "articolo 2, come modificato dal D.M. 52/2023",
    url: "https://www.gazzettaufficiale.it/eli/id/2018/02/20/18A00716/sg",
  }),
]);

export const DM522023_AMENDMENTS: Dm522023Amendments = Object.freeze({
  decreeDate: "2023-03-09",
  publicationDate: "2023-03-22",
  effectiveDate: "2023-03-23",
  transitionalDeliveryDeadlineYears: 7,
  temporarySuspensions: Object.freeze([
    Object.freeze({
      ntc2018Clause: "11.4.2",
      scope: "entire-clause",
      suspendedUntil: "2025-03-22",
    }),
    Object.freeze({
      ntc2018Clause: "11.5.2",
      scope: "passive-geotechnical-anchors-only",
      suspendedUntil: "2025-03-22",
    }),
  ]),
  reinforcedConcreteChapter4Overrides: Object.freeze([]),
  reinforcedConcreteChapter7Overrides: Object.freeze([]),
});

export function describeDM522023Amendment(ntc2018Clause?: unknown): Dm522023AmendmentDescription {
  // Preserve the source's JavaScript coercion for non-string clause inputs.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- required for source-compatible String coercion
  const clause = String(ntc2018Clause ?? "").trim();
  if (clause.length === 0) {
    throw new Error("ntc2018Clause is required.");
  }

  const amendment =
    DM522023_AMENDMENTS.temporarySuspensions.find((entry) => entry.ntc2018Clause === clause) ??
    null;

  return {
    amended: amendment != null,
    amendment,
    references: DM522023_REFERENCES,
  };
}
