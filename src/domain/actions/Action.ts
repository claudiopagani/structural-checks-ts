// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/actions/Action.js.

export interface ActionLoadCaseReference {
  readonly id?: string | null;
}

export interface ActionCombinationFactors {
  psi0: number;
  psi1: number;
  psi2: number;
  [kind: string]: number | string | undefined;
}

export type ActionCombinationFactorValue = number | string | undefined;

export type ActionPartialFactorValue = number | null;

export interface ActionPartialFactorSet {
  favourable?: ActionPartialFactorValue;
  unfavourable?: ActionPartialFactorValue;
  [effect: string]: ActionPartialFactorValue | undefined;
}

export type ActionPartialFactors = Record<string, ActionPartialFactorSet>;

export interface ActionOptions {
  id?: string | undefined;
  name?: string | null | undefined;
  nature?: string;
  family?: string;
  loadDurationClass?: string;
  combinationFactors?: Record<string, ActionCombinationFactorValue>;
  partialFactors?: ActionPartialFactors;
  loadCase?: ActionLoadCaseReference | null;
  metadata?: Record<string, unknown>;
}

export interface ActionPartialFactorOptions {
  combinationSet?: string;
  effect?: string;
}

export interface ActionJson {
  id: string;
  name: string;
  nature: string;
  family: string;
  loadDurationClass: string;
  loadCaseId: string | null;
  combinationFactors: ActionCombinationFactors;
  partialFactors: ActionPartialFactors;
  metadata: Record<string, unknown>;
}

function clonePartialFactors(partialFactors: ActionPartialFactors): ActionPartialFactors {
  const cloned: ActionPartialFactors = {};

  for (const [combinationSet, effects] of Object.entries(partialFactors)) {
    const clonedEffects: ActionPartialFactorSet = {};
    for (const [effect, value] of Object.entries(effects)) {
      if (value === undefined) continue;
      if (value === null) {
        clonedEffects[effect] = null;
      } else if (Number.isFinite(value)) {
        clonedEffects[effect] = value === 0 ? 0 : value;
      } else {
        clonedEffects[effect] = null;
      }
    }
    cloned[combinationSet] = clonedEffects;
  }

  return cloned;
}

export class Action {
  public id: string;
  public name: string;
  public nature: string;
  public family: string;
  public loadDurationClass: string;
  public combinationFactors: ActionCombinationFactors;
  public partialFactors: ActionPartialFactors;
  public loadCase: ActionLoadCaseReference | null;
  public metadata: Record<string, unknown>;

  public constructor({
    id,
    name,
    nature,
    family = "generic",
    loadDurationClass = "medium",
    combinationFactors = {},
    partialFactors = {},
    loadCase = null,
    metadata = {},
  }: ActionOptions) {
    if (new.target === Action) {
      throw new Error("Action is an abstract class and cannot be instantiated directly.");
    }

    if (!id) {
      throw new Error("An action id is required.");
    }

    if (!nature) {
      throw new Error("An action nature is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.nature = nature;
    this.family = family;
    this.loadDurationClass = loadDurationClass;
    this.combinationFactors = {
      psi0: 0,
      psi1: 0,
      psi2: 0,
      ...combinationFactors,
    };
    this.partialFactors = { ...partialFactors };
    this.loadCase = loadCase;
    this.metadata = { ...metadata };
  }

  public assignTo(loadCase: ActionLoadCaseReference | null): this {
    this.loadCase = loadCase;
    return this;
  }

  public getCombinationFactor(): number;
  public getCombinationFactor(kind: "psi0" | "psi1" | "psi2"): number;
  public getCombinationFactor(kind: string): number | string;
  public getCombinationFactor(kind = "psi0"): number | string {
    const value = this.combinationFactors[kind];

    if (value === undefined) {
      throw new Error(`Unsupported combination factor '${kind}' for action ${this.id}.`);
    }

    return value;
  }

  public getPartialFactor({
    combinationSet = "A1",
    effect = "unfavourable",
  }: ActionPartialFactorOptions = {}): ActionPartialFactorValue {
    const bySet = this.partialFactors[combinationSet];

    if (!bySet) {
      throw new Error(`Unsupported partial-factor set '${combinationSet}' for action ${this.id}.`);
    }

    const value = bySet[effect];

    if (value === undefined) {
      throw new Error(
        `Unsupported effect '${effect}' for action ${this.id} in set ${combinationSet}.`,
      );
    }

    return value;
  }

  public toJSON(): ActionJson {
    return {
      id: this.id,
      name: this.name,
      nature: this.nature,
      family: this.family,
      loadDurationClass: this.loadDurationClass,
      loadCaseId: this.loadCase?.id ?? null,
      combinationFactors: { ...this.combinationFactors },
      partialFactors: clonePartialFactors(this.partialFactors),
      metadata: { ...this.metadata },
    };
  }
}
