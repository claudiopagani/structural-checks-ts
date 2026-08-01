/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises */
// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// @ts-nocheck
export {
  FEM_ANALYSIS_CAPABILITY_KEYS,
  FEM_ANALYSIS_TYPES,
  FEM_CONTRACT_SCHEMAS,
  FEM_ELEMENT_CAPABILITY_KEYS,
  FEM_RESULT_CAPABILITY_KEYS,
  FEM_RESULT_STATUS_VALUES,
  GLOBAL_FEM_CONTRACT_VERSION,
  GLOBAL_FEM_REQUIRED_UNIT_KEYS,
} from "./FemContractValidation.js";
export {
  createFemCapabilitiesContract,
  validateFemCapabilitiesContract,
} from "./FemCapabilitiesContract.js";
export {
  createGlobalFemModelContract,
  validateGlobalFemModelContract,
} from "./GlobalFemModelContract.js";
export {
  createGlobalFemAnalysisContract,
  validateGlobalFemAnalysisContract,
} from "./GlobalFemAnalysisContract.js";
export {
  createFemEntityMappingContract,
  validateFemEntityMappingContract,
} from "./FemEntityMappingContract.js";
export {
  createGlobalFemResultContract,
  validateGlobalFemResultContract,
} from "./GlobalFemResultContract.js";
export {
  createGlobalFemContractSet,
  validateGlobalFemContractSet,
} from "./GlobalFemContractSet.js";
