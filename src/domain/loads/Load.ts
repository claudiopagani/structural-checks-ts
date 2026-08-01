import type { UnitSystem } from "../units/UnitSystem.js";

export interface LoadAction {
  id?: string | null;
}

export interface LoadCaseLike {
  id?: string | null;
  action?: LoadAction | null;
}

export interface LoadTarget {
  id?: string | null;
}

export interface LoadInput {
  id?: string | null;
  name?: string | null;
  type: string;
  dimension: string;
  action?: LoadAction | null;
  loadCase?: LoadCaseLike | null;
  target?: LoadTarget | null;
  metadata?: Record<string, unknown>;
}

export interface LoadJson {
  id: string;
  name: string;
  type: string;
  dimension: string;
  units: UnitSystem | null;
  actionId: string | null;
  loadCaseId: string | null;
  targetId: string | null;
  magnitude: unknown;
  metadata: Record<string, unknown>;
}

export class Load {
  static readonly DIMENSIONS = ["point", "line", "area", "volume"];
  static nextAutoId = 1;

  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly dimension: string;
  action: LoadAction | null;
  loadCase: LoadCaseLike | null;
  target: LoadTarget | null;
  metadata: Record<string, unknown>;
  units?: UnitSystem;

  constructor({
    id = null,
    name = null,
    type,
    dimension,
    action = null,
    loadCase = null,
    target = null,
    metadata = {},
  }: LoadInput) {
    if (new.target === Load) {
      throw new Error("Load is an abstract class and cannot be instantiated directly.");
    }

    if (!type) {
      throw new Error("A load type is required.");
    }

    if (!Load.DIMENSIONS.includes(dimension)) {
      throw new Error(`Unsupported load dimension: ${dimension}.`);
    }

    this.id = id ?? `LOAD-${Load.nextAutoId++}`;
    this.name = name ?? this.id;
    this.type = type;
    this.dimension = dimension;
    this.action = action;
    this.loadCase = loadCase;
    this.target = target;
    this.metadata = { ...metadata };
  }

  assignAction(action: LoadAction | null): this {
    this.action = action;
    return this;
  }

  assignTo(loadCase: LoadCaseLike | null): this {
    this.loadCase = loadCase;

    if (loadCase?.action && !this.action) {
      this.assignAction(loadCase.action);
    }

    return this;
  }

  bindTo(target: LoadTarget | null): this {
    this.target = target;
    return this;
  }

  get magnitude(): unknown {
    return this.referenceValue();
  }

  referenceValue(): unknown {
    throw new Error("referenceValue() must be implemented by concrete load classes.");
  }

  resultant(): unknown {
    return this.referenceValue();
  }

  toJSON(): LoadJson {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      dimension: this.dimension,
      units: this.units ? { ...this.units } : null,
      actionId: this.action?.id ?? null,
      loadCaseId: this.loadCase?.id ?? null,
      targetId: this.target?.id ?? null,
      magnitude: this.magnitude,
      metadata: { ...this.metadata },
    };
  }
}
