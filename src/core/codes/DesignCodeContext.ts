export interface DesignCodeContextOptions {
  id: string;
  name?: string;
  jurisdiction?: string | null;
  version?: string | null;
  referenceDocuments?: string[];
  metadata?: Record<string, unknown>;
}

export interface DesignCodeContextJson {
  id: string;
  name: string;
  jurisdiction: string | null;
  version: string | null;
  referenceDocuments: string[];
  metadata: Record<string, unknown>;
}

export class DesignCodeContext {
  public id: string;
  public name: string;
  public jurisdiction: string | null;
  public version: string | null;
  public referenceDocuments: string[];
  public metadata: Record<string, unknown>;

  public constructor({
    id,
    name,
    jurisdiction = null,
    version = null,
    referenceDocuments = [],
    metadata = {},
  }: DesignCodeContextOptions) {
    if (!id) {
      throw new Error("A design code id is required.");
    }

    this.id = id;
    this.name = name ?? id;
    this.jurisdiction = jurisdiction;
    this.version = version;
    this.referenceDocuments = [...referenceDocuments];
    this.metadata = { ...metadata };
  }

  public toJSON(): DesignCodeContextJson {
    return {
      id: this.id,
      name: this.name,
      jurisdiction: this.jurisdiction,
      version: this.version,
      referenceDocuments: [...this.referenceDocuments],
      metadata: { ...this.metadata },
    };
  }
}
