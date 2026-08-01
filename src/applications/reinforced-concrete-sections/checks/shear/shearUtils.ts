import {
  isFinitePositive,
  round,
  utilizationCheck as createUtilizationCheck,
  type UtilizationCheck,
  type UtilizationCheckOptions,
} from "../../../../core/results/checkUtils.js";

export { isFinitePositive, round };

export const DEFAULT_RC_SHEAR_UNITS = Object.freeze({
  force: "N",
  length: "mm",
} as const);

export const COSENZA_METHOD = "cosenza-et-al-2016";

export function utilizationCheck(options: UtilizationCheckOptions): UtilizationCheck {
  return createUtilizationCheck({
    ...options,
    strictCapacity: false,
  });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function requiredParametersMissing<TParameters extends Record<string, unknown>>(
  params: TParameters,
  requiredKeys: (keyof TParameters & string)[],
  warnings: string[],
): string[] {
  const missing = requiredKeys.filter((key) => !isFinitePositive(params[key]));

  for (const key of missing) {
    warnings.push(`Required shear parameter ${key} is missing or not positive.`);
  }

  return missing;
}
