import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";

const INTERNAL_UNITS: UnitSystem = { force: "N", length: "mm" };

type JsonObject = Record<string, unknown>;

export interface MasonryPierGeometryInput {
  baseX?: number;
  baseY?: number;
  x?: number;
  y?: number;
  height?: number;
  h?: number;
  length?: number;
  L?: number;
  b?: number;
  width?: number;
  thickness?: number;
  t?: number;
  transverseWallSpacing?: number | null;
  a?: number | null;
  effectiveLength?: number;
}

export interface MasonryPierProperties extends JsonObject {
  fm?: number | null | undefined;
  tau0?: number | null | undefined;
  fv0?: number | null | undefined;
  E?: number | null | undefined;
  G?: number | null | undefined;
  w?: number | null | undefined;
  elasticModulus?: number | null | undefined;
  shearModulus?: number | null | undefined;
  density?: number | null | undefined;
}

export interface MasonryPierMetadata extends JsonObject {
  gammaM?: number | null;
  unitSystem?: UnitSystemInput | null;
  sourceUnitSystem?: UnitSystemInput | null;
}

export interface MasonryPierMaterialRecord extends MasonryPierProperties {
  units?: UnitSystemInput | null | undefined;
  metadata?: MasonryPierMetadata;
  baseProperties?: MasonryPierProperties;
  originalMechanicalProperties?: MasonryPierProperties;
  stateOfFactProperties?: MasonryPierProperties;
  improvedMechanicalProperties?: MasonryPierProperties;
  properties?: MasonryPierProperties;
  adjustedProperties?: MasonryPierProperties | (() => MasonryPierProperties);
  adjustedProperty?: (propertyName: string) => unknown;
  confidenceFactor?: number;
  toJSON?: () => unknown;
}

export interface MasonryPierActionsInput {
  axialForce?: number;
  N?: number;
  axialForceConvention?: string;
  outOfPlaneMoment?: number;
  Mv?: number;
  inPlaneMoment?: number;
  ML?: number;
  outOfPlaneVerticalLoadEccentricity?: number;
  es?: number;
  inPlaneVerticalLoadEccentricity?: number;
  eL?: number;
  el?: number;
}

export interface MasonryPierDesignInput {
  gammaM?: number | null;
  gamma?: number | null;
  confidenceFactor?: number | null;
  FC?: number | null;
  lateralRestraintFactor?: number | null;
  rho?: number | null;
  constructionEccentricity?: number | null;
  unitWeight?: number | null;
  w?: number | null;
  allowExtrapolation?: boolean;
  reductionTableScheme?: string;
}

export interface MasonryPierIdealizationInput {
  rigidEndZoneBottom?: number | null;
  rigidBottom?: number | null;
  bottomRigidZone?: number | null;
  rigidEndZoneTop?: number | null;
  rigidTop?: number | null;
  topRigidZone?: number | null;
  elementClass?: string;
  shearCorrectionFactor?: number | null;
  axialRigidity?: number | null;
  flexuralRigidity?: number | null;
  shearRigidity?: number | null;
}

export interface MasonryPierModelOptions {
  id?: string;
  units?: UnitSystemInput | null | undefined;
  geometry?: MasonryPierGeometryInput;
  material?: unknown;
  actions?: MasonryPierActionsInput;
  design?: MasonryPierDesignInput;
  idealization?: MasonryPierIdealizationInput;
  metadata?: MasonryPierMetadata;
}

export interface MasonryPierGeometry {
  baseX: number;
  baseY: number;
  height: number;
  length: number;
  thickness: number;
  transverseWallSpacing: number | null;
}

export interface MasonryPierActions {
  axialForce: number;
  axialForceConvention: string;
  outOfPlaneMoment: number;
  inPlaneMoment: number;
  outOfPlaneVerticalLoadEccentricity: number;
  inPlaneVerticalLoadEccentricity: number;
}

export interface MasonryPierDesign {
  gammaM: number | null;
  confidenceFactor: number | null;
  lateralRestraintFactor: number | null;
  constructionEccentricity: number | null;
  unitWeight: number | null;
  allowExtrapolation: boolean;
  reductionTableScheme: string;
}

export interface MasonryPierIdealization {
  rigidEndZoneBottom: number;
  rigidEndZoneTop: number;
  elementClass: string;
  shearCorrectionFactor: number | null;
  axialRigidity: number | null;
  flexuralRigidity: number | null;
  shearRigidity: number | null;
}

export interface MasonryPierModelJson {
  id: string;
  units: UnitSystem;
  geometry: MasonryPierGeometry;
  material: unknown;
  actions: MasonryPierActions;
  design: MasonryPierDesign;
  idealization: MasonryPierIdealization;
  metadata: MasonryPierMetadata;
}

export interface MasonryPierEquivalentFrameRigidities {
  axialRigidity: number | null;
  flexuralRigidity: number | null;
  shearRigidity: number | null;
  shearCorrectionFactor: number;
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object";
}

function isMaterialRecord(value: unknown): value is MasonryPierMaterialRecord {
  return isRecord(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`MasonryPierModel requires a positive ${label}.`);
  }
}

function assertNonNegative(
  value: number | null | undefined,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`MasonryPierModel requires a non-negative ${label}.`);
  }
}

function normalizeAxialForceConvention(value = "compression-positive"): string {
  const normalized = String(value).trim().toLowerCase();

  if (
    normalized === "compression-positive" ||
    normalized === "compression-negative" ||
    normalized === "absolute"
  ) {
    return normalized;
  }

  throw new Error(`Unsupported masonry pier axialForceConvention: ${value}.`);
}

function normalizeReductionTableScheme(value = "hinged"): string {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "hinged") {
    throw new Error(
      `MasonryPierModel supports only the "hinged" reductionTableScheme for Phi reduction factors. Received: ${value}.`,
    );
  }

  return normalized;
}

function normalizePlainMaterial(material: unknown): unknown {
  if (!isMaterialRecord(material) || material.constructor !== Object) {
    return material;
  }

  const materialMetadata = material.metadata;
  const units = material.units ?? materialMetadata?.unitSystem ?? null;

  if (!units) {
    return { ...material };
  }

  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const convertProperties = (properties: MasonryPierProperties = {}): MasonryPierProperties => ({
    ...properties,
    fm: unitResolver.stress(properties.fm),
    tau0: unitResolver.stress(properties.tau0),
    fv0: unitResolver.stress(properties.fv0),
    E: unitResolver.stress(properties.E),
    G: unitResolver.stress(properties.G),
    w: unitResolver.volumeLoad(properties.w),
  });

  return {
    ...material,
    fm: unitResolver.stress(material.fm),
    tau0: unitResolver.stress(material.tau0),
    fv0: unitResolver.stress(material.fv0),
    E: unitResolver.stress(material.E ?? material.elasticModulus),
    G: unitResolver.stress(material.G ?? material.shearModulus),
    w: unitResolver.volumeLoad(material.w ?? material.density),
    elasticModulus: unitResolver.stress(material.elasticModulus ?? material.E),
    shearModulus: unitResolver.stress(material.shearModulus ?? material.G),
    density: unitResolver.volumeLoad(material.density ?? material.w),
    baseProperties: convertProperties(material.baseProperties),
    originalMechanicalProperties: convertProperties(material.originalMechanicalProperties),
    stateOfFactProperties: convertProperties(material.stateOfFactProperties),
    improvedMechanicalProperties: convertProperties(material.improvedMechanicalProperties),
    units: INTERNAL_UNITS,
    metadata: {
      ...materialMetadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: materialMetadata?.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    },
  } satisfies MasonryPierMaterialRecord;
}

function finiteOrNull(
  value: number | null | undefined,
  converter: (value: number) => number,
): number | null {
  if (value == null) {
    return null;
  }

  return converter(value);
}

function firstFinite(values: readonly unknown[]): number | null {
  return values.find(isFiniteNumber) ?? null;
}

function readNumeric(source: unknown, propertyName: string): number | null {
  if (!isRecord(source)) {
    return null;
  }

  return firstFinite([source[propertyName]]);
}

export class MasonryPierModel {
  public id: string;
  public units: UnitSystem;
  public geometry: MasonryPierGeometry;
  public material: unknown;
  public actions: MasonryPierActions;
  public design: MasonryPierDesign;
  public idealization: MasonryPierIdealization;
  public metadata: MasonryPierMetadata;

  public constructor({
    id,
    units = null,
    geometry = {},
    material = null,
    actions = {},
    design = {},
    idealization = {},
    metadata = {},
  }: MasonryPierModelOptions) {
    if (!id) {
      throw new Error("A masonry pier model id is required.");
    }

    assertExplicitUnitSystem(units, "MasonryPierModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedHeight = unitResolver.length(geometry.height ?? geometry.h);
    const resolvedLength = unitResolver.length(
      geometry.length ?? geometry.L ?? geometry.b ?? geometry.width,
    );
    const resolvedThickness = unitResolver.length(geometry.thickness ?? geometry.t);
    const resolvedRigidBottom =
      finiteOrNull(
        idealization.rigidEndZoneBottom ?? idealization.rigidBottom ?? idealization.bottomRigidZone,
        unitResolver.length,
      ) ?? 0;
    const resolvedRigidTop =
      finiteOrNull(
        idealization.rigidEndZoneTop ?? idealization.rigidTop ?? idealization.topRigidZone,
        unitResolver.length,
      ) ?? 0;

    assertPositive(resolvedHeight, "geometry.height");
    assertPositive(resolvedLength, "geometry.length");
    assertPositive(resolvedThickness, "geometry.thickness");
    assertNonNegative(resolvedRigidBottom, "idealization.rigidEndZoneBottom");
    assertNonNegative(resolvedRigidTop, "idealization.rigidEndZoneTop");

    if (resolvedRigidBottom + resolvedRigidTop >= resolvedHeight) {
      throw new Error("MasonryPierModel rigid end zones must leave a positive deformable height.");
    }

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.geometry = {
      baseX: unitResolver.length(geometry.baseX ?? geometry.x ?? 0),
      baseY: unitResolver.length(geometry.baseY ?? geometry.y ?? 0),
      height: resolvedHeight,
      length: resolvedLength,
      thickness: resolvedThickness,
      transverseWallSpacing: finiteOrNull(
        geometry.transverseWallSpacing ?? geometry.a,
        unitResolver.length,
      ),
    };
    this.material = normalizePlainMaterial(material);
    this.actions = {
      axialForce: unitResolver.force(actions.axialForce ?? actions.N ?? 0),
      axialForceConvention: normalizeAxialForceConvention(actions.axialForceConvention),
      outOfPlaneMoment: unitResolver.moment(actions.outOfPlaneMoment ?? actions.Mv ?? 0),
      inPlaneMoment: unitResolver.moment(actions.inPlaneMoment ?? actions.ML ?? 0),
      outOfPlaneVerticalLoadEccentricity: unitResolver.length(
        actions.outOfPlaneVerticalLoadEccentricity ?? actions.es ?? 0,
      ),
      inPlaneVerticalLoadEccentricity: unitResolver.length(
        actions.inPlaneVerticalLoadEccentricity ?? actions.eL ?? actions.el ?? 0,
      ),
    };
    this.design = {
      gammaM: design.gammaM ?? design.gamma ?? null,
      confidenceFactor: design.confidenceFactor ?? design.FC ?? null,
      lateralRestraintFactor: design.lateralRestraintFactor ?? design.rho ?? null,
      constructionEccentricity: finiteOrNull(design.constructionEccentricity, unitResolver.length),
      unitWeight: finiteOrNull(design.unitWeight ?? design.w, unitResolver.volumeLoad),
      allowExtrapolation: Boolean(design.allowExtrapolation),
      reductionTableScheme: normalizeReductionTableScheme(design.reductionTableScheme),
    };
    this.idealization = {
      rigidEndZoneBottom: resolvedRigidBottom,
      rigidEndZoneTop: resolvedRigidTop,
      elementClass: String(idealization.elementClass ?? "frame-2d-timoshenko")
        .trim()
        .toLowerCase(),
      shearCorrectionFactor:
        idealization.shearCorrectionFactor == null
          ? null
          : Number(idealization.shearCorrectionFactor),
      axialRigidity: finiteOrNull(idealization.axialRigidity, unitResolver.force),
      flexuralRigidity: finiteOrNull(idealization.flexuralRigidity, (value) =>
        unitResolver.convert(value, {
          forceExponent: 1,
          lengthExponent: 2,
        }),
      ),
      shearRigidity: finiteOrNull(idealization.shearRigidity, unitResolver.force),
    };
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  public grossArea(): number {
    return this.geometry.length * this.geometry.thickness;
  }

  public inPlaneInertia(): number {
    return (this.geometry.thickness * this.geometry.length ** 3) / 12;
  }

  public deformableHeight(): number {
    return (
      this.geometry.height -
      this.idealization.rigidEndZoneBottom -
      this.idealization.rigidEndZoneTop
    );
  }

  public compressiveAxialForce(): number {
    const { axialForce, axialForceConvention } = this.actions;

    if (axialForceConvention === "compression-positive") return axialForce;
    if (axialForceConvention === "compression-negative") return -axialForce;
    return Math.abs(axialForce);
  }

  public resolveMaterialProperty(propertyName: string): number | null {
    const material = isMaterialRecord(this.material) ? this.material : null;
    if (!material) return null;

    const adjustedValue = material.adjustedProperties;
    const adjustedProperties =
      typeof adjustedValue === "function" ? adjustedValue() : adjustedValue;
    const aliases: Record<string, readonly string[]> = {
      fm: ["fm"],
      tau0: ["tau0"],
      fv0: ["fv0"],
      E: ["E", "elasticModulus"],
      G: ["G", "shearModulus"],
      w: ["w", "density"],
    };
    const propertyAliases = aliases[propertyName] ?? [propertyName];
    const sources: unknown[] = [
      material.improvedMechanicalProperties,
      adjustedProperties,
      material.stateOfFactProperties,
      material.originalMechanicalProperties,
      material.baseProperties,
      material.properties,
      material,
    ].filter(Boolean);

    for (const source of sources) {
      const value = firstFinite(propertyAliases.map((alias) => readNumeric(source, alias)));
      if (value !== null) return value;
    }

    if (typeof material.adjustedProperty === "function") {
      const value = firstFinite(propertyAliases.map((alias) => material.adjustedProperty?.(alias)));
      if (value !== null) return value;
    }

    return null;
  }

  public resolvedGammaM(): number | null {
    const material = isMaterialRecord(this.material) ? this.material : null;
    return this.design.gammaM ?? material?.metadata?.gammaM ?? null;
  }

  public resolvedConfidenceFactor(): number {
    const material = isMaterialRecord(this.material) ? this.material : null;
    return this.design.confidenceFactor ?? material?.confidenceFactor ?? 1;
  }

  public resolvedUnitWeight(): number | null {
    const material = isMaterialRecord(this.material) ? this.material : null;
    return this.design.unitWeight ?? this.resolveMaterialProperty("w") ?? material?.density ?? null;
  }

  public resolvedConstructionEccentricity(): number {
    return this.design.constructionEccentricity ?? this.geometry.height / 200;
  }

  public resolvedLateralRestraintFactor(): number {
    if (isFiniteNumber(this.design.lateralRestraintFactor)) {
      return this.design.lateralRestraintFactor;
    }

    const spacing = this.geometry.transverseWallSpacing;
    if (!isFiniteNumber(spacing) || spacing <= 0) return 1;

    const ratio = this.geometry.height / spacing;
    if (ratio <= 0.5) return 1;
    if (ratio <= 1.0) return 1.5 - ratio;
    return 1 / (1 + ratio ** 2);
  }

  public resolvedElasticModulus(): number | null {
    return this.resolveMaterialProperty("E");
  }

  public resolvedShearModulus(): number | null {
    return this.resolveMaterialProperty("G");
  }

  public resolvedEquivalentFrameRigidities(): MasonryPierEquivalentFrameRigidities {
    const axialOverride = this.idealization.axialRigidity;
    const flexuralOverride = this.idealization.flexuralRigidity;
    const shearOverride = this.idealization.shearRigidity;
    const elasticModulus = this.resolvedElasticModulus();
    const shearModulus = this.resolvedShearModulus();
    const grossArea = this.grossArea();
    const inertia = this.inPlaneInertia();

    return {
      axialRigidity:
        axialOverride ?? (isFiniteNumber(elasticModulus) ? elasticModulus * grossArea : null),
      flexuralRigidity:
        flexuralOverride ?? (isFiniteNumber(elasticModulus) ? elasticModulus * inertia : null),
      shearRigidity:
        shearOverride ?? (isFiniteNumber(shearModulus) ? shearModulus * grossArea : null),
      shearCorrectionFactor: this.idealization.shearCorrectionFactor ?? 5 / 6,
    };
  }

  public toJSON(): MasonryPierModelJson {
    const material = isMaterialRecord(this.material) ? this.material : null;
    const serializedMaterial =
      material && typeof material.toJSON === "function" ? material.toJSON() : this.material;
    return {
      id: this.id,
      units: { ...this.units },
      geometry: { ...this.geometry },
      material: serializedMaterial,
      actions: { ...this.actions },
      design: { ...this.design },
      idealization: { ...this.idealization },
      metadata: { ...this.metadata },
    };
  }
}
