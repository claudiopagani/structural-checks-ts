// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/rc-cracked-deflection/models/CrackedSectionBeamModel.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
export interface CrackedSectionBeamModelOptions {
  id: string;
  span?: number | null;
  section?: any;
  reinforcement?: Record<string, unknown>;
  material?: Record<string, any>;
  loading?: Record<string, unknown>;
  analysisResult?: unknown;
  concreteMaterial?: unknown;
  reinforcementMaterial?: unknown;
  serviceability?: any;
  mesh?: Record<string, any>;
  solver?: Record<string, any>;
  beamModel?: unknown;
  beamInput?: unknown;
  hyperstatic?: unknown;
  performanceProfile?: string | null;
  sampling?: Record<string, any>;
  output?: Record<string, any>;
  metadata?: Record<string, unknown>;
}

export class CrackedSectionBeamModel {
  public id: string;
  public span: number | null;
  public section: unknown;
  public reinforcement: Record<string, unknown>;
  public material: Record<string, unknown>;
  public loading: Record<string, unknown>;
  public analysisResult: unknown;
  public concreteMaterial: unknown;
  public reinforcementMaterial: unknown;
  public serviceability: unknown;
  public mesh: Record<string, unknown>;
  public solver: Record<string, unknown>;
  public beamModel: unknown;
  public beamInput: unknown;
  public hyperstatic: unknown;
  public performanceProfile: string | null;
  public sampling: Record<string, unknown>;
  public output: Record<string, unknown>;
  public metadata: Record<string, unknown>;

  constructor({
    id,
    span = null,
    section = {},
    reinforcement = {},
    material = {},
    loading = {},
    analysisResult = null,
    concreteMaterial = material.concreteMaterial ??
      material.concrete ??
      section?.concreteMaterial ??
      null,
    reinforcementMaterial = material.reinforcementMaterial ??
      material.reinforcement ??
      section?.reinforcementMaterial ??
      null,
    serviceability = {},
    mesh = { targetFiberCount: 100 },
    solver = { tolerance: 1e-2, maxIterations: 50 },
    beamModel = null,
    beamInput = null,
    hyperstatic = null,
    performanceProfile = null,
    sampling = {},
    output = {},
    metadata = {},
  }: CrackedSectionBeamModelOptions) {
    if (!id) {
      throw new Error("A cracked section beam model id is required.");
    }

    this.id = id;
    this.span = span;
    this.section = section;
    this.reinforcement = { ...reinforcement };
    this.material = { ...material };
    this.loading = { ...loading };
    this.analysisResult = analysisResult;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.serviceability = { ...serviceability };
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.beamModel = beamModel ?? beamInput;
    this.beamInput = beamInput ?? beamModel;
    this.hyperstatic = hyperstatic;
    this.performanceProfile = performanceProfile;
    this.sampling = { ...sampling };
    this.output = { ...output };
    this.metadata = { ...metadata };
  }
}
