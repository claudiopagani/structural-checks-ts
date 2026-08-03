// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-beams/models/TimberBeamModel.js.

type JsonRecord = Record<string, unknown>;

export interface TimberBeamModelOptions {
  id: string | number | bigint;
  span?: unknown;
  section?: unknown;
  material?: unknown;
  restraints?: JsonRecord;
  loadCases?: readonly unknown[];
  metadata?: JsonRecord;
}

export class TimberBeamModel {
  id: string | number | bigint;
  span: unknown;
  section: unknown;
  material: unknown;
  restraints: JsonRecord;
  loadCases: unknown[];
  metadata: JsonRecord;

  constructor({
    id,
    span = null,
    section = null,
    material = null,
    restraints = {},
    loadCases = [],
    metadata = {},
  }: TimberBeamModelOptions) {
    if (!id) {
      throw new Error("A timber beam model id is required.");
    }

    this.id = id;
    this.span = span;
    this.section = section;
    this.material = material;
    this.restraints = { ...restraints };
    this.loadCases = [...loadCases];
    this.metadata = { ...metadata };
  }
}
