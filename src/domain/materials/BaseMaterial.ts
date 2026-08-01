import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export type MaterialMetadata = Record<string, unknown>;

export interface BaseMaterialOptions {
  id?: string | null;
  name: string;
  category: string;
  density?: number | null;
  elasticModulus?: number | null;
  shearModulus?: number | null;
  poissonRatio?: number | null;
  thermalExpansion?: number | null;
  units?: UnitSystemInput | null;
  metadata?: MaterialMetadata;
}

export interface BaseMaterialJson {
  id: string | null;
  name: string;
  category: string;
  density: number | null;
  elasticModulus: number | null;
  shearModulus: number | null;
  poissonRatio: number | null;
  thermalExpansion: number | null;
  units: UnitSystem;
  metadata: MaterialMetadata;
}

type MaterialConstructor<TMaterial extends BaseMaterial> = new (
  options: Record<string, unknown>,
) => TMaterial;

export class BaseMaterial {
  id: string | null;
  name: string;
  category: string;
  density: number | null;
  elasticModulus: number | null;
  shearModulus: number | null;
  poissonRatio: number | null;
  thermalExpansion: number | null;
  units: UnitSystem;
  metadata: MaterialMetadata;

  constructor({
    id = null,
    name,
    category,
    density = null,
    elasticModulus = null,
    shearModulus = null,
    poissonRatio = null,
    thermalExpansion = null,
    units = null,
    metadata = {},
  }: BaseMaterialOptions) {
    if (!name) {
      throw new Error("A material name is required.");
    }

    if (!category) {
      throw new Error("A material category is required.");
    }

    assertExplicitUnitSystem(units, "BaseMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.name = name;
    this.category = category;
    this.density = unitResolver.volumeLoad(density);
    this.elasticModulus = unitResolver.stress(elasticModulus);
    this.shearModulus = unitResolver.stress(shearModulus);
    this.poissonRatio = poissonRatio;
    this.thermalExpansion = thermalExpansion;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  isExistingMaterial(): boolean {
    return false;
  }

  clone(overrides: Record<string, unknown> = {}): this {
    const Material = this.constructor as MaterialConstructor<this>;
    return new Material({
      ...this.toJSON(),
      ...overrides,
    });
  }

  toJSON(): BaseMaterialJson {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      density: this.density,
      elasticModulus: this.elasticModulus,
      shearModulus: this.shearModulus,
      poissonRatio: this.poissonRatio,
      thermalExpansion: this.thermalExpansion,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
