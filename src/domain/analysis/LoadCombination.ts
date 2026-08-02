// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/analysis/LoadCombination.js.

import { Combination } from "./Combination.js";
import type { CombinationJson, CombinationOptions } from "./Combination.js";
import type { LoadCase } from "./LoadCase.js";

export interface LoadCombinationFactor {
  loadCase: LoadCase;
  factor: number;
}

export interface LoadCombinationOptions extends CombinationOptions {
  factors?: readonly LoadCombinationFactor[];
}

export interface LoadCombinationJson extends CombinationJson {
  factors: Array<{
    loadCaseId: string;
    factor: number;
  }>;
}

export class LoadCombination extends Combination {
  factors: LoadCombinationFactor[];

  constructor({
    id,
    name,
    factors = [],
    combinationType = "ULS",
    metadata = {},
  }: LoadCombinationOptions) {
    super({
      id,
      name,
      combinationType,
      metadata,
    });

    this.factors = [...factors];
  }

  addFactor(loadCase: LoadCase, factor: number): this {
    this.factors.push({
      loadCase,
      factor,
    });
    return this;
  }

  evaluate(loadResultsByCaseId: Record<string, number> = {}): number {
    return this.factors.reduce((acc, item) => {
      const value = loadResultsByCaseId[item.loadCase.id] ?? 0;
      return acc + item.factor * value;
    }, 0);
  }

  override toJSON(): LoadCombinationJson {
    return {
      ...super.toJSON(),
      factors: this.factors.map((item) => ({
        loadCaseId: item.loadCase.id,
        factor: item.factor,
      })),
    };
  }
}
