import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  TimberMaterial,
  type TimberMaterialJson,
  type TimberMaterialOptions,
} from "./TimberMaterial.js";

export interface XlamMaterialMetadata extends Record<string, unknown> {
  rollingShearStrength?: number | null;
}

export interface XlamMaterialOptions extends Omit<TimberMaterialOptions, "metadata" | "units"> {
  e0Mean?: number | null;
  e90Mean?: number | null;
  g0Mean?: number | null;
  g90Mean?: number | null;
  rollingShearStrength?: number | null;
  metadata?: XlamMaterialMetadata;
  units?: UnitSystemInput | null;
}

export interface XlamMaterialJson extends TimberMaterialJson {
  e0Mean: number | null;
  e90Mean: number | null;
  g0Mean: number | null;
  g90Mean: number | null;
  rollingShearStrength: number | null | undefined;
}

export class XlamMaterial extends TimberMaterial {
  declare readonly e0Mean: number | null;
  declare readonly e90Mean: number | null;
  declare readonly g0Mean: number | null;
  declare readonly g90Mean: number | null;
  declare readonly rollingShearStrength: number | null | undefined;

  constructor({
    e0Mean,
    e90Mean = null,
    g0Mean = null,
    g90Mean = null,
    rollingShearStrength = null,
    units = null,
    ...timberProps
  }: XlamMaterialOptions) {
    assertExplicitUnitSystem(units, "XlamMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({ units, ...timberProps });

    this.e0Mean = unitResolver.stress(e0Mean) ?? this.elasticModulus ?? null;
    this.e90Mean = unitResolver.stress(e90Mean) ?? (this.e0Mean != null ? this.e0Mean / 30 : null);
    this.g0Mean = unitResolver.stress(g0Mean) ?? (this.e0Mean != null ? this.e0Mean / 16 : null);
    this.g90Mean = unitResolver.stress(g90Mean) ?? (this.g0Mean != null ? this.g0Mean / 10 : null);
    this.rollingShearStrength =
      unitResolver.stress(rollingShearStrength) ??
      this.fvK ??
      unitResolver.stress(timberProps.metadata?.rollingShearStrength) ??
      null;
  }

  override toJSON(): XlamMaterialJson {
    return {
      ...super.toJSON(),
      e0Mean: this.e0Mean,
      e90Mean: this.e90Mean,
      g0Mean: this.g0Mean,
      g90Mean: this.g90Mean,
      rollingShearStrength: this.rollingShearStrength,
    };
  }
}
