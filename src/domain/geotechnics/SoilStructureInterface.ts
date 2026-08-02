import { SOIL_PARAMETER_BASES, type SoilRecord } from "./SoilMaterial.js";

export const SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION = "soil-structure-interface/v1";

export type SoilStructureInterfaceModel = "assigned-angle" | "soil-friction-ratio";

export const SOIL_STRUCTURE_INTERFACE_MODELS = Object.freeze([
  "assigned-angle",
  "soil-friction-ratio",
]) satisfies readonly SoilStructureInterfaceModel[];

export interface SoilStructureInterfaceWallSurfaceInput {
  typeId?: string;
  materialType?: string;
  finish?: string;
  metadata?: SoilRecord;
}

export interface SoilStructureInterfaceWallSurface {
  typeId: string;
  materialType: string;
  finish: string;
  metadata: SoilRecord;
}

export interface SoilStructureInterfaceParameterSetInput {
  id?: string;
  basis?: string;
  model?: string;
  frictionAngle?: number;
  angleUnits?: string | null;
  frictionRatio?: number;
  soilInterfaceClassId?: string | null;
  provenance?: SoilRecord;
  metadata?: SoilRecord;
}

export interface SoilStructureInterfaceParameterSet {
  id: string;
  basis: string;
  model: SoilStructureInterfaceModel;
  frictionAngle: number | null;
  frictionRatio: number | null;
  angleUnits: "rad";
  soilInterfaceClassId: string | null;
  provenance: SoilRecord;
  metadata: SoilRecord;
}

export interface SoilStructureInterfaceOptions {
  id?: string;
  name?: string | null;
  wallSurface?: SoilStructureInterfaceWallSurfaceInput | null;
  parameterSets?: SoilStructureInterfaceParameterSetInput[];
  defaultParameterSetId?: string | null;
  angleUnits?: string | null;
  metadata?: SoilRecord;
}

export interface SoilStructureInterfaceResolution {
  interfaceId: string;
  parameterSetId: string;
  parameterBasis: string;
  model: SoilStructureInterfaceModel;
  wallSurface: SoilStructureInterfaceWallSurface;
  soilInterfaceClassId: string | null;
  frictionAngle: number;
  nominalFrictionAngle: number;
  frictionRatio: number | null;
  governingSoilFrictionAngle: number;
  cappedBySoilFriction: boolean;
  provenance: SoilRecord;
  metadata: SoilRecord;
  units: { angle: "rad" };
}

export interface SoilStructureInterfaceJson {
  schemaVersion: string;
  id: string;
  name: string;
  wallSurface: SoilStructureInterfaceWallSurface;
  parameterSets: SoilStructureInterfaceParameterSet[];
  defaultParameterSetId: string | null;
  metadata: SoilRecord;
}

function isSoilStructureInterfaceModel(value: unknown): value is SoilStructureInterfaceModel {
  return value === "assigned-angle" || value === "soil-friction-ratio";
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function normalizeAngle(value: unknown, units: unknown, label: string): number {
  if (!Number.isFinite(Number(value))) throw new Error(`${label} must be finite.`);
  const normalizedUnits = stringValue(units).trim().toLowerCase();
  const angle =
    normalizedUnits === "deg"
      ? (Number(value) * Math.PI) / 180
      : normalizedUnits === "rad"
        ? Number(value)
        : null;

  if (angle == null) {
    throw new Error(`${label} requires angleUnits equal to "deg" or "rad".`);
  }
  if (angle < 0 || angle >= Math.PI / 2) {
    throw new Error(`${label} must satisfy 0 <= delta < 90 degrees.`);
  }
  return angle;
}

function normalizeParameterSet(
  input: SoilStructureInterfaceParameterSetInput | null | undefined,
  defaultAngleUnits: string | null,
  index: number,
): SoilStructureInterfaceParameterSet {
  const label = `parameterSets[${index}]`;
  if (!input?.id) throw new Error(`${label}.id is required.`);
  const basis = input.basis;
  if (typeof basis !== "string" || !SOIL_PARAMETER_BASES.includes(basis)) {
    throw new Error(`${label}.basis is unsupported: ${String(basis)}.`);
  }

  const model = input.model;
  if (!isSoilStructureInterfaceModel(model)) {
    throw new Error(`${label}.model is unsupported: ${String(model)}.`);
  }

  let frictionAngle: number | null = null;
  let frictionRatio: number | null = null;
  if (model === "assigned-angle") {
    frictionAngle = normalizeAngle(
      input.frictionAngle,
      input.angleUnits ?? defaultAngleUnits,
      `${label}.frictionAngle`,
    );
  } else {
    frictionRatio = Number(input.frictionRatio);
    if (!Number.isFinite(frictionRatio) || frictionRatio < 0 || frictionRatio > 1) {
      throw new Error(`${label}.frictionRatio must satisfy 0 <= ratio <= 1.`);
    }
  }

  return {
    id: input.id,
    basis,
    model,
    frictionAngle,
    frictionRatio,
    angleUnits: "rad",
    soilInterfaceClassId: input.soilInterfaceClassId ?? null,
    provenance: structuredClone(input.provenance ?? {}),
    metadata: structuredClone(input.metadata ?? {}),
  };
}

export class SoilStructureInterface {
  schemaVersion: string;
  id: string;
  name: string;
  wallSurface: SoilStructureInterfaceWallSurface;
  parameterSets: SoilStructureInterfaceParameterSet[];
  defaultParameterSetId: string | null;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    wallSurface,
    parameterSets = [],
    defaultParameterSetId = null,
    angleUnits = null,
    metadata = {},
  }: SoilStructureInterfaceOptions = {}) {
    if (!id) throw new Error("A SoilStructureInterface id is required.");
    const surface = wallSurface;
    if (!surface?.typeId) {
      throw new Error("SoilStructureInterface wallSurface.typeId is required.");
    }
    if (!Array.isArray(parameterSets) || parameterSets.length === 0) {
      throw new Error("SoilStructureInterface requires at least one parameter set.");
    }

    const normalizedSets = parameterSets.map((parameterSet, index) =>
      normalizeParameterSet(parameterSet, angleUnits, index),
    );
    const ids = normalizedSets.map(({ id: parameterSetId }) => parameterSetId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("SoilStructureInterface parameter set ids must be unique.");
    }

    const resolvedDefault =
      defaultParameterSetId ?? (normalizedSets.length === 1 ? normalizedSets[0]!.id : null);
    if (resolvedDefault != null && !ids.includes(resolvedDefault)) {
      throw new Error(`Unknown SoilStructureInterface default parameter set: ${resolvedDefault}.`);
    }

    this.schemaVersion = SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.wallSurface = {
      typeId: surface.typeId,
      materialType: surface.materialType ?? "custom",
      finish: surface.finish ?? "custom",
      metadata: structuredClone(surface.metadata ?? {}),
    };
    this.parameterSets = normalizedSets;
    this.defaultParameterSetId = resolvedDefault;
    this.metadata = structuredClone(metadata ?? {});
  }

  getParameterSet(parameterSetId: string | null = null): SoilStructureInterfaceParameterSet {
    const selectedId = parameterSetId ?? this.defaultParameterSetId;
    if (selectedId == null) {
      throw new Error(`SoilStructureInterface ${this.id} requires an explicit parameterSetId.`);
    }
    const parameterSet = this.parameterSets.find(({ id }) => id === selectedId);
    if (!parameterSet) {
      throw new Error(`Unknown parameter set ${selectedId} for SoilStructureInterface ${this.id}.`);
    }
    return parameterSet;
  }

  resolveFrictionAngle({
    soilFrictionAngles,
    parameterSetId = null,
  }: {
    soilFrictionAngles?: number[];
    parameterSetId?: string | null;
  } = {}): SoilStructureInterfaceResolution {
    if (!Array.isArray(soilFrictionAngles) || soilFrictionAngles.length === 0) {
      throw new Error("soilFrictionAngles must contain at least one angle.");
    }
    const angles = soilFrictionAngles.map((value, index) => {
      const angle = Number(value);
      if (!Number.isFinite(angle) || angle < 0 || angle >= Math.PI / 2) {
        throw new Error(`soilFrictionAngles[${index}] must satisfy 0 <= phi < pi/2.`);
      }
      return angle;
    });
    const governingSoilFrictionAngle = Math.min(...angles);
    const parameterSet = this.getParameterSet(parameterSetId);
    const nominalFrictionAngle =
      parameterSet.model === "assigned-angle"
        ? parameterSet.frictionAngle!
        : parameterSet.frictionRatio! * governingSoilFrictionAngle;
    const frictionAngle = Math.min(nominalFrictionAngle, governingSoilFrictionAngle);

    return {
      interfaceId: this.id,
      parameterSetId: parameterSet.id,
      parameterBasis: parameterSet.basis,
      model: parameterSet.model,
      wallSurface: structuredClone(this.wallSurface),
      soilInterfaceClassId: parameterSet.soilInterfaceClassId,
      frictionAngle,
      nominalFrictionAngle,
      frictionRatio: parameterSet.frictionRatio,
      governingSoilFrictionAngle,
      cappedBySoilFriction: nominalFrictionAngle > governingSoilFrictionAngle + 1e-14,
      provenance: structuredClone(parameterSet.provenance),
      metadata: structuredClone(parameterSet.metadata),
      units: { angle: "rad" },
    };
  }

  toJSON(): SoilStructureInterfaceJson {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      wallSurface: structuredClone(this.wallSurface),
      parameterSets: structuredClone(this.parameterSets),
      defaultParameterSetId: this.defaultParameterSetId,
      metadata: structuredClone(this.metadata),
    };
  }
}
