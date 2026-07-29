export const FORCE_UNIT_FACTORS = Object.freeze({
  N: 1,
  kN: 1e3,
  MN: 1e6,
});

export const LENGTH_UNIT_FACTORS = Object.freeze({
  m: 1,
  dm: 1e-1,
  cm: 1e-2,
  mm: 1e-3,
});

export type ForceUnit = keyof typeof FORCE_UNIT_FACTORS;
export type LengthUnit = keyof typeof LENGTH_UNIT_FACTORS;

export interface UnitSystem {
  force: ForceUnit;
  length: LengthUnit;
}

export interface UnitSystemInput {
  force?: ForceUnit;
  length?: LengthUnit;
}

export interface UnitExponents {
  forceExponent?: number;
  lengthExponent?: number;
}

export interface UnitResolver {
  unitSystem: UnitSystem;
  sourceUnitSystem: UnitSystem | null;
  targetUnitSystem: UnitSystem;
  convert: (value: number, exponents?: UnitExponents) => number;
  length: (value: number) => number;
  area: (value: number) => number;
  volume: (value: number) => number;
  force: (value: number) => number;
  moment: (value: number) => number;
  lineLoad: (value: number) => number;
  areaLoad: (value: number) => number;
  volumeLoad: (value: number) => number;
  stress: (value: number) => number;
  translationalStiffness: (value: number) => number;
  rotationalStiffness: (value: number) => number;
  inertia: (value: number) => number;
  sectionModulus: (value: number) => number;
}

const DEFAULT_TARGET_UNIT_SYSTEM = Object.freeze({
  force: "N",
  length: "m",
}) satisfies Readonly<UnitSystem>;

export function assertExplicitUnitSystem(
  units: UnitSystemInput | null | undefined,
  context = "This constructor",
): UnitSystem {
  if (units == null) {
    throw new Error(`${context} requires explicit units: { force, length }.`);
  }

  return normalizeUnitSystem(units);
}

function assertSupportedUnit<TUnit extends string>(
  label: string,
  value: string | undefined,
  supported: Readonly<Record<TUnit, number>>,
): asserts value is TUnit | undefined {
  if (value == null) {
    return;
  }

  if (!Object.hasOwn(supported, value)) {
    throw new Error(`Unsupported ${label} unit: ${value}.`);
  }
}

export function normalizeUnitSystem(units: null | undefined, defaultUnits?: UnitSystemInput): null;
export function normalizeUnitSystem(
  units: UnitSystemInput,
  defaultUnits?: UnitSystemInput,
): UnitSystem;
export function normalizeUnitSystem(
  units: UnitSystemInput | null | undefined,
  defaultUnits?: UnitSystemInput,
): UnitSystem | null;
export function normalizeUnitSystem(
  units: UnitSystemInput | null | undefined,
  defaultUnits: UnitSystemInput = DEFAULT_TARGET_UNIT_SYSTEM,
): UnitSystem | null {
  if (units == null) {
    return null;
  }

  const normalized = {
    force: units.force ?? defaultUnits.force,
    length: units.length ?? defaultUnits.length,
  };

  assertSupportedUnit("force", normalized.force, FORCE_UNIT_FACTORS);
  assertSupportedUnit("length", normalized.length, LENGTH_UNIT_FACTORS);

  return normalized as UnitSystem;
}

export function createUnitResolver(
  units: UnitSystemInput | null | undefined,
  targetUnits: UnitSystemInput = DEFAULT_TARGET_UNIT_SYSTEM,
): UnitResolver {
  const source = normalizeUnitSystem(units, targetUnits);
  const target = normalizeUnitSystem(targetUnits, DEFAULT_TARGET_UNIT_SYSTEM);

  if (source == null) {
    return {
      unitSystem: target,
      sourceUnitSystem: null,
      targetUnitSystem: target,
      convert: (value) => value,
      length: (value) => value,
      area: (value) => value,
      volume: (value) => value,
      force: (value) => value,
      moment: (value) => value,
      lineLoad: (value) => value,
      areaLoad: (value) => value,
      volumeLoad: (value) => value,
      stress: (value) => value,
      translationalStiffness: (value) => value,
      rotationalStiffness: (value) => value,
      inertia: (value) => value,
      sectionModulus: (value) => value,
    };
  }

  const convert = (
    value: number,
    { forceExponent = 0, lengthExponent = 0 }: UnitExponents = {},
  ): number => {
    if (!Number.isFinite(value)) {
      return value;
    }

    const sourceFactor =
      FORCE_UNIT_FACTORS[source.force] ** forceExponent *
      LENGTH_UNIT_FACTORS[source.length] ** lengthExponent;
    const targetFactor =
      FORCE_UNIT_FACTORS[target.force] ** forceExponent *
      LENGTH_UNIT_FACTORS[target.length] ** lengthExponent;

    return value * (sourceFactor / targetFactor);
  };

  return {
    unitSystem: source,
    sourceUnitSystem: source,
    targetUnitSystem: target,
    convert,
    length: (value) => convert(value, { lengthExponent: 1 }),
    area: (value) => convert(value, { lengthExponent: 2 }),
    volume: (value) => convert(value, { lengthExponent: 3 }),
    force: (value) => convert(value, { forceExponent: 1 }),
    moment: (value) => convert(value, { forceExponent: 1, lengthExponent: 1 }),
    lineLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -1 }),
    areaLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -2 }),
    volumeLoad: (value) => convert(value, { forceExponent: 1, lengthExponent: -3 }),
    stress: (value) => convert(value, { forceExponent: 1, lengthExponent: -2 }),
    translationalStiffness: (value) => convert(value, { forceExponent: 1, lengthExponent: -1 }),
    rotationalStiffness: (value) => convert(value, { forceExponent: 1, lengthExponent: 1 }),
    inertia: (value) => convert(value, { lengthExponent: 4 }),
    sectionModulus: (value) => convert(value, { lengthExponent: 3 }),
  };
}

export function convertPointCoordinates<TPoint extends Record<string, unknown>>(
  point: TPoint | null | undefined,
  resolver: UnitResolver,
  coordinateKeys: readonly string[] = ["x", "y", "z"],
): TPoint | null | undefined {
  if (!point) {
    return point;
  }

  return coordinateKeys.reduce<TPoint>(
    (accumulator, key) => {
      const value = point[key];
      accumulator[key as keyof TPoint] = (
        Number.isFinite(value) ? resolver.length(value as number) : value
      ) as TPoint[keyof TPoint];
      return accumulator;
    },
    { ...point },
  );
}

export type UnitPropertyConverters = Readonly<Record<string, (value: unknown) => unknown>>;

export function convertUnitProperties(
  source: Record<string, unknown> | null | undefined = {},
  converters: UnitPropertyConverters = {},
): Record<string, unknown> {
  const payload = source ?? {};
  const converted: Record<string, unknown> = {};

  for (const [key, converter] of Object.entries(converters)) {
    converted[key] = converter(payload[key]);
  }

  return {
    ...payload,
    ...converted,
  };
}
