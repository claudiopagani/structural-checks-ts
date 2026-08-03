// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/SteelFrameApplication.js.

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import {
  SteelMemberVerification,
  type SteelMemberVerificationInput,
} from "./checks/SteelMemberVerification.js";
import {
  SteelRingFramePushoverAnalysis,
  type SteelRingFramePushoverAnalysisResult,
} from "./analysis/SteelRingFramePushoverAnalysis.js";
import {
  SteelRingFramePushoverModel,
  type SteelRingFramePushoverModelOptions,
} from "./models/SteelRingFramePushoverModel.js";
import type {
  SteelMemberVerificationPolicyMaterial,
  SteelMemberVerificationPolicySection,
} from "./checks/SteelMemberVerificationPolicies.js";
import type { SteelMemberVerificationServiceabilityOptions } from "./checks/SteelMemberVerification.js";
import type { UnitSystemInput } from "../../domain/units/UnitSystem.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";

type JsonRecord = Record<string, unknown>;

export interface SteelFrameApplicationInput extends SteelMemberVerificationInput, JsonRecord {
  id?: string | number | bigint;
  units?: UnitSystemInput | null;
  analysisType?: string;
  code?: string;
  loadCombinations?: readonly unknown[];
  model?: unknown;
  serviceability?: SteelMemberVerificationServiceabilityOptions;
  section?: SteelMemberVerificationPolicySection | null;
  material?: SteelMemberVerificationPolicyMaterial | null;
  analysisResult?: JsonRecord | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function modelProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined;
}

function isSteelRingFramePushoverModelOptions(
  value: unknown,
): value is SteelRingFramePushoverModelOptions {
  if (!isRecord(value)) {
    return false;
  }

  const id = Reflect.get(value, "id");
  return typeof id === "string" || typeof id === "number" || typeof id === "bigint";
}

function isRingFramePushoverInput(input: SteelFrameApplicationInput): boolean {
  const modelMetadata = modelProperty(input.model, "metadata");
  return (
    input.model instanceof SteelRingFramePushoverModel ||
    input.analysisType === "steel-ring-frame-pushover" ||
    modelProperty(modelMetadata, "analysisType") === "steel-ring-frame-pushover"
  );
}

function resolveRingFrameModelInput(
  input: SteelFrameApplicationInput,
): SteelRingFramePushoverModel | SteelRingFramePushoverModelOptions {
  if (input.model instanceof SteelRingFramePushoverModel) {
    return input.model;
  }

  if (isSteelRingFramePushoverModelOptions(input.model)) {
    return input.model;
  }

  if (input.model !== undefined && input.model !== null) {
    return { id: "" };
  }

  return isSteelRingFramePushoverModelOptions(input) ? input : { id: "" };
}

function modelSection(value: unknown): SteelMemberVerificationPolicySection | null {
  const section = modelProperty(value, "section");
  return isRecord(section) ? section : null;
}

function modelMaterial(value: unknown): SteelMemberVerificationPolicyMaterial | null {
  const material = modelProperty(value, "material");
  return isRecord(material) ? material : null;
}

function modelRecord(value: unknown, key: string): JsonRecord | null {
  const property = modelProperty(value, key);
  return isRecord(property) ? property : null;
}

export class SteelFrameApplication extends StructuralApplication {
  constructor() {
    super({
      id: "steel-frames",
      name: "Steel Frames",
      description:
        "Global analysis and code checks for structural steel frames, members and standalone ring-frame pushover workflows.",
      domain: "steel",
      supportedCodes: ["NTC2018", "Eurocode"],
      tags: ["frames", "steel", "uls", "sls", "buckling", "pushover"],
      metadata: {
        maturity: "partial",
        plannedCapabilities: [
          "2D/3D frame analysis integration",
          "member resistance checks",
          "stability and buckling verifications",
          "connection-level verification hooks",
          "standalone pushover curves for steel ring frames around openings",
        ],
      },
    });
  }

  override run(input: SteelFrameApplicationInput = {}): CalculationResult {
    if (isRingFramePushoverInput(input)) {
      const result: SteelRingFramePushoverAnalysisResult =
        new SteelRingFramePushoverAnalysis().analyze({
          model: resolveRingFrameModelInput(input),
        });

      return new CalculationResult({
        applicationId: this.id,
        status: result.status,
        summary: result.summary,
        outputs: result.outputs,
        warnings: result.warnings,
        assumptions: result.assumptions,
        metadata: {
          domain: this.domain,
          ...result.metadata,
        },
      });
    }

    const verificationInput: SteelMemberVerificationInput = {
      memberId: input.memberId ?? null,
      combinations: input.loadCombinations ?? [],
      section: input.section ?? modelSection(input.model),
      material: input.material ?? modelMaterial(input.model),
      analysisResult: input.analysisResult ?? modelRecord(input.model, "analysisResult"),
      ...(input.serviceability === undefined ? {} : { serviceability: input.serviceability }),
      ...(input.classification === undefined ? {} : { classification: input.classification }),
      ...(input.resistance === undefined ? {} : { resistance: input.resistance }),
      ...(input.stability === undefined ? {} : { stability: input.stability }),
      ...(input.verificationStations === undefined
        ? {}
        : { verificationStations: input.verificationStations }),
      ...(input.deflectionLimitRatio === undefined
        ? {}
        : { deflectionLimitRatio: input.deflectionLimitRatio }),
    };
    const verification = new SteelMemberVerification({
      code: input.code ?? "NTC2018",
    }).verify(verificationInput);

    if (verification.status !== RESULT_STATUS.NOT_IMPLEMENTED) {
      return verification;
    }

    return this.createPlaceholderResult({
      summary:
        "Steel frame application scaffold created with placeholders for analysis and member verification.",
      warnings: verification.warnings,
      outputs: {
        modelId: modelProperty(input.model, "id") ?? null,
        verification: verification.toJSON(),
      },
      assumptions: [
        "Global finite element solving will be connected to StructuralModel or a dedicated frame solver.",
      ],
    });
  }
}
