import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GroundProfile, type GroundProfileInput } from "./GroundProfile.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SoilMaterial,
  type SoilMaterialInput,
  type SoilRecord,
} from "./SoilMaterial.js";

export const GROUND_MODEL_SCHEMA_VERSION = "ground-model/v1";

export interface GroundModelInput {
  id?: string;
  name?: string | null;
  materials?: Array<SoilMaterial | SoilMaterialInput>;
  profiles?: Array<GroundProfile | GroundProfileInput>;
  sections?: unknown[];
  porePressureFields?: unknown[];
  defaultProfileId?: string | null;
  defaultSectionId?: string | null;
  defaultPorePressureFieldId?: string | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function uniqueIds(items: ReadonlyArray<{ id: string }>, label: string): void {
  const ids = items.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(`GroundModel ${label} ids must be unique.`);
  }
}

function resolveDefaultId(
  items: ReadonlyArray<{ id: string }>,
  requested: string | null,
  label: string,
): string | null {
  if (requested != null && !items.some(({ id }) => id === requested)) {
    throw new Error(`Unknown GroundModel default ${label}: ${requested}.`);
  }
  return requested ?? (items.length === 1 ? (items[0]?.id ?? null) : null);
}

function profilePayload(profile: GroundProfile): Record<string, unknown> {
  const serialized = profile.toJSON();
  delete serialized.materials;
  return { ...serialized, materialSource: "ground-model-material-library" };
}

export class GroundModel {
  schemaVersion: string;
  id: string;
  name: string;
  materials: SoilMaterial[];
  profiles: GroundProfile[];
  sections: never[];
  porePressureFields: never[];
  defaultProfileId: string | null;
  defaultSectionId: null;
  defaultPorePressureFieldId: null;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    materials = [],
    profiles = [],
    sections = [],
    porePressureFields = [],
    defaultProfileId = null,
    defaultSectionId = null,
    defaultPorePressureFieldId = null,
    units = null,
    metadata = {},
  }: GroundModelInput = {}) {
    if (!id) throw new Error("A GroundModel id is required.");
    assertExplicitUnitSystem(units, "GroundModel");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    if (materials.length === 0) {
      throw new Error("GroundModel requires at least one material.");
    }
    if (sections.length > 0 || porePressureFields.length > 0) {
      throw new Error(
        "This migrated GroundModel slice currently supports one-dimensional GroundProfile data only.",
      );
    }
    if (defaultSectionId != null || defaultPorePressureFieldId != null) {
      throw new Error(
        "GroundModel section and pore-pressure-field defaults require the later two-dimensional geotechnical slice.",
      );
    }
    const normalizedMaterials = materials.map((material) =>
      material instanceof SoilMaterial
        ? material
        : new SoilMaterial({ ...material, units: material.units ?? units }),
    );
    uniqueIds(normalizedMaterials, "material");
    if (profiles.length === 0) {
      throw new Error("GroundModel requires at least one GroundProfile or GroundSection2D.");
    }
    const normalizedProfiles = profiles.map((profile) => {
      const payload =
        profile instanceof GroundProfile ? (profile.toJSON() as GroundProfileInput) : profile;
      return new GroundProfile({
        ...payload,
        materials: normalizedMaterials,
        units: payload.units ?? units,
      });
    });
    uniqueIds(normalizedProfiles, "profile");
    const materialIds = new Set(normalizedMaterials.map(({ id: materialId }) => materialId));
    for (const profile of normalizedProfiles) {
      for (const layer of profile.layers) {
        if (!materialIds.has(layer.materialId)) {
          throw new Error(
            `GroundModel profile ${profile.id} references unknown material ${layer.materialId}.`,
          );
        }
      }
    }

    this.schemaVersion = GROUND_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.materials = normalizedMaterials;
    this.profiles = normalizedProfiles;
    this.sections = [];
    this.porePressureFields = [];
    this.defaultProfileId = resolveDefaultId(normalizedProfiles, defaultProfileId, "profile");
    this.defaultSectionId = null;
    this.defaultPorePressureFieldId = null;
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      spatialModelDimension: "1d",
    };
  }

  getMaterial(materialId: string): SoilMaterial {
    const material = this.materials.find(({ id }) => id === materialId);
    if (!material) throw new Error(`Unknown GroundModel material: ${materialId}.`);
    return material;
  }

  getProfile(profileId: string | null = null): GroundProfile | null {
    const selectedId = profileId ?? this.defaultProfileId;
    if (selectedId == null) {
      if (this.profiles.length === 0) return null;
      throw new Error("GroundModel requires an explicit profile id.");
    }
    const selected = this.profiles.find(({ id }) => id === selectedId);
    if (!selected) throw new Error(`Unknown GroundModel profile: ${selectedId}.`);
    return selected;
  }

  getSection(): null {
    return null;
  }

  getPorePressureField(): null {
    return null;
  }

  analysisContext({ profileId = null }: { profileId?: string | null } = {}) {
    return {
      groundModelId: this.id,
      profile: this.getProfile(profileId),
      section: null,
      porePressureField: null,
      materials: [...this.materials],
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      materials: this.materials.map((material) => material.toJSON()),
      profiles: this.profiles.map(profilePayload),
      sections: [],
      porePressureFields: [],
      defaultProfileId: this.defaultProfileId,
      defaultSectionId: null,
      defaultPorePressureFieldId: null,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
