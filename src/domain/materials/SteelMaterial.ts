import { assertExplicitUnitSystem, createUnitResolver } from "../units/UnitSystem.js";
import { BaseMaterial, type BaseMaterialJson, type BaseMaterialOptions } from "./BaseMaterial.js";
import {
  resolveExistingMaterialState,
  type ExistingMaterialKnowledgeLevel,
  type ExistingMaterialKnowledgeLevelInput,
} from "./existingMaterialConfidence.js";

export interface SteelMaterialOptions extends Omit<BaseMaterialOptions, "category"> {
  grade: string;
  fyMean?: number | null;
  ftMean?: number | null;
  fyk?: number | null;
  fyd?: number | null;
  ftk?: number | null;
  ductilityClass?: string | null;
  elongationCharacteristic?: number | null;
  ultimateStrain?: number | null;
  existing?: boolean;
  knowledgeLevel?: ExistingMaterialKnowledgeLevelInput;
  confidenceFactor?: number | null;
}

export interface SteelMaterialJson extends BaseMaterialJson {
  grade: string;
  fyMean: number | null;
  ftMean: number | null;
  fyk: number | null;
  fyd: number | null;
  ftk: number | null;
  ductilityClass: string | null;
  elongationCharacteristic: number | null;
  ultimateStrain: number | null;
  existing: boolean;
  knowledgeLevel: ExistingMaterialKnowledgeLevel | null;
  confidenceFactor: number;
  knowledgeLevelDescription: string | null;
}

export class SteelMaterial extends BaseMaterial {
  grade: string;
  fyMean: number | null;
  ftMean: number | null;
  fyk: number | null;
  fyd: number | null;
  ftk: number | null;
  ductilityClass: string | null;
  elongationCharacteristic: number | null;
  ultimateStrain: number | null;
  existing: boolean;
  knowledgeLevel: ExistingMaterialKnowledgeLevel | null;
  confidenceFactor: number;
  knowledgeLevelDescription: string | null;

  constructor({
    grade,
    fyMean = null,
    ftMean = null,
    fyk = null,
    fyd = null,
    ftk = null,
    ductilityClass = null,
    elongationCharacteristic = null,
    ultimateStrain = null,
    existing = false,
    knowledgeLevel = "LC1",
    confidenceFactor = null,
    units = null,
    ...baseProps
  }: SteelMaterialOptions) {
    assertExplicitUnitSystem(units, "SteelMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "steel",
      units,
      ...baseProps,
    });

    this.grade = grade;
    this.fyMean = unitResolver.stress(fyMean);
    this.ftMean = unitResolver.stress(ftMean);
    this.fyk = unitResolver.stress(fyk);
    this.fyd = unitResolver.stress(fyd);
    this.ftk = unitResolver.stress(ftk);
    this.ductilityClass = ductilityClass;
    this.elongationCharacteristic = elongationCharacteristic;
    this.ultimateStrain =
      ultimateStrain ??
      (Number.isFinite(elongationCharacteristic) ? 0.9 * Number(elongationCharacteristic) : null);
    const existingState = resolveExistingMaterialState({
      existing,
      knowledgeLevel,
      confidenceFactor,
    });

    this.existing = existingState.existing;
    this.knowledgeLevel = existingState.knowledgeLevel;
    this.confidenceFactor = existingState.confidenceFactor;
    this.knowledgeLevelDescription = existingState.knowledgeLevelDescription;
  }

  override isExistingMaterial(): boolean {
    return this.existing === true;
  }

  override toJSON(): SteelMaterialJson {
    return {
      ...super.toJSON(),
      grade: this.grade,
      fyMean: this.fyMean,
      ftMean: this.ftMean,
      fyk: this.fyk,
      fyd: this.fyd,
      ftk: this.ftk,
      ductilityClass: this.ductilityClass,
      elongationCharacteristic: this.elongationCharacteristic,
      ultimateStrain: this.ultimateStrain,
      existing: this.existing,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      knowledgeLevelDescription: this.knowledgeLevelDescription,
    };
  }
}
