// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/rc-cracked-deflection/RCrackedDeflectionApplication.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CrackedSectionDeflectionAnalysis } from "./analysis/CrackedSectionDeflectionAnalysis.js";
import { CrackedSectionBeamModel } from "./models/CrackedSectionBeamModel.js";
import type { CrackedSectionBeamModelOptions } from "./models/CrackedSectionBeamModel.js";

export interface RCrackedDeflectionApplicationInput {
  model?: CrackedSectionBeamModel | CrackedSectionBeamModelOptions | null;
  code?: string;
  metadata?: Record<string, unknown>;
  analysisResult?: unknown;
  section?: unknown;
  concreteMaterial?: unknown;
  reinforcementMaterial?: unknown;
  serviceability?: unknown;
  mesh?: unknown;
  solver?: unknown;
  beamModel?: unknown;
  hyperstatic?: any;
  performanceProfile?: string | false | null;
  sampling?: unknown;
  output?: unknown;
}

export class RCrackedDeflectionApplication extends StructuralApplication {
  constructor() {
    super({
      id: "rc-cracked-deflection",
      name: "RC Cracked Deflection",
      description: "Deflection analysis of reinforced concrete beams with cracked sections.",
      domain: "reinforced-concrete",
      supportedCodes: ["NTC2018", "Eurocode 2"],
      tags: ["rc", "deflection", "cracking", "sls"],
      metadata: {
        maturity: "implemented",
        limitations: [
          "time-dependent parameters and shrinkage strain are explicit caller inputs",
          "hyperstatic iteration requires an analyzable beam model or an external callback",
          "global staged-construction history remains a consumer responsibility",
        ],
      },
    });
  }

  override run(input: RCrackedDeflectionApplicationInput = {}) {
    const model =
      input.model instanceof CrackedSectionBeamModel
        ? input.model
        : input.model
          ? new CrackedSectionBeamModel(input.model)
          : null;
    const analysis = new CrackedSectionDeflectionAnalysis({
      code: input.code ?? "NTC2018",
      metadata: input.metadata ?? model?.metadata ?? {},
    }).analyze({
      beamId: model?.id ?? null,
      analysisResult: input.analysisResult ?? model?.analysisResult ?? null,
      section: input.section ?? model?.section ?? null,
      concreteMaterial: input.concreteMaterial ?? model?.concreteMaterial,
      reinforcementMaterial: input.reinforcementMaterial ?? model?.reinforcementMaterial,
      serviceability: input.serviceability ?? model?.serviceability ?? {},
      mesh: input.mesh ?? model?.mesh ?? { targetFiberCount: 100 },
      solver: input.solver ?? model?.solver ?? { tolerance: 1e-2, maxIterations: 50 },
      beamModel: input.beamModel ?? model?.beamModel ?? model?.beamInput ?? null,
      hyperstatic: input.hyperstatic ?? model?.hyperstatic ?? null,
      performanceProfile: input.performanceProfile ?? model?.performanceProfile ?? null,
      sampling: input.sampling ?? model?.sampling ?? {},
      output: input.output ?? model?.output ?? {},
    });

    return analysis;
  }
}
