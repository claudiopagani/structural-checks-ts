export const NTC2018_STRUCTURAL_BEHAVIOR = Object.freeze({
  NON_DISSIPATIVE: "non-dissipative",
  CD_A: "cd-a",
  CD_B: "cd-b",
});

export interface Ntc2018OverstrengthFactors {
  beamShear: number;
  columnBending: number;
  columnShear: number;
  jointShear: number;
  wallShear: number | null;
}

export const NTC2018_OVERSTRENGTH_FACTORS = Object.freeze({
  "cd-a": Object.freeze({
    beamShear: 1.2,
    columnBending: 1.3,
    columnShear: 1.3,
    jointShear: 1.2,
    wallShear: 1.2,
  }),
  "cd-b": Object.freeze({
    beamShear: 1.1,
    columnBending: 1.3,
    columnShear: 1.1,
    jointShear: 1.1,
    wallShear: null,
  }),
});

type Ntc2018StructuralBehavior =
  (typeof NTC2018_STRUCTURAL_BEHAVIOR)[keyof typeof NTC2018_STRUCTURAL_BEHAVIOR];

const VALID_BEHAVIORS = new Set<string>(Object.values(NTC2018_STRUCTURAL_BEHAVIOR));

export function normalizeNTC2018StructuralBehavior(
  value: string | null | undefined,
): Ntc2018StructuralBehavior {
  const raw = String(value ?? "").trim();
  const key = raw
    .replaceAll("\u201C", "")
    .replaceAll("\u201D", "")
    .replaceAll("\u2018", "")
    .replaceAll("\u2019", "")
    .replaceAll('"', "")
    .replaceAll("'", "")
    .replaceAll("-", "")
    .replaceAll(/\s/g, "")
    .toLowerCase();

  for (const candidate of VALID_BEHAVIORS) {
    if (candidate.replaceAll("-", "").toLowerCase() === key) {
      return candidate as Ntc2018StructuralBehavior;
    }
  }

  throw new Error(
    `structuralBehavior must be one of [${[...VALID_BEHAVIORS].join(", ")}]; got "${raw}".`,
  );
}

export function selectNTC2018OverstrengthFactors({
  behavior,
}: {
  behavior: string | null | undefined;
}): Readonly<Ntc2018OverstrengthFactors> {
  const normalized = normalizeNTC2018StructuralBehavior(behavior);
  if (normalized === NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE) {
    return Object.freeze({
      beamShear: 1,
      columnBending: 1,
      columnShear: 1,
      jointShear: 1,
      wallShear: 1,
    });
  }
  return NTC2018_OVERSTRENGTH_FACTORS[normalized];
}
