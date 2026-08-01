import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import { BaseMaterial, type BaseMaterialJson, type BaseMaterialOptions } from "./BaseMaterial.js";
import {
  resolveExistingMaterialState,
  type ExistingMaterialKnowledgeLevel,
  type ExistingMaterialKnowledgeLevelInput,
} from "./existingMaterialConfidence.js";

export interface ConcreteMeanPropertiesInput {
  fcm?: number | null | undefined;
  fctm?: number | null | undefined;
  elasticModulus?: number | null | undefined;
  [key: string]: unknown;
}

export interface ConcreteMeanProperties extends Record<string, unknown> {
  fcm: number | null | undefined;
  fctm: number | null | undefined;
  elasticModulus: number | null | undefined;
}

export interface ConcreteMaterialOptions extends Omit<BaseMaterialOptions, "category"> {
  strengthClass: string;
  fck?: number | null;
  fcm?: number | null;
  fcd?: number | null;
  fctm?: number | null;
  existing?: boolean;
  knowledgeLevel?: ExistingMaterialKnowledgeLevelInput;
  confidenceFactor?: number | null;
  meanProperties?: ConcreteMeanPropertiesInput;
}

export interface ConcreteMaterialJson extends BaseMaterialJson {
  strengthClass: string;
  fck: number | null;
  fcm: number | null;
  fcd: number | null;
  fctm: number | null;
  existing: boolean;
  knowledgeLevel: ExistingMaterialKnowledgeLevel | null;
  confidenceFactor: number;
  knowledgeLevelDescription: string | null;
  meanProperties: ConcreteMeanProperties;
}

export class ConcreteMaterial extends BaseMaterial {
  strengthClass: string;
  fck: number | null;
  fcm: number | null;
  fcd: number | null;
  fctm: number | null;
  existing: boolean;
  knowledgeLevel: ExistingMaterialKnowledgeLevel | null;
  confidenceFactor: number;
  knowledgeLevelDescription: string | null;
  meanProperties: ConcreteMeanProperties;

  constructor({
    strengthClass,
    fck = null,
    fcm = null,
    fcd = null,
    fctm = null,
    existing = false,
    knowledgeLevel = "LC1",
    confidenceFactor = null,
    meanProperties = {},
    units = null,
    ...baseProps
  }: ConcreteMaterialOptions) {
    assertExplicitUnitSystem(units, "ConcreteMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "concrete",
      units,
      ...baseProps,
    });

    this.strengthClass = strengthClass;
    this.fck = unitResolver.stress(fck);
    this.fcm = unitResolver.stress(fcm);
    this.fcd = unitResolver.stress(fcd);
    this.fctm = unitResolver.stress(fctm);
    const existingState = resolveExistingMaterialState({
      existing,
      knowledgeLevel,
      confidenceFactor,
    });

    this.existing = existingState.existing;
    this.knowledgeLevel = existingState.knowledgeLevel;
    this.confidenceFactor = existingState.confidenceFactor;
    this.knowledgeLevelDescription = existingState.knowledgeLevelDescription;
    this.meanProperties = {
      ...meanProperties,
      fcm: unitResolver.stress(meanProperties.fcm),
      fctm: unitResolver.stress(meanProperties.fctm),
      elasticModulus: unitResolver.stress(meanProperties.elasticModulus),
    };
  }

  override isExistingMaterial(): boolean {
    return this.existing === true;
  }

  override toJSON(): ConcreteMaterialJson {
    return {
      ...super.toJSON(),
      strengthClass: this.strengthClass,
      fck: this.fck,
      fcm: this.fcm,
      fcd: this.fcd,
      fctm: this.fctm,
      existing: this.existing,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      knowledgeLevelDescription: this.knowledgeLevelDescription,
      meanProperties: { ...this.meanProperties },
    };
  }
}
