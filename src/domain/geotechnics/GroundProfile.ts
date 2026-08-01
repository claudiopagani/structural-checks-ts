import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SoilMaterial,
  type SoilMaterialInput,
  type SoilRecord,
} from "./SoilMaterial.js";

export const GROUND_PROFILE_SCHEMA_VERSION = "ground-profile/v1";

export interface GroundLayerInput extends SoilRecord {
  id?: string;
  topElevation?: number;
  bottomElevation?: number;
  thickness?: number;
  materialId?: string;
  metadata?: SoilRecord;
}

export interface GroundLayer extends SoilRecord {
  id: string;
  topElevation: number;
  bottomElevation: number;
  materialId: string;
  metadata: SoilRecord;
}

export type GroundwaterModel =
  | { model: "none" }
  | {
      model: "hydrostatic";
      waterTableElevation: number;
      waterUnitWeight: number;
      metadata: SoilRecord;
    };

export interface GroundProfileInput {
  id?: string;
  name?: string | null;
  groundSurfaceElevation?: number;
  materials?: Array<SoilMaterial | SoilMaterialInput>;
  layers?: GroundLayerInput[];
  groundwater?: SoilRecord | null;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`);
  return value;
}

function normalizeGroundwater(
  groundwater: SoilRecord | null | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
): GroundwaterModel {
  if (groundwater == null || groundwater.model === "none") return { model: "none" };
  const model =
    typeof groundwater.model === "string"
      ? groundwater.model
      : Object.prototype.toString.call(groundwater.model ?? "hydrostatic");
  if (model !== "hydrostatic") {
    throw new Error(`Unsupported groundwater model: ${model}.`);
  }
  return {
    model,
    waterTableElevation: resolver.length(
      finite(Number(groundwater.waterTableElevation), "groundwater.waterTableElevation"),
    ),
    waterUnitWeight: positive(
      resolver.volumeLoad(Number(groundwater.waterUnitWeight ?? 9.81)),
      "groundwater.waterUnitWeight",
    ),
    metadata: structuredClone((groundwater.metadata as SoilRecord | undefined) ?? {}),
  };
}

export class GroundProfile {
  schemaVersion: string;
  id: string;
  name: string;
  coordinateSystem: { verticalAxis: "z"; positiveDirection: "up"; datum: unknown };
  groundSurfaceElevation: number;
  materials: SoilMaterial[];
  layers: GroundLayer[];
  groundwater: GroundwaterModel;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    groundSurfaceElevation,
    materials = [],
    layers = [],
    groundwater = null,
    units = null,
    metadata = {},
  }: GroundProfileInput = {}) {
    if (!id) throw new Error("A GroundProfile id is required.");
    assertExplicitUnitSystem(units, "GroundProfile");
    const resolver = createUnitResolver(units, GEOTECHNICAL_INTERNAL_UNITS);
    const normalizedMaterials = materials.map((material) =>
      material instanceof SoilMaterial ? material : new SoilMaterial(material),
    );
    const materialIds = normalizedMaterials.map((material) => material.id);
    if (new Set(materialIds).size !== materialIds.length) {
      throw new Error("GroundProfile material ids must be unique.");
    }
    if (layers.length === 0) {
      throw new Error("GroundProfile requires at least one layer.");
    }

    const surface = resolver.length(
      finite(Number(groundSurfaceElevation), "groundSurfaceElevation"),
    );
    const normalizedLayers = layers
      .map((layer, index): GroundLayer => {
        const materialId = layer.materialId;
        if (!materialId) {
          throw new Error(
            `GroundProfile layer ${layer.id ?? `layer-${index + 1}`} references an unknown material.`,
          );
        }
        return {
          ...layer,
          id: layer.id ?? `layer-${index + 1}`,
          topElevation: resolver.length(
            finite(Number(layer.topElevation), `layers[${index}].topElevation`),
          ),
          bottomElevation: resolver.length(
            finite(Number(layer.bottomElevation), `layers[${index}].bottomElevation`),
          ),
          materialId,
          metadata: structuredClone(layer.metadata ?? {}),
        };
      })
      .sort((left, right) => right.topElevation - left.topElevation);
    const layerIds = normalizedLayers.map((layer) => layer.id);
    if (new Set(layerIds).size !== layerIds.length) {
      throw new Error("GroundProfile layer ids must be unique.");
    }
    const tolerance =
      1e-10 *
      Math.max(
        1,
        Math.abs(surface),
        ...normalizedLayers.flatMap((layer) => [
          Math.abs(layer.topElevation),
          Math.abs(layer.bottomElevation),
        ]),
      );
    const firstLayer = normalizedLayers[0] as GroundLayer;
    if (Math.abs(firstLayer.topElevation - surface) > tolerance) {
      throw new Error("The first GroundProfile layer must start at groundSurfaceElevation.");
    }
    for (let index = 0; index < normalizedLayers.length; index += 1) {
      const layer = normalizedLayers[index] as GroundLayer;
      if (!materialIds.includes(layer.materialId)) {
        throw new Error(`GroundProfile layer ${layer.id} references an unknown material.`);
      }
      if (layer.bottomElevation >= layer.topElevation - tolerance) {
        throw new Error(
          `GroundProfile layer ${layer.id} must have topElevation above bottomElevation.`,
        );
      }
      const previous = normalizedLayers[index - 1];
      if (previous && Math.abs(previous.bottomElevation - layer.topElevation) > tolerance) {
        throw new Error("GroundProfile layers must be contiguous and non-overlapping.");
      }
    }

    this.schemaVersion = GROUND_PROFILE_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.coordinateSystem = {
      verticalAxis: "z",
      positiveDirection: "up",
      datum: metadata.datum ?? null,
    };
    this.groundSurfaceElevation = surface;
    this.materials = normalizedMaterials;
    this.layers = normalizedLayers;
    this.groundwater = normalizeGroundwater(groundwater, resolver);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = {
      ...structuredClone(metadata),
      unitSystem: GEOTECHNICAL_INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  static fromThicknesses({
    groundSurfaceElevation,
    layers = [],
    ...profile
  }: GroundProfileInput = {}): GroundProfile {
    let topElevation = Number(groundSurfaceElevation);
    const elevatedLayers = layers.map((layer, index) => {
      const thickness = positive(Number(layer.thickness), `layers[${index}].thickness`);
      const normalized: GroundLayerInput = {
        ...layer,
        topElevation,
        bottomElevation: topElevation - thickness,
      };
      delete normalized.thickness;
      topElevation = Number(normalized.bottomElevation);
      return normalized;
    });
    return new GroundProfile({
      ...profile,
      groundSurfaceElevation: Number(groundSurfaceElevation),
      layers: elevatedLayers,
    });
  }

  get bottomElevation(): number {
    return (this.layers.at(-1) as GroundLayer).bottomElevation;
  }

  getMaterial(materialId: string): SoilMaterial {
    const material = this.materials.find(({ id }) => id === materialId);
    if (!material) throw new Error(`Unknown GroundProfile material: ${materialId}.`);
    return material;
  }

  getLayerAtElevation(elevation: number): GroundLayer {
    const z = finite(Number(elevation), "elevation");
    const tolerance = 1e-10 * Math.max(1, Math.abs(z));
    const layer = this.layers.find(
      (candidate) =>
        z <= candidate.topElevation + tolerance && z >= candidate.bottomElevation - tolerance,
    );
    if (!layer) {
      throw new Error(`Elevation ${z} lies outside GroundProfile ${this.id}.`);
    }
    return layer;
  }

  toJSON(): Record<string, unknown> {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      coordinateSystem: { ...this.coordinateSystem },
      groundSurfaceElevation: this.groundSurfaceElevation,
      materials: this.materials.map((material) => material.toJSON()),
      layers: structuredClone(this.layers),
      groundwater: structuredClone(this.groundwater),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
