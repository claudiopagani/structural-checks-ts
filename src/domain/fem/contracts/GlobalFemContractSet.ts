// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
import {
  createFemCapabilitiesContract,
  validateFemCapabilitiesContract,
} from "./FemCapabilitiesContract.js";
import {
  createFemEntityMappingContract,
  validateFemEntityMappingContract,
} from "./FemEntityMappingContract.js";
import {
  createGlobalFemAnalysisContract,
  validateGlobalFemAnalysisContract,
} from "./GlobalFemAnalysisContract.js";
import {
  createGlobalFemModelContract,
  validateGlobalFemModelContract,
} from "./GlobalFemModelContract.js";
import {
  createGlobalFemResultContract,
  validateGlobalFemResultContract,
} from "./GlobalFemResultContract.js";
import { isRecord } from "./FemContractValidation.js";
import type {
  FemCapabilitiesContract,
  FemContractSet,
  FemDiagnostic,
  FemEntityMappingContract,
  FemValidationResult,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
  GlobalFemResultContract,
} from "./FemContractTypes.js";

type ContractValidations = {
  readonly capabilities: FemValidationResult<FemCapabilitiesContract>;
  readonly model: FemValidationResult<GlobalFemModelContract>;
  readonly analysis: FemValidationResult<GlobalFemAnalysisContract>;
  readonly mapping: FemValidationResult<FemEntityMappingContract>;
  readonly result: FemValidationResult<GlobalFemResultContract>;
};

export interface GlobalFemContractSetValidation extends FemValidationResult<FemContractSet> {
  readonly contracts: ContractValidations;
}

function field(input: unknown, key: string): unknown {
  if (isRecord(input)) return input[key];
  return undefined;
}

export function validateGlobalFemContractSet(input: unknown = {}): GlobalFemContractSetValidation {
  const capabilities = validateFemCapabilitiesContract(field(input, "capabilities"));
  const model = validateGlobalFemModelContract(field(input, "model"));
  const analysis = validateGlobalFemAnalysisContract(field(input, "analysis"), {
    model: model.value,
    capabilities: capabilities.value,
  });
  const mapping = validateFemEntityMappingContract(field(input, "mapping"), {
    model: model.value,
  });
  const result = validateGlobalFemResultContract(field(input, "result"), {
    model: model.value,
    analysis: analysis.value,
    capabilities: capabilities.value,
    mapping: mapping.value,
  });
  const contracts: ContractValidations = { capabilities, model, analysis, mapping, result };
  const validations = Object.values(contracts);
  const errors: FemDiagnostic[] = validations.flatMap((validation) => [...validation.errors]);
  const warnings: FemDiagnostic[] = validations.flatMap((validation) => [...validation.warnings]);
  const complete = Object.values(contracts).every((validation) => validation.value !== null);

  return {
    ok: errors.length === 0,
    value: complete
      ? {
          capabilities: capabilities.value as FemCapabilitiesContract,
          model: model.value as GlobalFemModelContract,
          analysis: analysis.value as GlobalFemAnalysisContract,
          mapping: mapping.value as FemEntityMappingContract,
          result: result.value as GlobalFemResultContract,
        }
      : null,
    errors,
    warnings,
    contracts,
  };
}

export function createGlobalFemContractSet(input: unknown = {}): FemContractSet {
  const capabilities = createFemCapabilitiesContract(field(input, "capabilities"));
  const model = createGlobalFemModelContract(field(input, "model"));
  const analysis = createGlobalFemAnalysisContract(field(input, "analysis"), {
    model,
    capabilities,
  });
  const mapping = createFemEntityMappingContract(field(input, "mapping"), { model });
  const result = createGlobalFemResultContract(field(input, "result"), {
    model,
    analysis,
    capabilities,
    mapping,
  });

  return { capabilities, model, analysis, mapping, result };
}
