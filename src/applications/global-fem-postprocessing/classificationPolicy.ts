// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import type { GlobalFemClassificationPolicy } from "./GlobalFemPostProcessingTypes.js";

export const GLOBAL_FEM_CLASSIFICATION_PROPOSAL_VERSION = 0;

export const GLOBAL_FEM_POSTPROCESSING_PROFILES = Object.freeze({
  DEMAND_ONLY: "demand-only",
  ASSISTED: "assisted",
  CONFIRMED: "confirmed",
} as const);

export const GLOBAL_FEM_POSTPROCESSING_PROFILE_VALUES = Object.freeze([
  GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
] as const);

export const DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY: GlobalFemClassificationPolicy =
  Object.freeze({
    line: Object.freeze({
      verticalToleranceDegrees: 10,
      horizontalToleranceDegrees: 10,
      maximumBeamInclinationDegrees: null,
      groupingAngleToleranceDegrees: 1,
    }),
    shell: Object.freeze({
      horizontalPlaneToleranceDegrees: 10,
      verticalPlaneToleranceDegrees: 10,
      groupingNormalToleranceDegrees: 1,
      coplanarityTolerance: null,
    }),
    storeys: Object.freeze({
      elevationTolerance: null,
      relativeElevationTolerance: 1e-8,
    }),
    joints: Object.freeze({
      minimumIncidentLineElements: 2,
    }),
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueAt(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function finiteInRange(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be finite and between ${minimum} and ${maximum}.`);
  }
  return number;
}

function optionalPositive(value: unknown, label: string): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be null or a positive finite value.`);
  }
  return number;
}

export function normalizeGlobalFemClassificationPolicy(
  input: unknown = {},
): GlobalFemClassificationPolicy {
  const source = isRecord(input) ? input : {};
  const lineInput = isRecord(source.line) ? source.line : {};
  const shellInput = isRecord(source.shell) ? source.shell : {};
  const storeysInput = isRecord(source.storeys) ? source.storeys : {};
  const jointsInput = isRecord(source.joints) ? source.joints : {};

  const maximumBeamInclinationInput =
    valueAt(lineInput, "maximumBeamInclinationDegrees") ??
    DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.line.maximumBeamInclinationDegrees;
  const line = {
    verticalToleranceDegrees: finiteInRange(
      valueAt(lineInput, "verticalToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.line.verticalToleranceDegrees,
      "classificationPolicy.line.verticalToleranceDegrees",
      0,
      45,
    ),
    horizontalToleranceDegrees: finiteInRange(
      valueAt(lineInput, "horizontalToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.line.horizontalToleranceDegrees,
      "classificationPolicy.line.horizontalToleranceDegrees",
      0,
      45,
    ),
    maximumBeamInclinationDegrees: maximumBeamInclinationInput == null ? null : 0,
    groupingAngleToleranceDegrees: finiteInRange(
      valueAt(lineInput, "groupingAngleToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.line.groupingAngleToleranceDegrees,
      "classificationPolicy.line.groupingAngleToleranceDegrees",
      0,
      45,
    ),
  };

  if (line.maximumBeamInclinationDegrees != null) {
    line.maximumBeamInclinationDegrees = finiteInRange(
      maximumBeamInclinationInput,
      "classificationPolicy.line.maximumBeamInclinationDegrees",
      line.horizontalToleranceDegrees,
      90 - line.verticalToleranceDegrees,
    );
  }

  const shell = {
    horizontalPlaneToleranceDegrees: finiteInRange(
      valueAt(shellInput, "horizontalPlaneToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.shell.horizontalPlaneToleranceDegrees,
      "classificationPolicy.shell.horizontalPlaneToleranceDegrees",
      0,
      45,
    ),
    verticalPlaneToleranceDegrees: finiteInRange(
      valueAt(shellInput, "verticalPlaneToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.shell.verticalPlaneToleranceDegrees,
      "classificationPolicy.shell.verticalPlaneToleranceDegrees",
      0,
      45,
    ),
    groupingNormalToleranceDegrees: finiteInRange(
      valueAt(shellInput, "groupingNormalToleranceDegrees") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.shell.groupingNormalToleranceDegrees,
      "classificationPolicy.shell.groupingNormalToleranceDegrees",
      0,
      45,
    ),
    coplanarityTolerance: optionalPositive(
      valueAt(shellInput, "coplanarityTolerance") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.shell.coplanarityTolerance,
      "classificationPolicy.shell.coplanarityTolerance",
    ),
  };

  const storeys = {
    elevationTolerance: optionalPositive(
      valueAt(storeysInput, "elevationTolerance") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.storeys.elevationTolerance,
      "classificationPolicy.storeys.elevationTolerance",
    ),
    relativeElevationTolerance: finiteInRange(
      valueAt(storeysInput, "relativeElevationTolerance") ??
        DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.storeys.relativeElevationTolerance,
      "classificationPolicy.storeys.relativeElevationTolerance",
      Number.EPSILON,
      0.01,
    ),
  };

  const incidentCount = Number(
    valueAt(jointsInput, "minimumIncidentLineElements") ??
      DEFAULT_GLOBAL_FEM_CLASSIFICATION_POLICY.joints.minimumIncidentLineElements,
  );
  if (!Number.isInteger(incidentCount) || incidentCount < 2) {
    throw new Error(
      "classificationPolicy.joints.minimumIncidentLineElements must be an integer of at least 2.",
    );
  }

  return {
    line,
    shell,
    storeys,
    joints: { minimumIncidentLineElements: incidentCount },
  };
}
