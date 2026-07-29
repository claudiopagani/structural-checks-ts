export { CalculationResult } from "./core/results/CalculationResult.js";
export { VerificationResult } from "./core/results/VerificationResult.js";
export {
  RESULT_STATUS,
  RESULT_STATUS_FAILED,
  RESULT_STATUS_NOT_ANALYZED,
  RESULT_STATUS_NOT_IMPLEMENTED,
  RESULT_STATUS_NOT_SUPPORTED,
  RESULT_STATUS_NOT_VERIFIED,
  RESULT_STATUS_OK,
  RESULT_STATUS_VALUES,
  isResultStatus,
} from "./core/results/resultStatus.js";
export {
  assertPositive as assertPositiveCheckValue,
  governingCheck,
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
} from "./core/results/checkUtils.js";
export {
  FORCE_UNIT_FACTORS,
  LENGTH_UNIT_FACTORS,
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  normalizeUnitSystem,
} from "./domain/units/UnitSystem.js";

export type {
  CalculationResultJson,
  CalculationResultOptions,
} from "./core/results/CalculationResult.js";
export type {
  VerificationCheck,
  VerificationResultJson,
  VerificationResultOptions,
} from "./core/results/VerificationResult.js";
export type { UtilizationCheck, UtilizationCheckOptions } from "./core/results/checkUtils.js";
export type { ResultStatus } from "./core/results/resultStatus.js";
export type {
  ForceUnit,
  LengthUnit,
  UnitExponents,
  UnitResolver,
  UnitSystem,
  UnitSystemInput,
} from "./domain/units/UnitSystem.js";
