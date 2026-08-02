// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/analysis/LoadCase.js.

export interface LoadCaseAssignmentTarget {
  readonly id?: string | null;
}

export interface LoadCaseAction extends LoadCaseAssignmentTarget {
  assignTo?: (loadCase: LoadCaseAssignmentTarget | null) => unknown;
}

export interface LoadCaseLoad {
  readonly id?: string | null;
  assignTo: (loadCase: LoadCaseAssignmentTarget) => unknown;
}

export interface LoadCaseOptions {
  id?: string | null;
  name?: string | null;
  category?: string;
  action?: LoadCaseAction | null;
  loads?: readonly LoadCaseLoad[];
  metadata?: Record<string, unknown>;
}

export interface LoadCaseJson {
  id: string;
  name: string;
  category: string;
  actionId: string | null;
  loadIds: Array<string | null | undefined>;
  metadata: Record<string, unknown>;
}

export class LoadCase {
  id: string;
  name: string;
  category: string;
  action: LoadCaseAction | null;
  loads: LoadCaseLoad[];
  metadata: Record<string, unknown>;

  constructor({
    id,
    name,
    category = "generic",
    action = null,
    loads = [],
    metadata = {},
  }: LoadCaseOptions) {
    if (!id) {
      throw new Error("A load case id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.category = category;
    this.action = action;
    this.loads = [];
    this.metadata = { ...metadata };

    if (this.action?.assignTo) {
      this.action.assignTo(this);
    }

    loads.forEach((load) => this.addLoad(load));
  }

  addLoad(load: LoadCaseLoad): this {
    load.assignTo(this);
    this.loads.push(load);
    return this;
  }

  toJSON(): LoadCaseJson {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      actionId: this.action?.id ?? null,
      loadIds: this.loads.map((load) => load.id),
      metadata: { ...this.metadata },
    };
  }
}
