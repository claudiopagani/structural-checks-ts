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

export interface UnitConversion {
  (value: number): number;
  (value: null): null;
  (value: undefined): undefined;
  (value: number | null): number | null;
  (value: number | null | undefined): number | null | undefined;
}

export interface UnitResolver {
  unitSystem: UnitSystem;
  sourceUnitSystem: UnitSystem | null;
  targetUnitSystem: UnitSystem;
  convert: (value: number, exponents?: UnitExponents) => number;
  length: UnitConversion;
  area: UnitConversion;
  volume: UnitConversion;
  force: UnitConversion;
  moment: UnitConversion;
  lineLoad: UnitConversion;
  areaLoad: UnitConversion;
  volumeLoad: UnitConversion;
  stress: UnitConversion;
  translationalStiffness: UnitConversion;
  rotationalStiffness: UnitConversion;
  inertia: UnitConversion;
  sectionModulus: UnitConversion;
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
    const identity =
      (): UnitConversion =>
      <TValue extends number | null | undefined>(value: TValue): TValue =>
        value;

    return {
      unitSystem: target,
      sourceUnitSystem: null,
      targetUnitSystem: target,
      convert: (value) => value,
      length: identity(),
      area: identity(),
      volume: identity(),
      force: identity(),
      moment: identity(),
      lineLoad: identity(),
      areaLoad: identity(),
      volumeLoad: identity(),
      stress: identity(),
      translationalStiffness: identity(),
      rotationalStiffness: identity(),
      inertia: identity(),
      sectionModulus: identity(),
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

  const conversion = (exponents: UnitExponents): UnitConversion =>
    ((value: number | null | undefined): number | null | undefined =>
      value == null ? value : convert(value, exponents)) as UnitConversion;

  return {
    unitSystem: source,
    sourceUnitSystem: source,
    targetUnitSystem: target,
    convert,
    length: conversion({ lengthExponent: 1 }),
    area: conversion({ lengthExponent: 2 }),
    volume: conversion({ lengthExponent: 3 }),
    force: conversion({ forceExponent: 1 }),
    moment: conversion({ forceExponent: 1, lengthExponent: 1 }),
    lineLoad: conversion({ forceExponent: 1, lengthExponent: -1 }),
    areaLoad: conversion({ forceExponent: 1, lengthExponent: -2 }),
    volumeLoad: conversion({ forceExponent: 1, lengthExponent: -3 }),
    stress: conversion({ forceExponent: 1, lengthExponent: -2 }),
    translationalStiffness: conversion({ forceExponent: 1, lengthExponent: -1 }),
    rotationalStiffness: conversion({ forceExponent: 1, lengthExponent: 1 }),
    inertia: conversion({ lengthExponent: 4 }),
    sectionModulus: conversion({ lengthExponent: 3 }),
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
