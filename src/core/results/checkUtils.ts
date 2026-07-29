export function round(value: number, decimals?: number): number;
export function round<T>(value: T, decimals?: number): T | number;
export function round(value: unknown, decimals = 6): unknown {
  return Number.isFinite(value) ? Number((value as number).toFixed(decimals)) : value;
}

export function assertPositive(value: unknown, label: string): asserts value is number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

export function isFinitePositive(value: unknown): value is number {
  return Number.isFinite(value) && (value as number) > 0;
}

export interface UtilizationCheckOptions {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  metadata?: Record<string, unknown>;
  strictCapacity?: boolean;
}

export interface UtilizationCheck extends Record<string, unknown> {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  utilizationRatio: number | null;
  ok: boolean;
  metadata: Record<string, unknown>;
}

export function utilizationCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
  strictCapacity = true,
}: UtilizationCheckOptions): UtilizationCheck {
  if (strictCapacity) {
    assertPositive(capacity, `${id} capacity`);
  }

  const utilizationRatio = isFinitePositive(capacity) ? Math.abs(demand) / capacity : null;

  return {
    id,
    description,
    demand: round(Math.abs(demand)),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok: Number.isFinite(utilizationRatio) && (utilizationRatio as number) <= 1,
    metadata,
  };
}

export function governingCheck<TCheck extends { utilizationRatio: unknown }>(
  checks: readonly TCheck[],
): TCheck | null {
  return checks.reduce<TCheck | null>((selected, check) => {
    if (!Number.isFinite(check.utilizationRatio)) {
      return selected;
    }

    if (
      selected === null ||
      (check.utilizationRatio as number) > (selected.utilizationRatio as number)
    ) {
      return check;
    }

    return selected;
  }, null);
}

export function uniqueStrings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
}
