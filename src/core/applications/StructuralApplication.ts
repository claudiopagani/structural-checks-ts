import { CalculationResult } from "../results/CalculationResult.js";
import { RESULT_STATUS } from "../results/resultStatus.js";

export interface StructuralApplicationOptions {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  supportedCodes?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface PlaceholderResultOptions {
  summary?: string;
  assumptions?: unknown[];
  warnings?: unknown[];
  outputs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface StructuralApplicationManifest {
  id: string;
  name: string;
  description: string;
  domain: string;
  supportedCodes: string[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export class StructuralApplication {
  id: string;
  name: string;
  description: string;
  domain: string;
  supportedCodes: string[];
  tags: string[];
  metadata: Record<string, unknown>;

  constructor({
    id,
    name,
    description,
    domain,
    supportedCodes = [],
    tags = [],
    metadata = {},
  }: StructuralApplicationOptions) {
    if (!id) {
      throw new Error("An application id is required.");
    }

    if (!name) {
      throw new Error("An application name is required.");
    }

    this.id = id;
    this.name = name;
    this.description = description ?? "";
    this.domain = domain ?? "general";
    this.supportedCodes = [...supportedCodes];
    this.tags = [...tags];
    this.metadata = { ...metadata };
  }

  createPlaceholderResult({
    summary,
    assumptions = [],
    warnings = [],
    outputs = {},
    metadata = {},
  }: PlaceholderResultOptions = {}): CalculationResult {
    return new CalculationResult({
      applicationId: this.id,
      status: RESULT_STATUS.NOT_IMPLEMENTED,
      summary: summary ?? `${this.name} is scaffolded and ready for domain-specific integration.`,
      assumptions,
      warnings,
      outputs,
      metadata: {
        domain: this.domain,
        ...metadata,
      },
    });
  }

  run(): CalculationResult {
    return this.createPlaceholderResult();
  }

  getManifest(): StructuralApplicationManifest {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      domain: this.domain,
      supportedCodes: [...this.supportedCodes],
      tags: [...this.tags],
      metadata: { ...this.metadata },
    };
  }
}
