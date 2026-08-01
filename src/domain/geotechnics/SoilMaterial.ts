import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;

export const SOIL_PARAMETER_BASES = Object.freeze([
  "measured",
  "derived",
  "representative",
  "characteristic",
  "design",
  "best-estimate",
  "indicative",
]);
export const SOIL_DRAINAGE_CONDITIONS = Object.freeze(["drained", "undrained"]);
export const SOIL_STRENGTH_MODELS = Object.freeze([
  "mohr-coulomb-effective",
  "total-stress-undrained",
]);
export const SOIL_DEFORMATION_MODELS = Object.freeze([
  "schmertmann-cpt",
  "constrained-modulus",
  "isotropic-elastic",
]);
export const SOIL_MODULUS_DEFINITIONS = Object.freeze([
  "secant",
  "tangent",
  "unload-reload",
  "strain-compatible",
  "small-strain",
  "cpt-correlated-equivalent",
]);
export const SOIL_SETTLEMENT_COMPONENTS = Object.freeze([
  "immediate",
  "primary-consolidation",
  "combined-volume-change",
]);

export type SoilRecord = Record<string, unknown>;

export interface SoilParameterSetInput extends SoilRecord {
  id?: string;
  basis?: string;
  drainage?: string;
  strength?: SoilRecord;
  atRest?: SoilRecord | null;
  provenance?: SoilRecord;
  metadata?: SoilRecord;
}

export interface SoilParameterSet extends SoilRecord {
  id: string;
  basis: string;
  drainage: string;
  strength: SoilRecord & {
    model: string;
    frictionAngle: number;
    cohesion: number | null;
    undrainedShearStrength: number | null;
    angleUnits: "rad";
  };
  atRest: SoilRecord | null;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface SoilDeformationParameterSetInput extends SoilRecord {
  id?: string;
  basis?: string;
  drainage?: string;
  model?: string;
  settlementComponent?: string;
  provenance?: SoilRecord;
  metadata?: SoilRecord;
}

export interface SoilDeformationParameterSet extends SoilRecord {
  id: string;
  basis: string;
  drainage: string;
  model: string;
  settlementComponent: string;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface SoilMaterialInput {
  id?: string;
  name?: string;
  soilTypeId?: string;
  classification?: SoilRecord;
  unitWeight?: SoilRecord;
  parameterSets?: SoilParameterSetInput[];
  defaultParameterSetId?: string | null;
  deformationParameterSets?: SoilDeformationParameterSetInput[];
  defaultDeformationParameterSetId?: string | null;
  angleUnits?: string | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function finitePositive(value: number, label: string, { allowZero = false } = {}): number {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "non-negative" : "positive"}.`);
  }
  return value;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function normalizeAngle(value: number, units: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  const normalizedUnits = stringValue(units).trim().toLowerCase();
  const angle =
    normalizedUnits === "deg" ? (value * Math.PI) / 180 : normalizedUnits === "rad" ? value : null;
  if (angle == null) {
    throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
  }
  if (angle < 0 || angle >= Math.PI / 2) {
    throw new Error(`${label} must satisfy 0 <= angle < 90 degrees.`);
  }
  return angle;
}

function normalizeUnitWeight(unitWeight: SoilRecord | undefined, resolver: UnitResolver) {
  if (!unitWeight) {
    throw new Error("SoilMaterial requires unitWeight data.");
  }
  const normalize = (value: unknown, label: string, required = false): number | null => {
    if (value == null && !required) return null;
    return finitePositive(resolver.volumeLoad(Number(value)), label);
  };
  return {
    bulk: normalize(unitWeight.bulk, "unitWeight.bulk", true) as number,
    saturated: normalize(unitWeight.saturated, "unitWeight.saturated"),
    dry: normalize(unitWeight.dry, "unitWeight.dry"),
  };
}

function normalizeStrength(
  strength: SoilRecord | undefined,
  resolver: UnitResolver,
  angleUnits: string | null,
  label: string,
): SoilParameterSet["strength"] {
  if (!strength) {
    throw new Error(`${label}.strength is required.`);
  }
  const model = stringValue(strength.model ?? "mohr-coulomb-effective");
  if (!SOIL_STRENGTH_MODELS.includes(model)) {
    throw new Error(`${label}.strength.model is unsupported: ${model}.`);
  }
  if (model === "mohr-coulomb-effective") {
    return {
      model,
      frictionAngle: normalizeAngle(
        Number(strength.frictionAngle),
        strength.angleUnits ?? angleUnits,
        `${label}.strength.frictionAngle`,
      ),
      cohesion: finitePositive(
        resolver.stress(Number(strength.cohesion ?? 0)),
        `${label}.strength.cohesion`,
        { allowZero: true },
      ),
      undrainedShearStrength: null,
      angleUnits: "rad",
    };
  }
  return {
    model,
    frictionAngle: 0,
    cohesion: null,
    undrainedShearStrength: finitePositive(
      resolver.stress(Number(strength.undrainedShearStrength)),
      `${label}.strength.undrainedShearStrength`,
    ),
    angleUnits: "rad",
  };
}

function normalizeAtRest(atRest: SoilRecord | null | undefined, label: string): SoilRecord | null {
  if (atRest == null) return null;
  return {
    coefficient: finitePositive(Number(atRest.coefficient), `${label}.atRest.coefficient`),
    method: atRest.method ?? "assigned",
    metadata: structuredClone((atRest.metadata as SoilRecord | undefined) ?? {}),
  };
}

function normalizeParameterSet(
  input: SoilParameterSetInput,
  resolver: UnitResolver,
  angleUnits: string | null,
  index: number,
): SoilParameterSet {
  const label = `parameterSets[${index}]`;
  const id = input.id;
  if (!id) throw new Error(`${label}.id is required.`);
  const basis = input.basis;
  if (typeof basis !== "string" || !SOIL_PARAMETER_BASES.includes(basis)) {
    throw new Error(`${label}.basis is unsupported: ${String(basis)}.`);
  }
  const drainage = input.drainage;
  if (typeof drainage !== "string" || !SOIL_DRAINAGE_CONDITIONS.includes(drainage)) {
    throw new Error(`${label}.drainage is unsupported: ${String(drainage)}.`);
  }
  const strength = normalizeStrength(input.strength, resolver, angleUnits, label);
  if (drainage === "drained" && strength.model !== "mohr-coulomb-effective") {
    throw new Error(`${label} uses an undrained strength model in a drained set.`);
  }
  if (drainage === "undrained" && strength.model !== "total-stress-undrained") {
    throw new Error(`${label} uses an effective-stress model in an undrained set.`);
  }
  return {
    id,
    basis,
    drainage,
    strength,
    atRest: normalizeAtRest(input.atRest, label),
    provenance: structuredClone(input.provenance ?? {}),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

function normalizeOptionalRange(
  input: unknown,
  resolver: UnitResolver,
  label: string,
  quantity: "stress" | "strain",
): [number, number] | null {
  if (input == null) return null;
  if (!Array.isArray(input) || input.length !== 2) {
    throw new Error(`${label} must contain [minimum, maximum].`);
  }
  const convert = (value: unknown): number =>
    quantity === "stress" ? resolver.stress(Number(value)) : Number(value);
  const minimum = convert(input[0]);
  const maximum = convert(input[1]);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum <= minimum) {
    throw new Error(`${label} requires 0 <= minimum < maximum.`);
  }
  return [minimum, maximum];
}

function normalizeDeformationParameterSet(
  input: SoilDeformationParameterSetInput,
  resolver: UnitResolver,
  index: number,
): SoilDeformationParameterSet {
  const label = `deformationParameterSets[${index}]`;
  const id = input.id;
  if (!id) throw new Error(`${label}.id is required.`);
  const basis = input.basis;
  if (typeof basis !== "string" || !SOIL_PARAMETER_BASES.includes(basis)) {
    throw new Error(`${label}.basis is unsupported: ${String(basis)}.`);
  }
  const drainage = input.drainage;
  if (typeof drainage !== "string" || !SOIL_DRAINAGE_CONDITIONS.includes(drainage)) {
    throw new Error(`${label}.drainage is unsupported: ${String(drainage)}.`);
  }
  const model = input.model;
  if (typeof model !== "string" || !SOIL_DEFORMATION_MODELS.includes(model)) {
    throw new Error(`${label}.model is unsupported: ${String(model)}.`);
  }
  const settlementComponent = String(input.settlementComponent ?? "immediate");
  if (!SOIL_SETTLEMENT_COMPONENTS.includes(settlementComponent)) {
    throw new Error(`${label}.settlementComponent is unsupported: ${settlementComponent}.`);
  }
  const provenance = structuredClone(input.provenance ?? {});
  if (typeof provenance.source !== "string" || !provenance.source.trim()) {
    throw new Error(`${label}.provenance.source is required.`);
  }
  const common: SoilDeformationParameterSet = {
    id,
    basis,
    drainage,
    model,
    settlementComponent,
    stressRange: normalizeOptionalRange(
      input.stressRange,
      resolver,
      `${label}.stressRange`,
      "stress",
    ),
    strainRange: normalizeOptionalRange(
      input.strainRange,
      resolver,
      `${label}.strainRange`,
      "strain",
    ),
    provenance,
    metadata: structuredClone(input.metadata ?? {}),
  };

  if (model === "schmertmann-cpt") {
    if (drainage !== "drained") {
      throw new Error(`${label} Schmertmann CPT data must be drained.`);
    }
    if (settlementComponent !== "immediate") {
      throw new Error(`${label} Schmertmann CPT data must describe immediate settlement.`);
    }
    return {
      ...common,
      coneTipResistance: finitePositive(
        resolver.stress(Number(input.coneTipResistance)),
        `${label}.coneTipResistance`,
      ),
      soilApplicability: "cohesionless",
      testMethod: "CPT",
      modulusDefinition: "cpt-correlated-equivalent",
    };
  }

  const modulusDefinition = stringValue(input.modulusDefinition ?? "secant");
  if (!SOIL_MODULUS_DEFINITIONS.includes(modulusDefinition)) {
    throw new Error(`${label}.modulusDefinition is unsupported: ${modulusDefinition}.`);
  }
  if (model === "constrained-modulus") {
    return {
      ...common,
      constrainedModulus: finitePositive(
        resolver.stress(Number(input.constrainedModulus)),
        `${label}.constrainedModulus`,
      ),
      modulusDefinition,
      testMethod: input.testMethod ?? "assigned",
      boundaryCondition: "one-dimensional-confined-compression",
    };
  }

  const poissonRatio = Number(input.poissonRatio);
  if (!Number.isFinite(poissonRatio) || poissonRatio < 0 || poissonRatio >= 0.5) {
    throw new Error(`${label}.poissonRatio must satisfy 0 <= value < 0.5.`);
  }
  const hasYoung = input.youngModulus != null;
  const hasShear = input.shearModulus != null;
  if (hasYoung === hasShear) {
    throw new Error(
      `${label} isotropic-elastic data require exactly one of youngModulus or shearModulus.`,
    );
  }
  const youngModulus = hasYoung
    ? finitePositive(resolver.stress(Number(input.youngModulus)), `${label}.youngModulus`)
    : null;
  const shearModulus = hasShear
    ? finitePositive(resolver.stress(Number(input.shearModulus)), `${label}.shearModulus`)
    : Number(youngModulus) / (2 * (1 + poissonRatio));
  return {
    ...common,
    youngModulus: youngModulus ?? 2 * shearModulus * (1 + poissonRatio),
    shearModulus,
    poissonRatio,
    inputModulus: hasYoung ? "young" : "shear",
    modulusDefinition,
    boundaryCondition: "isotropic-elastic-continuum",
  };
}

export class SoilMaterial {
  id: string;
  name: string;
  category: "soil";
  soilTypeId: string;
  classification: SoilRecord;
  unitWeight: { bulk: number; saturated: number | null; dry: number | null };
  parameterSets: SoilParameterSet[];
  defaultParameterSetId: string | null;
  deformationParameterSets: SoilDeformationParameterSet[];
  defaultDeformationParameterSetId: string | null;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name,
    soilTypeId = "custom",
    classification = {},
    unitWeight,
    parameterSets = [],
    defaultParameterSetId = null,
    deformationParameterSets = [],
    defaultDeformationParameterSetId = null,
    angleUnits = null,
    units = null,
    metadata = {},
  }: SoilMaterialInput = {}) {
    if (!id) throw new Error("A SoilMaterial id is required.");
    if (!name) throw new Error("A SoilMaterial name is required.");
    assertExplicitUnitSystem(units, "SoilMaterial");
    if (parameterSets.length === 0) {
      throw new Error("SoilMaterial requires at least one parameter set.");
    }
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const normalizedSets = parameterSets.map((set, index) =>
      normalizeParameterSet(set, resolver, angleUnits, index),
    );
    const ids = normalizedSets.map((set) => set.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error("SoilMaterial parameter set ids must be unique.");
    }
    const resolvedDefault =
      defaultParameterSetId ??
      (normalizedSets.length === 1 ? (normalizedSets[0]?.id ?? null) : null);
    if (resolvedDefault != null && !ids.includes(resolvedDefault)) {
      throw new Error(`Unknown SoilMaterial default parameter set: ${resolvedDefault}.`);
    }
    const normalizedDeformationSets = deformationParameterSets.map((set, index) =>
      normalizeDeformationParameterSet(set, resolver, index),
    );
    const deformationIds = normalizedDeformationSets.map((set) => set.id);
    if (new Set(deformationIds).size !== deformationIds.length) {
      throw new Error("SoilMaterial deformation parameter set ids must be unique.");
    }
    const resolvedDeformationDefault =
      defaultDeformationParameterSetId ??
      (normalizedDeformationSets.length === 1 ? (normalizedDeformationSets[0]?.id ?? null) : null);
    if (
      resolvedDeformationDefault != null &&
      !deformationIds.includes(resolvedDeformationDefault)
    ) {
      throw new Error(
        `Unknown SoilMaterial default deformation parameter set: ${resolvedDeformationDefault}.`,
      );
    }

    this.id = id;
    this.name = name;
    this.category = "soil";
    this.soilTypeId = soilTypeId;
    this.classification = structuredClone(classification);
    this.unitWeight = normalizeUnitWeight(unitWeight, resolver);
    this.parameterSets = normalizedSets;
    this.defaultParameterSetId = resolvedDefault;
    this.deformationParameterSets = normalizedDeformationSets;
    this.defaultDeformationParameterSetId = resolvedDeformationDefault;
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      sourceAngleUnits: angleUnits ?? metadata.sourceAngleUnits ?? null,
    };
  }

  getParameterSet(parameterSetId: string | null = null): SoilParameterSet {
    const selectedId = parameterSetId ?? this.defaultParameterSetId;
    if (selectedId == null) {
      throw new Error(`SoilMaterial ${this.id} requires an explicit parameterSetId.`);
    }
    const parameterSet = this.parameterSets.find(({ id }) => id === selectedId);
    if (!parameterSet) {
      throw new Error(`Unknown parameter set ${selectedId} for SoilMaterial ${this.id}.`);
    }
    return parameterSet;
  }

  getDeformationParameterSet(parameterSetId: string | null = null): SoilDeformationParameterSet {
    const selectedId = parameterSetId ?? this.defaultDeformationParameterSetId;
    if (selectedId == null) {
      throw new Error(`SoilMaterial ${this.id} requires an explicit deformationParameterSetId.`);
    }
    const parameterSet = this.deformationParameterSets.find(({ id }) => id === selectedId);
    if (!parameterSet) {
      throw new Error(
        `Unknown deformation parameter set ${selectedId} for SoilMaterial ${this.id}.`,
      );
    }
    return parameterSet;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      soilTypeId: this.soilTypeId,
      classification: structuredClone(this.classification),
      unitWeight: { ...this.unitWeight },
      parameterSets: structuredClone(this.parameterSets),
      defaultParameterSetId: this.defaultParameterSetId,
      deformationParameterSets: structuredClone(this.deformationParameterSets),
      defaultDeformationParameterSetId: this.defaultDeformationParameterSetId,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}

export { INTERNAL_UNITS as GEOTECHNICAL_INTERNAL_UNITS };
