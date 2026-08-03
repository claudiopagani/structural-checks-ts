// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-beams/TimberBeamApplication.js.

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import type { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  TimberBeamVerification,
  type TimberBeamVerificationInput,
  type TimberBeamVerificationOptions,
} from "./checks/TimberBeamVerification.js";

type JsonRecord = Record<string, unknown>;
type TimberBeamSection = TimberBeamVerificationInput["section"];
type TimberBeamMaterial = TimberBeamVerificationInput["material"];
type TimberBeamAnalysisResult = TimberBeamVerificationInput["analysisResult"];

export interface TimberBeamApplicationModel extends JsonRecord {
  id?: unknown;
  section?: TimberBeamSection;
  material?: TimberBeamMaterial;
  analysisResult?: TimberBeamAnalysisResult;
}

export interface TimberBeamApplicationInput extends JsonRecord {
  code?: unknown;
  model?: TimberBeamApplicationModel;
  section?: TimberBeamSection;
  material?: TimberBeamMaterial;
  analysisResult?: TimberBeamAnalysisResult;
  serviceability?: unknown;
  stability?: TimberBeamVerificationOptions["stability"];
  verificationStations?: TimberBeamVerificationInput["verificationStations"];
  deflectionLimitRatio?: unknown;
}

export class TimberBeamApplication extends StructuralApplication {
  constructor() {
    super({
      id: "timber-beams",
      name: "Timber Beams",
      description: "Verification workflow for timber beams in bending and shear.",
      domain: "timber",
      supportedCodes: ["NTC2018", "Eurocode 5"],
      tags: ["timber", "beam", "kmod", "serviceability"],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "solid and glulam timber checks",
          "instantaneous and final deflection",
          "lateral torsional stability assumptions",
          "service class and duration handling",
        ],
      },
    });
  }

  override run(input: TimberBeamApplicationInput = {}): CalculationResult {
    const verificationInput: TimberBeamVerificationInput & JsonRecord = {
      beamId: input.model?.id ?? null,
      section: input.section ?? input.model?.section ?? null,
      material: input.material ?? input.model?.material ?? null,
      analysisResult: input.analysisResult ?? input.model?.analysisResult ?? null,
      ...(input.serviceability !== undefined ? { serviceability: input.serviceability } : {}),
      ...(input.stability !== undefined ? { stability: input.stability } : {}),
      ...(input.verificationStations !== undefined
        ? { verificationStations: input.verificationStations }
        : {}),
      ...(input.deflectionLimitRatio !== undefined
        ? { deflectionLimitRatio: input.deflectionLimitRatio }
        : {}),
    };
    const verification = new TimberBeamVerification({
      code: input.code ?? "NTC2018",
    }).verify(verificationInput);

    if (verification.status !== RESULT_STATUS.NOT_IMPLEMENTED) {
      return verification;
    }

    return this.createPlaceholderResult({
      summary:
        "Timber beam module scaffold created with placeholders for resistance and deformation checks.",
      warnings: verification.warnings,
      outputs: {
        beamId: input.model?.id ?? null,
        verification: verification.toJSON(),
      },
      assumptions: [
        "The existing timber material hierarchy will be reused as the primary material source.",
      ],
    });
  }
}
