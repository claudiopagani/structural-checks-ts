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
import { GroundSection2D, type GroundSection2DOptions } from "./GroundSection2D.js";
import { PorePressureField2D, type PorePressureField2DOptions } from "./PorePressureField2D.js";

export const GROUND_MODEL_SCHEMA_VERSION = "ground-model/v1";

export interface GroundModelInput {
  id?: string;
  name?: string | null;
  materials?: Array<SoilMaterial | SoilMaterialInput>;
  profiles?: Array<GroundProfile | GroundProfileInput>;
  sections?: Array<GroundSection2D | GroundSection2DOptions>;
  porePressureFields?: Array<PorePressureField2D | PorePressureField2DOptions>;
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
  sections: GroundSection2D[];
  porePressureFields: PorePressureField2D[];
  defaultProfileId: string | null;
  defaultSectionId: string | null;
  defaultPorePressureFieldId: string | null;
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
    if (
      !Array.isArray(profiles) ||
      !Array.isArray(sections) ||
      !Array.isArray(porePressureFields)
    ) {
      throw new Error("GroundModel profiles, sections and porePressureFields must be arrays.");
    }
    const normalizedMaterials = materials.map((material) =>
      material instanceof SoilMaterial
        ? material
        : new SoilMaterial({ ...material, units: material.units ?? units }),
    );
    uniqueIds(normalizedMaterials, "material");
    if (profiles.length === 0 && sections.length === 0) {
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
    const normalizedSections = sections.map((section) =>
      section instanceof GroundSection2D
        ? section
        : new GroundSection2D({ ...section, units: section.units ?? units }),
    );
    const normalizedFields = porePressureFields.map((field) =>
      field instanceof PorePressureField2D
        ? field
        : new PorePressureField2D({ ...field, units: field.units ?? units }),
    );
    uniqueIds(normalizedProfiles, "profile");
    uniqueIds(normalizedSections, "section");
    uniqueIds(normalizedFields, "pore-pressure field");
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
    for (const section of normalizedSections) {
      for (const zone of section.zones) {
        if (!materialIds.has(zone.materialId)) {
          throw new Error(
            `GroundModel section ${section.id} references unknown material ${zone.materialId}.`,
          );
        }
      }
    }

    this.schemaVersion = GROUND_MODEL_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.materials = normalizedMaterials;
    this.profiles = normalizedProfiles;
    this.sections = normalizedSections;
    this.porePressureFields = normalizedFields;
    this.defaultProfileId = resolveDefaultId(normalizedProfiles, defaultProfileId, "profile");
    this.defaultSectionId = resolveDefaultId(normalizedSections, defaultSectionId, "section");
    this.defaultPorePressureFieldId = resolveDefaultId(
      normalizedFields,
      defaultPorePressureFieldId,
      "pore-pressure field",
    );
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      spatialModelDimension: normalizedSections.length > 0 ? "2d" : "1d",
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

  getSection(sectionId: string | null = null): GroundSection2D | null {
    const selectedId = sectionId ?? this.defaultSectionId;
    if (selectedId == null) {
      if (this.sections.length === 0) return null;
      throw new Error("GroundModel requires an explicit section id.");
    }
    const selected = this.sections.find(({ id }) => id === selectedId);
    if (!selected) throw new Error(`Unknown GroundModel section: ${selectedId}.`);
    return selected;
  }

  getPorePressureField(fieldId: string | null = null): PorePressureField2D | null {
    const selectedId = fieldId ?? this.defaultPorePressureFieldId;
    if (selectedId == null) {
      if (this.porePressureFields.length === 0) return null;
      throw new Error("GroundModel requires an explicit pore-pressure field id.");
    }
    const selected = this.porePressureFields.find(({ id }) => id === selectedId);
    if (!selected) throw new Error(`Unknown GroundModel pore-pressure field: ${selectedId}.`);
    return selected;
  }

  static fromGroundProfile({
    profile,
    id = null,
    name = null,
    sectionId = null,
    porePressureFieldId = null,
    minimumX = 0,
    maximumX = 1,
    metadata = {},
  }: {
    profile?: GroundProfile;
    id?: string | null;
    name?: string | null;
    sectionId?: string | null;
    porePressureFieldId?: string | null;
    minimumX?: number;
    maximumX?: number;
    metadata?: Record<string, unknown>;
  } = {}): GroundModel {
    if (!(profile instanceof GroundProfile)) {
      throw new Error("GroundModel.fromGroundProfile requires a GroundProfile.");
    }
    const section = GroundSection2D.fromGroundProfile({
      profile,
      id: sectionId,
      minimumX,
      maximumX,
    });
    const field = PorePressureField2D.fromGroundProfile({
      profile,
      id: porePressureFieldId,
    });
    return new GroundModel({
      id: id ?? `${profile.id}-ground-model`,
      name: name ?? `${profile.name} ground model`,
      materials: profile.materials,
      profiles: [profile],
      sections: [section],
      porePressureFields: [field],
      defaultProfileId: profile.id,
      defaultSectionId: section.id,
      defaultPorePressureFieldId: field.id,
      units: GEOTECHNICAL_INTERNAL_UNITS,
      metadata: {
        ...structuredClone(metadata),
        sourceProfileId: profile.id,
        conversion: "ground-model-from-ground-profile",
      },
    });
  }

  analysisContext({
    profileId = null,
    sectionId = null,
    porePressureFieldId = null,
  }: {
    profileId?: string | null;
    sectionId?: string | null;
    porePressureFieldId?: string | null;
  } = {}) {
    return {
      groundModelId: this.id,
      profile: this.getProfile(profileId),
      section: this.getSection(sectionId),
      porePressureField: this.getPorePressureField(porePressureFieldId),
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
      sections: this.sections.map((section) => section.toJSON()),
      porePressureFields: this.porePressureFields.map((field) => field.toJSON()),
      defaultProfileId: this.defaultProfileId,
      defaultSectionId: this.defaultSectionId,
      defaultPorePressureFieldId: this.defaultPorePressureFieldId,
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
