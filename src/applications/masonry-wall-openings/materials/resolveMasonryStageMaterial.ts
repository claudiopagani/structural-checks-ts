import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";

const STRENGTH_KEYS: readonly string[] = ["fm", "tau0", "fv0"];
const STIFFNESS_KEYS: readonly string[] = ["E", "G", "elasticModulus", "shearModulus"];
type JsonRecord = Record<string, unknown>;

export interface MasonryStageMaterialSettings extends JsonRecord {
  useCorrectiveModifiers?: boolean;
  divideByConfidenceFactor?: boolean;
  strengthSelection?: string;
  stiffnessSelection?: string;
  stiffnessState?: string;
}

export interface ResolveMasonryStageMaterialInput {
  material?: unknown;
  stage?: string;
  settings?: MasonryStageMaterialSettings;
  override?: unknown;
  targetUnits?: UnitSystemInput | null;
  contextId?: string | null;
}

export interface MasonryStageMaterialResolution {
  material: JsonRecord | null;
  resolvedProperties: JsonRecord | null;
  warnings: string[];
  assumptions: string[];
  metadata: JsonRecord;
}

interface PropertySourceSelection {
  sourceKey: string;
  properties: JsonRecord;
  fallback: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readNested(value: unknown, ...keys: readonly string[]): unknown {
  return keys.reduce<unknown>((current, key) => read(current, key), value);
}

function isNoArgumentFunction(value: unknown): value is () => unknown {
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

function firstObject(values: readonly unknown[] = []): JsonRecord | null {
  return (
    values.find(
      (value): value is JsonRecord =>
        value !== null && typeof value === "object" && !Array.isArray(value),
    ) ?? null
  );
}

function pickMechanicalProperties(source: unknown = {}): JsonRecord {
  if (!isRecord(source)) {
    return {};
  }

  const values: JsonRecord = {
    fm: source.fm,
    tau0: source.tau0,
    fv0: source.fv0,
    E: source.E ?? source.elasticModulus,
    G: source.G ?? source.shearModulus,
    density: source.density ?? source.w,
    w: source.w ?? source.density,
    mu: source.mu,
    phi: source.phi,
    elasticModulus: source.elasticModulus ?? source.E,
    shearModulus: source.shearModulus ?? source.G,
    poissonRatio: source.poissonRatio,
  };

  return Object.fromEntries(Object.entries(values).filter(([, value]) => value != null));
}

function materialUnitSystem(material: unknown): UnitSystemInput | null {
  return unitSystemInput(read(material, "units") ?? readNested(material, "metadata", "unitSystem"));
}

function convertPropertiesToTargetUnits(
  properties: JsonRecord,
  material: unknown,
  targetUnits: UnitSystemInput | null,
): JsonRecord {
  if (!targetUnits) {
    return { ...properties };
  }

  const resolver = createUnitResolver(materialUnitSystem(material), targetUnits);

  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return [key, value];
      }

      if (key === "density" || key === "w") {
        return [key, resolver.volumeLoad(value)];
      }

      if (STRENGTH_KEYS.includes(key) || STIFFNESS_KEYS.includes(key)) {
        return [key, resolver.stress(value)];
      }

      return [key, value];
    }),
  );
}

function stageKeyCandidates(stage: string): string[] {
  return stage === "state-of-fact"
    ? ["state-of-fact", "stateOfFact", "state_of_fact", "ante-operam", "anteOperam"]
    : ["design", "post-operam", "postOperam", "improved"];
}

function resolveVariantOverrides(
  material: unknown,
  stage: string,
  settings: MasonryStageMaterialSettings = {},
): JsonRecord | null {
  const stageVariants = firstObject([
    readNested(material, "stageSelectionVariants", stage),
    readNested(material, "selectionVariants", stage),
    read(material, "selectionVariants"),
  ]);

  if (!stageVariants) {
    return null;
  }

  return {
    ...(firstObject([
      readNested(stageVariants, "strength", settings.strengthSelection ?? ""),
      readNested(stageVariants, "strengthSelection", settings.strengthSelection ?? ""),
    ]) ?? {}),
    ...(firstObject([
      readNested(stageVariants, "stiffness", settings.stiffnessSelection ?? ""),
      readNested(stageVariants, "stiffnessSelection", settings.stiffnessSelection ?? ""),
    ]) ?? {}),
    ...(firstObject([
      readNested(stageVariants, "stiffnessState", settings.stiffnessState ?? ""),
      readNested(stageVariants, "state", settings.stiffnessState ?? ""),
    ]) ?? {}),
  };
}

function selectPropertySource(
  material: unknown,
  stage: string,
  settings: MasonryStageMaterialSettings = {},
): PropertySourceSelection {
  const originalProperties = firstObject([
    read(material, "originalMechanicalProperties"),
    read(material, "baseProperties"),
  ]);
  const stateOfFactProperties = firstObject([
    readNested(material, "stageProperties", "state-of-fact"),
    readNested(material, "stageProperties", "stateOfFact"),
    read(material, "stateOfFactProperties"),
    read(material, "stageOfFactProperties"),
    read(material, "anteOperamProperties"),
  ]);
  const adjustedPropertiesValue = read(material, "adjustedProperties");
  const adjustedProperties = isNoArgumentFunction(adjustedPropertiesValue)
    ? adjustedPropertiesValue()
    : adjustedPropertiesValue;
  const designProperties = firstObject([
    readNested(material, "stageProperties", "design"),
    read(material, "designProperties"),
    read(material, "postOperamProperties"),
    read(material, "improvedMechanicalProperties"),
    adjustedProperties,
  ]);
  const directProperties = pickMechanicalProperties(
    isRecord(read(material, "properties")) ? read(material, "properties") : material,
  );

  if (settings.useCorrectiveModifiers === false && originalProperties) {
    return {
      sourceKey: "originalMechanicalProperties",
      properties: originalProperties,
      fallback: false,
    };
  }

  if (stage === "state-of-fact") {
    if (stateOfFactProperties) {
      return {
        sourceKey: "stateOfFactProperties",
        properties: stateOfFactProperties,
        fallback: false,
      };
    }

    if (originalProperties) {
      return {
        sourceKey: "originalMechanicalProperties",
        properties: originalProperties,
        fallback: true,
      };
    }

    return { sourceKey: "directProperties", properties: directProperties, fallback: true };
  }

  if (designProperties) {
    return {
      sourceKey:
        read(material, "designProperties") != null
          ? "designProperties"
          : read(material, "improvedMechanicalProperties") != null
            ? "improvedMechanicalProperties"
            : adjustedProperties != null
              ? "adjustedProperties"
              : "stageProperties.design",
      properties: designProperties,
      fallback: false,
    };
  }

  if (stateOfFactProperties) {
    return {
      sourceKey: "stateOfFactProperties",
      properties: stateOfFactProperties,
      fallback: true,
    };
  }

  if (originalProperties) {
    return {
      sourceKey: "originalMechanicalProperties",
      properties: originalProperties,
      fallback: true,
    };
  }

  return { sourceKey: "directProperties", properties: directProperties, fallback: true };
}

function resolveStageOverride(override: unknown = {}, stage: string): JsonRecord | null {
  const safeOverride = override ?? {};
  const candidates = stageKeyCandidates(stage);

  return firstObject([
    readNested(safeOverride, "stageProperties", stage),
    ...candidates.map((key) => readNested(safeOverride, "stageProperties", key)),
    read(safeOverride, stage),
    ...candidates.map((key) => read(safeOverride, key)),
    read(safeOverride, "properties"),
  ]);
}

function maybeDivideByConfidenceFactor(
  properties: JsonRecord,
  confidenceFactor: number,
  settings: MasonryStageMaterialSettings = {},
): { properties: JsonRecord; applied: boolean } {
  if (
    settings.divideByConfidenceFactor !== true ||
    !Number.isFinite(confidenceFactor) ||
    confidenceFactor <= 1
  ) {
    return { properties: { ...properties }, applied: false };
  }

  return {
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        typeof value === "number" &&
        Number.isFinite(value) &&
        (STRENGTH_KEYS.includes(key) || STIFFNESS_KEYS.includes(key))
          ? value / confidenceFactor
          : value,
      ]),
    ),
    applied: true,
  };
}

export function resolveMasonryStageMaterial({
  material,
  stage = "design",
  settings = {},
  override = null,
  targetUnits = null,
  contextId = null,
}: ResolveMasonryStageMaterialInput = {}): MasonryStageMaterialResolution {
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (!material) {
    return {
      material: null,
      resolvedProperties: null,
      warnings,
      assumptions,
      metadata: {
        stage,
        contextId,
        propertySource: "missing-material",
      },
    };
  }

  const sourceSelection = selectPropertySource(material, stage, settings);
  const variantOverrides = resolveVariantOverrides(material, stage, settings);
  const explicitOverride = resolveStageOverride(override, stage);
  const mergedProperties = {
    ...pickMechanicalProperties(sourceSelection.properties),
    ...pickMechanicalProperties(variantOverrides),
    ...pickMechanicalProperties(explicitOverride),
  };
  const convertedProperties = convertPropertiesToTargetUnits(
    mergedProperties,
    material,
    targetUnits,
  );
  const confidenceFactorValue = read(material, "confidenceFactor");
  const confidenceFactor =
    typeof confidenceFactorValue === "number" && Number.isFinite(confidenceFactorValue)
      ? confidenceFactorValue
      : 1;
  const confidenceAdjusted = maybeDivideByConfidenceFactor(
    convertedProperties,
    confidenceFactor,
    settings,
  );

  const materialLabel = contextId ?? read(material, "id") ?? read(material, "name") ?? "unknown";
  const materialLabelText = compatibilityString(materialLabel);
  if (sourceSelection.fallback) {
    warnings.push(
      `Material ${materialLabelText} resolved ${stage} properties through the fallback source ${sourceSelection.sourceKey}.`,
    );
  }

  if (variantOverrides && Object.keys(variantOverrides).length > 0) {
    assumptions.push(
      `Material ${materialLabelText} applied explicit selection variants for strength/stiffness presets during ${stage} resolution.`,
    );
  }

  if (explicitOverride && Object.keys(explicitOverride).length > 0) {
    assumptions.push(
      `Material ${materialLabelText} applied explicit user overrides during ${stage} resolution.`,
    );
  }

  if (confidenceAdjusted.applied) {
    assumptions.push(
      `Material ${materialLabelText} divided strength and stiffness properties by the confidence factor ${confidenceFactor} because divideByConfidenceFactor=true.`,
    );
  }

  const resolvedProperties = confidenceAdjusted.properties;
  const resolvedMaterialProperties = Object.fromEntries(
    Object.entries(resolvedProperties).filter(([key]) => key !== "w"),
  );
  const metadata = read(material, "metadata");
  const resolvedMaterial: JsonRecord = {
    id: read(material, "id") ?? null,
    name: read(material, "name") ?? null,
    category: read(material, "category") ?? "masonry",
    masonryType:
      read(material, "masonryType") ??
      readNested(material, "metadata", "masonryTypologyName") ??
      null,
    unitType: read(material, "unitType") ?? null,
    mortarType: read(material, "mortarType") ?? null,
    conditionLevel: read(material, "conditionLevel") ?? null,
    knowledgeLevel: read(material, "knowledgeLevel") ?? null,
    confidenceFactor,
    units: targetUnits ?? materialUnitSystem(material) ?? null,
    ...resolvedMaterialProperties,
    metadata: {
      ...(isRecord(metadata) ? metadata : {}),
      stageResolution: {
        stage,
        propertySource: sourceSelection.sourceKey,
        useCorrectiveModifiers: settings.useCorrectiveModifiers ?? true,
        divideByConfidenceFactor: settings.divideByConfidenceFactor ?? false,
        strengthSelection: settings.strengthSelection ?? null,
        stiffnessSelection: settings.stiffnessSelection ?? null,
        stiffnessState: settings.stiffnessState ?? null,
        overrideKeys: explicitOverride ? Object.keys(explicitOverride) : [],
        adoptedProperties: { ...resolvedProperties },
      },
    },
  };

  return {
    material: resolvedMaterial,
    resolvedProperties,
    warnings,
    assumptions,
    metadata: {
      stage,
      contextId,
      propertySource: sourceSelection.sourceKey,
      confidenceFactor,
      appliedVariantSelections: Boolean(
        variantOverrides && Object.keys(variantOverrides).length > 0,
      ),
      appliedOverride: Boolean(explicitOverride && Object.keys(explicitOverride).length > 0),
      dividedByConfidenceFactor: confidenceAdjusted.applied,
    },
  };
}
