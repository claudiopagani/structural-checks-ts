// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import {
  validateFemCapabilitiesContract,
  validateFemEntityMappingContract,
  validateGlobalFemAnalysisContract,
  validateGlobalFemModelContract,
  validateGlobalFemResultContract,
} from "../../domain/fem/index.js";
import { extractGlobalFemDemands } from "./GlobalFemDemandExtractor.js";
import { classifyGlobalFemStructuralEntities } from "./GlobalFemStructuralClassifier.js";
import { evaluateGlobalFemVerificationReadiness } from "./GlobalFemVerificationReadiness.js";
import {
  GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES,
} from "./classificationPolicy.js";
import type {
  GlobalFemClassificationDiagnostic,
  GlobalFemPostProcessingInput,
  GlobalFemPostProcessingOutputs,
  GlobalFemStructuralClassificationProposal,
  GlobalFemValidationSet,
} from "./GlobalFemPostProcessingTypes.js";
import type {
  FemDiagnostic,
  FemValidationResult,
  GlobalFemResultContract,
  GlobalFemModelContract,
} from "../../domain/fem/contracts/FemContractTypes.js";

function demandOnlyClassification(
  model: GlobalFemModelContract,
): GlobalFemStructuralClassificationProposal {
  return {
    schema: "strutture-js/fem-structural-classification-proposal",
    version: GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION,
    modelId: model.id,
    modelHash: model.hash,
    policy: null,
    members: [],
    surfaces: [],
    storeys: [],
    diaphragms: [],
    joints: [],
    diagnostics: [],
    warnings: [],
    summary: { confirmed: 0, proposed: 0, ambiguous: 0 },
    metadata: { skippedForDemandOnlyProfile: true },
  };
}

function confirmedOnlyClassification(
  proposal: GlobalFemStructuralClassificationProposal,
): GlobalFemStructuralClassificationProposal {
  const members = proposal.members.filter((item) => item.classification.status === "confirmed");
  const surfaces = proposal.surfaces.filter((item) => item.classification.status === "confirmed");
  const storeys = proposal.storeys.filter((item) => item.classification.status === "confirmed");
  const diaphragms = proposal.diaphragms.filter(
    (item) => item.classification.status === "confirmed",
  );
  const joints = proposal.joints.filter((item) => item.classification.status === "confirmed");
  const confirmed = { members, surfaces, storeys, diaphragms, joints };
  return {
    ...proposal,
    ...confirmed,
    warnings: [],
    summary: {
      confirmed: Object.values(confirmed).flat().length,
      proposed: 0,
      ambiguous: 0,
    },
    metadata: { confirmedEntitiesOnly: true },
  };
}

interface SerializedValidationSummary {
  readonly ok: boolean;
  readonly errors: readonly FemDiagnostic[];
  readonly warnings: readonly FemDiagnostic[];
}

function validationSummary(
  validation: FemValidationResult<unknown> | null,
): SerializedValidationSummary | null {
  if (!validation) return null;
  return {
    ok: validation.ok,
    errors: validation.errors.map((item) => ({ ...item })),
    warnings: validation.warnings.map((item) => ({ ...item })),
  };
}

function validateContracts(input: GlobalFemPostProcessingInput): GlobalFemValidationSet {
  const capabilities = validateFemCapabilitiesContract(input.capabilities);
  const model = validateGlobalFemModelContract(input.model);
  const analysis = validateGlobalFemAnalysisContract(input.analysis, {
    model: model.ok ? model.value : null,
    capabilities: capabilities.ok ? capabilities.value : null,
  });
  const mapping =
    input.mapping == null
      ? null
      : validateFemEntityMappingContract(input.mapping, {
          model: model.ok ? model.value : null,
        });
  const result = validateGlobalFemResultContract(input.result, {
    model: model.ok ? model.value : null,
    analysis: analysis.ok ? analysis.value : null,
    capabilities: capabilities.ok ? capabilities.value : null,
    mapping: mapping?.ok ? mapping.value : null,
  });
  return { capabilities, model, analysis, mapping, result };
}

function coreContractsAreValid(validations: GlobalFemValidationSet): boolean {
  return (
    validations.capabilities.ok &&
    validations.model.ok &&
    validations.analysis.ok &&
    validations.result.ok
  );
}

function collectWarnings(
  validations: GlobalFemValidationSet,
  classification: GlobalFemStructuralClassificationProposal | null = null,
  technicalResult: GlobalFemResultContract | null = null,
): readonly (FemDiagnostic | GlobalFemClassificationDiagnostic)[] {
  return [
    ...[
      validations.capabilities,
      validations.model,
      validations.analysis,
      validations.mapping,
      validations.result,
    ].flatMap((validation) => (validation ? validation.warnings.map((item) => ({ ...item })) : [])),
    ...(classification?.warnings ?? []).map((item) => ({ ...item })),
    ...(technicalResult?.status === "partial"
      ? [
          {
            code: "FEM_ANALYSIS_PARTIAL",
            path: "$.result.status",
            message:
              "The FEM result is partial; only assessments whose declared capabilities and data are present can be ready.",
          },
        ]
      : []),
  ];
}

function validatedValue<T>(validation: FemValidationResult<T>): T {
  if (!validation.ok || validation.value === null) {
    throw new Error("A successful FEM contract validation did not provide a value.");
  }
  return validation.value;
}

export class GlobalFemPostProcessingApplication extends StructuralApplication {
  constructor() {
    super({
      id: "global-fem-postprocessing",
      name: "Global FEM Postprocessing",
      description:
        "Solver-neutral validation, assisted structural classification and demand extraction from global FEM contracts.",
      domain: "fem",
      supportedCodes: ["method-neutral"],
      tags: ["fem", "postprocessing", "classification", "demand-extraction", "readiness"],
      metadata: {
        maturity: "partial",
        limitations: [
          "assisted classifications are proposals and never authorize final normative verification",
          "reinforcement, ductility, use and seismic project data are never inferred",
          "global orchestration of reinforced-concrete normative checks is not implemented",
        ],
      },
    });
  }

  override run(
    input?: GlobalFemPostProcessingInput,
  ): CalculationResult<GlobalFemPostProcessingOutputs>;
  override run(input: GlobalFemPostProcessingInput = {}): CalculationResult {
    const profile = input.profile ?? GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED;
    if (!GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES.includes(profile)) {
      throw new Error(`Unsupported global FEM postprocessing profile: ${profile}.`);
    }
    const validations = validateContracts(input);
    const validationEntries: readonly (readonly [string, FemValidationResult<unknown> | null])[] = [
      ["capabilities", validations.capabilities],
      ["model", validations.model],
      ["analysis", validations.analysis],
      ["mapping", validations.mapping],
      ["result", validations.result],
    ];
    const serializedValidations = Object.fromEntries(
      validationEntries.map(([name, validation]) => [name, validationSummary(validation)]),
    );

    if (!coreContractsAreValid(validations)) {
      const errors = [
        validations.capabilities,
        validations.model,
        validations.analysis,
        validations.mapping,
        validations.result,
      ].flatMap((validation) => (validation ? validation.errors.map((item) => ({ ...item })) : []));
      return new CalculationResult({
        applicationId: this.id,
        status: RESULT_STATUS.NOT_ANALYZED,
        summary:
          "Global FEM postprocessing was not run because one or more core contracts are invalid.",
        outputs: { profile, validations: serializedValidations },
        warnings: [...collectWarnings(validations), ...errors],
        assumptions: [],
        metadata: { domain: this.domain, normativeVerificationPerformed: false },
      });
    }

    const capabilities = validatedValue(validations.capabilities);
    const model = validatedValue(validations.model);
    const analysis = validatedValue(validations.analysis);
    const result = validatedValue(validations.result);
    const mapping = validations.mapping?.value ?? null;
    const classificationProposal =
      profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY
        ? demandOnlyClassification(model)
        : classifyGlobalFemStructuralEntities({
            model,
            mapping,
            policy: input.classificationPolicy,
          });
    const classification =
      profile === GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED
        ? confirmedOnlyClassification(classificationProposal)
        : classificationProposal;
    const demands = extractGlobalFemDemands({ model, analysis, result, classification });
    const readiness = evaluateGlobalFemVerificationReadiness({
      profile,
      validations,
      mappingValidation: validations.mapping,
      classification,
      capabilities,
      model,
      analysis,
      result,
      projectContext: input.projectContext,
      designData: input.designData,
      requestedAssessments: input.requestedAssessments,
    });
    const ready = readiness.readyForRequestedProcessing;

    return new CalculationResult({
      applicationId: this.id,
      status: ready ? RESULT_STATUS.OK : RESULT_STATUS.NOT_ANALYZED,
      summary: ready
        ? "Global FEM contracts were postprocessed; no normative verification was performed."
        : "Global FEM contracts were read, but requested processing is incomplete.",
      outputs: {
        profile,
        validations: serializedValidations,
        classification,
        demands,
        readiness,
      },
      warnings: [...collectWarnings(validations, classification, result)],
      assumptions: [
        "Geometric classifications are non-normative proposals until confirmed by an explicit mapping.",
        "Element actions and shell resultants retain the solver-neutral contract sign conventions and local axes.",
      ],
      metadata: {
        domain: this.domain,
        normativeVerificationPerformed: false,
        classificationProposalVersion: classification.version,
        demandSetVersion: demands.version,
        readinessReportVersion: readiness.version,
      },
    });
  }
}
