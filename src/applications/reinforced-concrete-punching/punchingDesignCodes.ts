export const RC_PUNCHING_DESIGN_CODE_IDS = Object.freeze({
  EN_1992_1_1_2004: "EN1992_1_1_2004_A1_2014",
  EN_1992_1_1_2023: "EN1992_1_1_2023",
});

export type RcPunchingDesignCodeId =
  (typeof RC_PUNCHING_DESIGN_CODE_IDS)[keyof typeof RC_PUNCHING_DESIGN_CODE_IDS];

export interface RcPunchingDesignCodeManifest {
  id: RcPunchingDesignCodeId;
  family: "EN1992";
  standard: "EN 1992-1-1";
  edition: "2004" | "2023";
  amendments: readonly string[];
  title: string;
  punchingReference: string;
}

const DESIGN_CODE_MANIFESTS: Readonly<
  Record<RcPunchingDesignCodeId, Readonly<RcPunchingDesignCodeManifest>>
> = Object.freeze({
  [RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004]: Object.freeze({
    id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
    family: "EN1992",
    standard: "EN 1992-1-1",
    edition: "2004",
    amendments: Object.freeze(["AC:2010", "A1:2014"]),
    title: "Eurocode 2 - Design of concrete structures - First generation",
    punchingReference: "6.4",
  }),
  [RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023]: Object.freeze({
    id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
    family: "EN1992",
    standard: "EN 1992-1-1",
    edition: "2023",
    amendments: Object.freeze([]),
    title: "Eurocode 2 - Design of concrete structures - Second generation",
    punchingReference: "8.4",
  }),
});

export const RC_PUNCHING_DESIGN_CODE_ID_VALUES = Object.freeze(
  Object.values(RC_PUNCHING_DESIGN_CODE_IDS),
);

export function getRcPunchingDesignCodeManifest(
  codeId: string | null | undefined,
): RcPunchingDesignCodeManifest {
  const manifest = DESIGN_CODE_MANIFESTS[codeId as RcPunchingDesignCodeId] ?? null;
  if (!manifest) {
    throw new Error(`Unsupported RC punching design code: ${String(codeId)}.`);
  }
  return { ...manifest, amendments: [...manifest.amendments] };
}
