import test from "node:test";
import {
  validateFemCapabilitiesContract,
  validateFemEntityMappingContract,
  validateGlobalFemAnalysisContract,
  validateGlobalFemContractSet,
  validateGlobalFemModelContract,
  validateGlobalFemResultContract,
} from "../dist/index.js";
import type {
  FemCapabilitiesContract,
  FemContractSet,
  FemEntityMappingContract,
  FemResultStatus,
  FemUnitSystem,
  FemValidationResult,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
  GlobalFemResultContract,
} from "../dist/index.js";
import type {
  createFemCapabilitiesContract,
  createFemEntityMappingContract,
  createGlobalFemAnalysisContract,
  createGlobalFemContractSet,
  createGlobalFemModelContract,
  createGlobalFemResultContract,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<T extends U, U> = T;

type FactoryInputsAreNotAny = [
  AssertFalse<IsAny<Parameters<typeof createFemCapabilitiesContract>[0]>>,
  AssertFalse<IsAny<Parameters<typeof createFemEntityMappingContract>[0]>>,
  AssertFalse<IsAny<Parameters<typeof createGlobalFemAnalysisContract>[0]>>,
  AssertFalse<IsAny<Parameters<typeof createGlobalFemContractSet>[0]>>,
  AssertFalse<IsAny<Parameters<typeof createGlobalFemModelContract>[0]>>,
  AssertFalse<IsAny<Parameters<typeof createGlobalFemResultContract>[0]>>,
];

type FactoryResultsAreUseful = [
  AssertExtends<ReturnType<typeof createFemCapabilitiesContract>, FemCapabilitiesContract>,
  AssertExtends<ReturnType<typeof createFemEntityMappingContract>, FemEntityMappingContract>,
  AssertExtends<ReturnType<typeof createGlobalFemAnalysisContract>, GlobalFemAnalysisContract>,
  AssertExtends<ReturnType<typeof createGlobalFemContractSet>, FemContractSet>,
  AssertExtends<ReturnType<typeof createGlobalFemModelContract>, GlobalFemModelContract>,
  AssertExtends<ReturnType<typeof createGlobalFemResultContract>, GlobalFemResultContract>,
];

type ValidatorsAcceptUnknown = [
  AssertExtends<Parameters<typeof validateFemCapabilitiesContract>[0], unknown>,
  AssertExtends<Parameters<typeof validateFemEntityMappingContract>[0], unknown>,
  AssertExtends<Parameters<typeof validateGlobalFemAnalysisContract>[0], unknown>,
  AssertExtends<Parameters<typeof validateGlobalFemContractSet>[0], unknown>,
  AssertExtends<Parameters<typeof validateGlobalFemModelContract>[0], unknown>,
  AssertExtends<Parameters<typeof validateGlobalFemResultContract>[0], unknown>,
];

function consumerProof(input: unknown): void {
  const capabilities: FemValidationResult<FemCapabilitiesContract> =
    validateFemCapabilitiesContract(input);
  const model: FemValidationResult<GlobalFemModelContract> = validateGlobalFemModelContract(input);
  const analysis: FemValidationResult<GlobalFemAnalysisContract> =
    validateGlobalFemAnalysisContract(input);
  const mapping: FemValidationResult<FemEntityMappingContract> =
    validateFemEntityMappingContract(input);
  const result: FemValidationResult<GlobalFemResultContract> =
    validateGlobalFemResultContract(input);
  const set = validateGlobalFemContractSet(input);

  if (capabilities.value !== null) {
    const solverId: string = capabilities.value.solver.id;
    void solverId;
  }
  if (model.value !== null) {
    const units: FemUnitSystem = model.value.units;
    void units;
  }
  if (analysis.value !== null && result.value !== null) {
    const status: FemResultStatus = result.value.status;
    const modelId: string = analysis.value.modelId;
    void status;
    void modelId;
  }
  if (mapping.value !== null && set.value !== null) {
    const contractSet: FemContractSet = set.value;
    void contractSet;
  }
}

void consumerProof;
void (null as unknown as FactoryInputsAreNotAny);
void (null as unknown as FactoryResultsAreUseful);
void (null as unknown as ValidatorsAcceptUnknown);

void test("FEM contract declarations expose typed consumer boundaries", () => {
  // The assertions above are the test; this runtime body keeps the file in the test campaign.
});
