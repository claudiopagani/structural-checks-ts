// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/analysis/Combination.js.

export interface CombinationOptions {
  id?: string | null | undefined;
  name?: string | null | undefined;
  combinationType?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CombinationJson {
  id: string;
  name: string;
  combinationType: string;
  metadata: Record<string, unknown>;
}

export class Combination {
  id: string;
  name: string;
  combinationType: string;
  metadata: Record<string, unknown>;

  constructor({ id, name, combinationType = "GENERIC", metadata = {} }: CombinationOptions) {
    if (new.target === Combination) {
      throw new Error("Combination is an abstract class and cannot be instantiated directly.");
    }

    if (!id) {
      throw new Error("A combination id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.combinationType = combinationType;
    this.metadata = { ...metadata };
  }

  toJSON(): CombinationJson {
    return {
      id: this.id,
      name: this.name,
      combinationType: this.combinationType,
      metadata: { ...this.metadata },
    };
  }
}
