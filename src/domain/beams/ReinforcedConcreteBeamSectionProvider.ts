import { ConcreteMaterial } from "../materials/ConcreteMaterial.js";
import { SteelMaterial } from "../materials/SteelMaterial.js";
import type { ReinforcedConcreteSection } from "../geometry/ReinforcedConcreteSection.js";
import { createUnitResolver, type UnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import {
  applySectionRotationToBeamProperties,
  type SectionRotationInput,
} from "./SectionRotation.js";
import type { ElasticBeamSectionProperties } from "./ElasticBeamSectionProvider.js";

const DEFAULT_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

export interface ReinforcedConcreteBeamSectionProviderOptions {
  section: ReinforcedConcreteSection;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  stiffnessState?: string;
  bendingInertiaAxis?: string;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number;
  poissonRatio?: number;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface ReinforcedConcreteBeamSectionContext extends Record<string, unknown> {
  stiffnessState?: string;
  rcStiffnessState?: string;
  limitState?: string;
  sectionRotation?: number | SectionRotationInput | null;
}

interface NumericSource extends Record<string, unknown> {
  units?: UnitSystemInput | UnitSystem | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

interface ResolvedSectionState {
  state: string;
  area: number | null;
  inertia: number | null;
  inertiaY: number | null;
  inertiaZ: number | null;
  shearArea: number | null;
  shearAreaY: number | null;
  shearAreaZ: number | null;
  source: string;
}

function readNumber(source: NumericSource | null | undefined, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertPositive(value: number | null, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function sourceWithMetadata(value: object | null | undefined): NumericSource {
  const source = (value ?? {}) as NumericSource;
  const metadata = source.metadata;
  return {
    ...source,
    metadata: metadata !== null && typeof metadata === "object" ? metadata : undefined,
  };
}

function resolveUnits(...sources: Array<NumericSource | null | undefined>): UnitSystem {
  for (const source of sources) {
    const unitSystem = source?.units ?? source?.metadata?.unitSystem;
    if (
      unitSystem !== null &&
      typeof unitSystem === "object" &&
      typeof (unitSystem as UnitSystemInput).force === "string" &&
      typeof (unitSystem as UnitSystemInput).length === "string"
    ) {
      return createUnitResolver(unitSystem, DEFAULT_UNITS).unitSystem;
    }
  }

  return DEFAULT_UNITS;
}

function resolveConcreteShearModulus(
  concreteMaterial: ConcreteMaterial | null,
  poissonRatio = 0.2,
): number | null {
  const shearModulus = concreteMaterial?.shearModulus ?? null;
  if (typeof shearModulus === "number" && Number.isFinite(shearModulus)) {
    return shearModulus;
  }

  const elasticModulus = concreteMaterial?.elasticModulus ?? null;
  if (typeof elasticModulus === "number" && Number.isFinite(elasticModulus)) {
    return elasticModulus / (2 * (1 + poissonRatio));
  }

  return null;
}

function normalizeStiffnessState(value: string | null | undefined): string {
  return String(value ?? "transformed")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function concreteSection(section: ReinforcedConcreteSection): NumericSource {
  return sourceWithMetadata(section.concreteSection);
}

export class ReinforcedConcreteBeamSectionProvider {
  readonly section: ReinforcedConcreteSection;
  readonly concreteMaterial: ConcreteMaterial | null;
  readonly reinforcementMaterial: SteelMaterial | null;
  readonly stiffnessState: string;
  readonly bendingInertiaAxis: string;
  readonly shearAreaAxis: string;
  readonly shearCorrectionFactor: number;
  readonly poissonRatio: number;
  readonly units: UnitSystem;
  readonly metadata: Record<string, unknown>;

  public constructor({
    section,
    concreteMaterial = null,
    reinforcementMaterial = null,
    stiffnessState = "transformed",
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = 5 / 6,
    poissonRatio = 0.2,
    units = null,
    metadata = {},
  }: ReinforcedConcreteBeamSectionProviderOptions) {
    if (!section) {
      throw new Error("ReinforcedConcreteBeamSectionProvider requires a section.");
    }

    this.section = section;
    this.concreteMaterial =
      concreteMaterial ??
      (section.concreteMaterial instanceof ConcreteMaterial ? section.concreteMaterial : null);
    this.reinforcementMaterial =
      reinforcementMaterial ??
      (section.reinforcementMaterial instanceof SteelMaterial
        ? section.reinforcementMaterial
        : null);
    this.stiffnessState = normalizeStiffnessState(stiffnessState);
    this.bendingInertiaAxis = bendingInertiaAxis;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
    this.poissonRatio = poissonRatio;
    this.units =
      units === null
        ? resolveUnits(sourceWithMetadata(section), sourceWithMetadata(this.concreteMaterial))
        : createUnitResolver(units, DEFAULT_UNITS).unitSystem;
    this.metadata = { ...metadata };
  }

  public resolveSectionForState(
    context: ReinforcedConcreteBeamSectionContext = {},
  ): ResolvedSectionState {
    const state = normalizeStiffnessState(
      context.stiffnessState ?? context.rcStiffnessState ?? this.stiffnessState,
    );
    const concrete = concreteSection(this.section);
    const section = sourceWithMetadata(this.section);
    const transformed = sourceWithMetadata(this.section.transformedSection);

    if (state === "gross" || state === "uncracked_gross") {
      const area = readNumber(concrete, "area") ?? readNumber(section, "area");
      const inertia =
        readNumber(concrete, this.bendingInertiaAxis) ??
        readNumber(section, this.bendingInertiaAxis);
      const shearArea =
        readNumber(concrete, this.shearAreaAxis) ??
        readNumber(concrete, "area") ??
        readNumber(section, this.shearAreaAxis) ??
        readNumber(section, "area");
      return {
        state: "gross",
        area,
        inertia,
        inertiaY: readNumber(concrete, "inertiaY") ?? readNumber(section, "inertiaY"),
        inertiaZ: readNumber(concrete, "inertiaZ") ?? readNumber(section, "inertiaZ"),
        shearArea,
        shearAreaY:
          readNumber(concrete, "shearAreaY") ??
          readNumber(concrete, "area") ??
          readNumber(section, "shearAreaY") ??
          readNumber(section, "area"),
        shearAreaZ:
          readNumber(concrete, "shearAreaZ") ??
          readNumber(concrete, "area") ??
          readNumber(section, "shearAreaZ") ??
          readNumber(section, "area"),
        source: "concrete-gross-section",
      };
    }

    if (state === "transformed" || state === "uncracked_transformed") {
      const area = readNumber(transformed, "area");
      const inertia = readNumber(transformed, this.bendingInertiaAxis);
      const shearArea =
        readNumber(concrete, this.shearAreaAxis) ??
        readNumber(concrete, "area") ??
        readNumber(transformed, this.shearAreaAxis) ??
        readNumber(transformed, "area");
      return {
        state: "transformed",
        area,
        inertia,
        inertiaY: readNumber(transformed, "inertiaY"),
        inertiaZ: readNumber(transformed, "inertiaZ"),
        shearArea,
        shearAreaY:
          readNumber(concrete, "shearAreaY") ??
          readNumber(concrete, "area") ??
          readNumber(transformed, "shearAreaY") ??
          readNumber(transformed, "area"),
        shearAreaZ:
          readNumber(concrete, "shearAreaZ") ??
          readNumber(concrete, "area") ??
          readNumber(transformed, "shearAreaZ") ??
          readNumber(transformed, "area"),
        source: "uncracked-transformed-section",
      };
    }

    throw new Error(`Unsupported RC beam stiffnessState: ${state}.`);
  }

  public getElasticBeamProperties(
    context: ReinforcedConcreteBeamSectionContext = {},
  ): ElasticBeamSectionProperties {
    const elasticModulus = this.concreteMaterial?.elasticModulus ?? null;
    const resolved = this.resolveSectionForState(context);
    const shearModulus = resolveConcreteShearModulus(this.concreteMaterial, this.poissonRatio);

    assertPositive(elasticModulus, "concrete elasticModulus");
    assertPositive(resolved.area, "RC section area");
    assertPositive(resolved.inertia, `RC section ${this.bendingInertiaAxis}`);
    assertPositive(resolved.shearArea, `RC section ${this.shearAreaAxis} or area`);

    const properties: ElasticBeamSectionProperties = {
      axialRigidity: elasticModulus * resolved.area,
      flexuralRigidity: elasticModulus * resolved.inertia,
      shearRigidity: Number.isFinite(shearModulus)
        ? (shearModulus as number) * resolved.shearArea
        : null,
      shearCorrectionFactor: Number.isFinite(shearModulus) ? this.shearCorrectionFactor : null,
      units: this.units,
      flexuralRigidityY: null,
      flexuralRigidityZ: null,
      shearRigidityY: null,
      shearRigidityZ: null,
      metadata: {
        ...this.metadata,
        provider: "ReinforcedConcreteBeamSectionProvider",
        source: resolved.source,
        stiffnessState: resolved.state,
        bendingInertiaAxis: this.bendingInertiaAxis,
        shearAreaAxis: this.shearAreaAxis,
        concreteStrengthClass: this.concreteMaterial?.strengthClass ?? null,
        concreteElasticModulus: elasticModulus,
        concreteShearModulus: shearModulus,
        reinforcementGrade: this.reinforcementMaterial?.grade ?? null,
        reinforcementArea: this.section.totalReinforcementArea(),
        limitState: context.limitState ?? null,
        cracked: false,
      },
    };

    return applySectionRotationToBeamProperties({
      properties,
      sectionRotation: context.sectionRotation,
      flexuralRigidityY:
        resolved.inertiaY === null
          ? properties.flexuralRigidity
          : elasticModulus * resolved.inertiaY,
      flexuralRigidityZ: resolved.inertiaZ === null ? null : elasticModulus * resolved.inertiaZ,
      shearRigidityY:
        Number.isFinite(shearModulus) && resolved.shearAreaY !== null
          ? (shearModulus as number) * resolved.shearAreaY
          : null,
      shearRigidityZ:
        Number.isFinite(shearModulus) && resolved.shearAreaZ !== null
          ? (shearModulus as number) * resolved.shearAreaZ
          : null,
    }) as ElasticBeamSectionProperties;
  }
}

export function createReinforcedConcreteBeamSectionProvider(
  options: ReinforcedConcreteBeamSectionProviderOptions,
): ReinforcedConcreteBeamSectionProvider {
  return new ReinforcedConcreteBeamSectionProvider(options);
}
