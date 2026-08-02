// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/ExistingMaterial.js.

import { BaseMaterial, type BaseMaterialJson, type BaseMaterialOptions } from "./BaseMaterial.js";

export interface ExistingMaterialOptions extends BaseMaterialOptions {
  conditionLevel?: string;
  knowledgeLevel?: string | number | null;
  confidenceFactor?: number;
  testResults?: readonly unknown[];
  interventions?: readonly unknown[];
}

export interface ExistingMaterialJson extends BaseMaterialJson {
  conditionLevel: string;
  knowledgeLevel: string | number | null;
  confidenceFactor: number;
  testResults: unknown[];
  interventions: unknown[];
}

export class ExistingMaterial extends BaseMaterial {
  declare readonly conditionLevel: string;
  declare readonly knowledgeLevel: string | number | null;
  declare readonly confidenceFactor: number;
  declare readonly testResults: unknown[];
  declare readonly interventions: unknown[];

  constructor({
    conditionLevel = "unknown",
    knowledgeLevel = null,
    confidenceFactor = 1,
    testResults = [],
    interventions = [],
    ...baseProps
  }: ExistingMaterialOptions) {
    super(baseProps);

    this.conditionLevel = conditionLevel;
    this.knowledgeLevel = knowledgeLevel;
    this.confidenceFactor = confidenceFactor;
    this.testResults = [...testResults];
    this.interventions = [...interventions];
  }

  override isExistingMaterial(): boolean {
    return true;
  }

  addTestResult(testResult: unknown): this {
    this.testResults.push(testResult);
    return this;
  }

  addIntervention(intervention: unknown): this {
    this.interventions.push(intervention);
    return this;
  }

  designValue(characteristicValue: number): number {
    return characteristicValue / this.confidenceFactor;
  }

  override toJSON(): ExistingMaterialJson {
    return {
      ...super.toJSON(),
      conditionLevel: this.conditionLevel,
      knowledgeLevel: this.knowledgeLevel,
      confidenceFactor: this.confidenceFactor,
      testResults: [...this.testResults],
      interventions: [...this.interventions],
    };
  }
}
