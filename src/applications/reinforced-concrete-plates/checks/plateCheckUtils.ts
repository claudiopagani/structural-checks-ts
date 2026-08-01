import type { RcPlateCheck, RcPlateCheckMetadata } from "../types.js";

export function enrichPlateCheck(
  check: RcPlateCheck,
  {
    id,
    direction,
    face,
    analysisType,
    combinationType,
    stateId,
    method,
  }: RcPlateCheckMetadata = {},
): RcPlateCheck {
  return {
    ...check,
    id: id ?? check.id,
    direction,
    face,
    analysisType,
    combinationType,
    method,
    metadata: {
      ...(check.metadata ?? {}),
      sourceMethod: check.metadata?.method ?? check.method ?? null,
      direction,
      face,
      analysisType,
      combinationType,
      stateId,
      method,
    },
  };
}

export function uniqueStrings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
}
