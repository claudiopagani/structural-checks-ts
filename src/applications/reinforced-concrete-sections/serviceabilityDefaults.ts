export const DEFAULT_RC_SLE_MODULAR_RATIO = 15;

export function resolveRcSleModularRatio(...candidates: (number | null | undefined)[]): number {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && (candidate as number) > 0) {
      return candidate as number;
    }
  }

  return DEFAULT_RC_SLE_MODULAR_RATIO;
}
