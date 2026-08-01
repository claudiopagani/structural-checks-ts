import {
  assertExplicitUnitSystem,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { GroundModel } from "./GroundModel.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  SOIL_PARAMETER_BASES,
  type SoilParameterSet,
  type SoilRecord,
} from "./SoilMaterial.js";

export const GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION = "geotechnical-design-situation/v1";
export const GEOTECHNICAL_DESIGN_SITUATION_TYPES = Object.freeze([
  "persistent",
  "transient",
  "accidental",
  "seismic",
]);
export const GEOTECHNICAL_TIME_CONDITIONS = Object.freeze([
  "short-term",
  "long-term",
  "not-specified",
]);
export const GEOTECHNICAL_DRAINAGE_CONDITIONS = Object.freeze(["drained", "undrained", "mixed"]);
export const GEOTECHNICAL_LIMIT_STATES = Object.freeze(["ULS", "SLS", "ALS", "not-specified"]);
export const GEOTECHNICAL_SEISMIC_MODELS = Object.freeze(["none", "pseudostatic"]);

interface ParameterSelection {
  byMaterial: Record<string, string>;
  byZone: Record<string, string>;
  byLayer: Record<string, string>;
  byInterface: Record<string, string>;
  deformationByMaterial: Record<string, string>;
  deformationByZone: Record<string, string>;
  deformationByLayer: Record<string, string>;
}

export interface GeotechnicalDesignSituationInput {
  id?: string;
  name?: string | null;
  groundModelId?: string | null;
  groundModel?: GroundModel | null;
  situationType?: string;
  limitState?: string;
  timeCondition?: string;
  drainageCondition?: string;
  requiredParameterBasis?: string | null;
  profileId?: string | null;
  sectionId?: string | null;
  porePressureFieldId?: string | null;
  constructionStageId?: string | null;
  parameterSelection?: Partial<ParameterSelection>;
  allowIndicativeValues?: boolean;
  seismic?: SoilRecord | null;
  normativeContext?: SoilRecord;
  units?: UnitSystemInput | null;
  metadata?: SoilRecord;
}

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite.`);
  return number;
}

function normalizeStringMap(value: unknown, label: string): Record<string, string> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object map.`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, selected]) => {
      if (!key || typeof selected !== "string" || !selected) {
        throw new Error(`${label} must map non-empty ids to non-empty ids.`);
      }
      return [key, selected];
    }),
  );
}

function normalizeSeismic(seismic: SoilRecord | null, situationType: string): SoilRecord {
  const model =
    seismic?.model == null
      ? "none"
      : typeof seismic.model === "string"
        ? seismic.model
        : Object.prototype.toString.call(seismic.model);
  if (!GEOTECHNICAL_SEISMIC_MODELS.includes(model)) {
    throw new Error(`Unsupported geotechnical seismic model: ${model}.`);
  }
  if (situationType === "seismic" && model === "none") {
    throw new Error("A seismic GeotechnicalDesignSituation requires an explicit seismic model.");
  }
  if (model === "none") {
    return {
      model: "none",
      metadata: structuredClone((seismic?.metadata as SoilRecord | undefined) ?? {}),
    };
  }
  const kh = finite(seismic?.kh, "seismic.kh");
  const kv = finite(seismic?.kv ?? 0, "seismic.kv");
  if (kh < 0) throw new Error("seismic.kh must be non-negative.");
  if (kv <= -1 || kv >= 1) throw new Error("seismic.kv must satisfy -1 < kv < 1.");
  return {
    model,
    kh,
    kv,
    verticalConvention:
      seismic?.verticalConvention ??
      "positive-kv-reduces-effective-gravity-through-factor-1-minus-kv",
    metadata: structuredClone((seismic?.metadata as SoilRecord | undefined) ?? {}),
  };
}

export interface ParameterResolution {
  groundModelId: string;
  designSituationId: string;
  materialId: string;
  zoneId: null;
  layerId: string | null;
  parameterSetId: string;
  selectionSource: string;
  selectionSourceId: string;
  parameterSet: SoilParameterSet;
  warnings: string[];
}

export class GeotechnicalDesignSituation {
  schemaVersion: string;
  id: string;
  name: string;
  groundModelId: string;
  situationType: string;
  limitState: string;
  timeCondition: string;
  drainageCondition: string;
  requiredParameterBasis: string | null;
  spatialSelection: {
    profileId: string | null;
    sectionId: string | null;
    porePressureFieldId: string | null;
  };
  constructionStageId: string | null;
  parameterSelection: ParameterSelection;
  allowIndicativeValues: boolean;
  seismic: SoilRecord;
  normativeContext: SoilRecord;
  units: UnitSystem;
  metadata: SoilRecord;

  constructor({
    id,
    name = null,
    groundModelId = null,
    groundModel = null,
    situationType = "persistent",
    limitState = "not-specified",
    timeCondition = "not-specified",
    drainageCondition = "mixed",
    requiredParameterBasis = null,
    profileId = null,
    sectionId = null,
    porePressureFieldId = null,
    constructionStageId = null,
    parameterSelection = {},
    allowIndicativeValues = false,
    seismic = null,
    normativeContext = {},
    units = null,
    metadata = {},
  }: GeotechnicalDesignSituationInput = {}) {
    if (!id) throw new Error("A GeotechnicalDesignSituation id is required.");
    assertExplicitUnitSystem(units, "GeotechnicalDesignSituation");
    if (!GEOTECHNICAL_DESIGN_SITUATION_TYPES.includes(situationType)) {
      throw new Error(`Unsupported geotechnical situation type: ${situationType}.`);
    }
    if (!GEOTECHNICAL_LIMIT_STATES.includes(limitState)) {
      throw new Error(`Unsupported geotechnical limit state: ${limitState}.`);
    }
    if (!GEOTECHNICAL_TIME_CONDITIONS.includes(timeCondition)) {
      throw new Error(`Unsupported geotechnical time condition: ${timeCondition}.`);
    }
    if (!GEOTECHNICAL_DRAINAGE_CONDITIONS.includes(drainageCondition)) {
      throw new Error(`Unsupported geotechnical drainage condition: ${drainageCondition}.`);
    }
    if (requiredParameterBasis != null && !SOIL_PARAMETER_BASES.includes(requiredParameterBasis)) {
      throw new Error(`Unsupported requiredParameterBasis: ${requiredParameterBasis}.`);
    }
    if (groundModel != null && !(groundModel instanceof GroundModel)) {
      throw new Error("groundModel must be a GroundModel instance.");
    }
    const resolvedGroundModelId = groundModelId ?? groundModel?.id ?? null;
    if (!resolvedGroundModelId) {
      throw new Error("GeotechnicalDesignSituation groundModelId is required.");
    }
    if (groundModel && groundModel.id !== resolvedGroundModelId) {
      throw new Error("groundModelId does not match the supplied GroundModel.");
    }
    if (sectionId != null || porePressureFieldId != null) {
      throw new Error(
        "This axial-pile migration slice supports profileId selection only; 2D sections and pore-pressure fields are deferred.",
      );
    }

    this.schemaVersion = GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION;
    this.id = id;
    this.name = name ?? id;
    this.groundModelId = resolvedGroundModelId;
    this.situationType = situationType;
    this.limitState = limitState;
    this.timeCondition = timeCondition;
    this.drainageCondition = drainageCondition;
    this.requiredParameterBasis = requiredParameterBasis;
    this.spatialSelection = { profileId, sectionId, porePressureFieldId };
    this.constructionStageId = constructionStageId;
    this.parameterSelection = {
      byMaterial: normalizeStringMap(
        parameterSelection.byMaterial,
        "parameterSelection.byMaterial",
      ),
      byZone: normalizeStringMap(parameterSelection.byZone, "parameterSelection.byZone"),
      byLayer: normalizeStringMap(parameterSelection.byLayer, "parameterSelection.byLayer"),
      byInterface: normalizeStringMap(
        parameterSelection.byInterface,
        "parameterSelection.byInterface",
      ),
      deformationByMaterial: normalizeStringMap(
        parameterSelection.deformationByMaterial,
        "parameterSelection.deformationByMaterial",
      ),
      deformationByZone: normalizeStringMap(
        parameterSelection.deformationByZone,
        "parameterSelection.deformationByZone",
      ),
      deformationByLayer: normalizeStringMap(
        parameterSelection.deformationByLayer,
        "parameterSelection.deformationByLayer",
      ),
    };
    this.allowIndicativeValues = Boolean(allowIndicativeValues);
    this.seismic = normalizeSeismic(seismic, situationType);
    this.normativeContext = structuredClone(normativeContext);
    this.units = GEOTECHNICAL_INTERNAL_UNITS;
    this.metadata = { ...structuredClone(metadata), unitSystem: GEOTECHNICAL_INTERNAL_UNITS };
    if (groundModel) this.validateAgainst(groundModel);
  }

  validateAgainst(groundModel: GroundModel): true {
    if (!(groundModel instanceof GroundModel)) {
      throw new Error("validateAgainst requires a GroundModel.");
    }
    if (groundModel.id !== this.groundModelId) {
      throw new Error(
        `Design situation ${this.id} references GroundModel ${this.groundModelId}, not ${groundModel.id}.`,
      );
    }
    const { profileId } = this.spatialSelection;
    if (profileId != null) groundModel.getProfile(profileId);
    for (const [materialId, parameterSetId] of Object.entries(this.parameterSelection.byMaterial)) {
      groundModel.getMaterial(materialId).getParameterSet(parameterSetId);
    }
    const profile = groundModel.getProfile(profileId);
    for (const [layerId, parameterSetId] of Object.entries(this.parameterSelection.byLayer)) {
      const layer = profile?.layers.find(({ id }) => id === layerId);
      if (!layer) {
        throw new Error(`Unknown layer ${layerId} in GroundProfile ${profile?.id ?? ""}.`);
      }
      groundModel.getMaterial(layer.materialId).getParameterSet(parameterSetId);
    }
    return true;
  }

  resolveParameterSet({
    groundModel,
    materialId = null,
    layerId = null,
  }: {
    groundModel: GroundModel;
    materialId?: string | null;
    zoneId?: string | null;
    layerId?: string | null;
  }): ParameterResolution {
    this.validateAgainst(groundModel);
    const profile = groundModel.getProfile(this.spatialSelection.profileId);
    const layer = layerId ? (profile?.layers.find(({ id }) => id === layerId) ?? null) : null;
    if (layerId && !layer) {
      throw new Error(`Unknown layer ${layerId} in GroundProfile ${profile?.id ?? ""}.`);
    }
    const resolvedMaterialId = materialId ?? layer?.materialId;
    if (!resolvedMaterialId) {
      throw new Error("Parameter resolution requires materialId, zoneId or layerId.");
    }
    if (layer && layer.materialId !== resolvedMaterialId) {
      throw new Error(`Layer ${layer.id} does not use material ${resolvedMaterialId}.`);
    }
    const material = groundModel.getMaterial(resolvedMaterialId);
    const candidates = [
      layer && {
        id: this.parameterSelection.byLayer[layer.id],
        source: "layer",
        sourceId: layer.id,
      },
      {
        id: this.parameterSelection.byMaterial[material.id],
        source: "material",
        sourceId: material.id,
      },
      {
        id: material.defaultParameterSetId,
        source: "material-default",
        sourceId: material.id,
      },
    ].filter(
      (candidate): candidate is { id: string; source: string; sourceId: string } =>
        candidate != null && candidate.id != null,
    );
    const selected = candidates[0];
    if (!selected) {
      throw new Error(
        `No parameter set is selected for material ${material.id} in design situation ${this.id}.`,
      );
    }
    const parameterSet = material.getParameterSet(selected.id);
    if (this.drainageCondition !== "mixed" && parameterSet.drainage !== this.drainageCondition) {
      throw new Error(
        `Parameter set ${parameterSet.id} is ${parameterSet.drainage}, but design situation ${this.id} requires ${this.drainageCondition}.`,
      );
    }
    if (this.requiredParameterBasis != null && parameterSet.basis !== this.requiredParameterBasis) {
      throw new Error(
        `Parameter set ${parameterSet.id} has basis ${parameterSet.basis}, but ${this.requiredParameterBasis} is required.`,
      );
    }
    if (parameterSet.basis === "indicative" && !this.allowIndicativeValues) {
      throw new Error(
        `Indicative parameter set ${parameterSet.id} is not authorized by design situation ${this.id}.`,
      );
    }
    return {
      groundModelId: groundModel.id,
      designSituationId: this.id,
      materialId: material.id,
      zoneId: null,
      layerId: layer?.id ?? null,
      parameterSetId: parameterSet.id,
      selectionSource: selected.source,
      selectionSourceId: selected.sourceId,
      parameterSet: structuredClone(parameterSet),
      warnings:
        parameterSet.basis === "indicative"
          ? ["An indicative parameter set was explicitly authorized."]
          : [],
    };
  }

  resolveInterfaceParameterSetId(interfaceId: string): string | null {
    if (!interfaceId) throw new Error("interfaceId is required.");
    return this.parameterSelection.byInterface[interfaceId] ?? null;
  }

  toJSON(): Record<string, unknown> {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      name: this.name,
      groundModelId: this.groundModelId,
      situationType: this.situationType,
      limitState: this.limitState,
      timeCondition: this.timeCondition,
      drainageCondition: this.drainageCondition,
      requiredParameterBasis: this.requiredParameterBasis,
      profileId: this.spatialSelection.profileId,
      sectionId: this.spatialSelection.sectionId,
      porePressureFieldId: this.spatialSelection.porePressureFieldId,
      constructionStageId: this.constructionStageId,
      parameterSelection: structuredClone(this.parameterSelection),
      allowIndicativeValues: this.allowIndicativeValues,
      seismic: structuredClone(this.seismic),
      normativeContext: structuredClone(this.normativeContext),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
