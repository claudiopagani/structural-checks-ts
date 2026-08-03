import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";

type JsonRecord = Record<string, unknown>;
type MaterialQuantity = string;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isNoArgumentFunction(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function isAliasFunction(value: unknown): value is (alias: string) => unknown {
  return typeof value === "function";
}

function compatibilityString(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return Object.prototype.toString.call(value);
  }

  return String(value);
}

function unitSystemInput(value: unknown): UnitSystemInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: UnitSystemInput = {};
  const force = value.force;
  const length = value.length;

  if (force !== undefined) {
    if (force !== "N" && force !== "kN" && force !== "MN") {
      throw new Error(`Unsupported force unit: ${compatibilityString(force)}.`);
    }
    result.force = force;
  }

  if (length !== undefined) {
    if (length !== "m" && length !== "dm" && length !== "cm" && length !== "mm") {
      throw new Error(`Unsupported length unit: ${compatibilityString(length)}.`);
    }
    result.length = length;
  }

  return result;
}

function firstFinite(values: readonly unknown[] = []): number | null {
  return (
    values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ??
    null
  );
}

function resolveMaterialUnitSystem(material: unknown): UnitSystemInput | null {
  return unitSystemInput(read(material, "units") ?? read(read(material, "metadata"), "unitSystem"));
}

function convertValueToTargetUnits(
  value: number,
  quantity: MaterialQuantity,
  material: unknown,
  targetUnits: UnitSystemInput | null,
): number {
  if (!Number.isFinite(value) || !targetUnits) {
    return value;
  }

  const resolver = createUnitResolver(resolveMaterialUnitSystem(material), targetUnits);

  if (quantity === "volumeLoad") {
    return resolver.volumeLoad(value);
  }

  if (quantity === "length") {
    return resolver.length(value);
  }

  return resolver.stress(value);
}

export interface ResolveMasonryMaterialPropertyInput {
  material?: unknown;
  aliases?: readonly string[];
  targetUnits?: UnitSystemInput | null;
  quantity?: MaterialQuantity;
}

export function resolveMasonryMaterialProperty({
  material,
  aliases = [],
  targetUnits = null,
  quantity = "stress",
}: ResolveMasonryMaterialPropertyInput = {}): number | null {
  if (!material) {
    return null;
  }

  const adjustedPropertiesValue = read(material, "adjustedProperties");
  const adjustedProperties = isNoArgumentFunction(adjustedPropertiesValue)
    ? adjustedPropertiesValue()
    : adjustedPropertiesValue;
  const sources = [
    read(material, "improvedMechanicalProperties"),
    adjustedProperties,
    read(material, "stateOfFactProperties"),
    read(material, "originalMechanicalProperties"),
    read(material, "baseProperties"),
    read(material, "properties"),
    material,
  ].filter(Boolean);

  for (const source of sources) {
    const value = firstFinite(aliases.map((alias) => read(source, alias)));

    if (value !== null) {
      return convertValueToTargetUnits(value, quantity, material, targetUnits);
    }
  }

  const adjustedProperty = read(material, "adjustedProperty");
  if (isAliasFunction(adjustedProperty)) {
    const value = firstFinite(aliases.map((alias) => adjustedProperty(alias)));

    if (value !== null) {
      return convertValueToTargetUnits(value, quantity, material, targetUnits);
    }
  }

  return null;
}

export interface ResolveMasonryUnitWeightInput {
  material?: unknown;
  targetUnits?: UnitSystemInput | null;
}

export function resolveMasonryUnitWeight({
  material,
  targetUnits = null,
}: ResolveMasonryUnitWeightInput = {}): number | null {
  return resolveMasonryMaterialProperty({
    material,
    aliases: ["w", "density"],
    targetUnits,
    quantity: "volumeLoad",
  });
}
