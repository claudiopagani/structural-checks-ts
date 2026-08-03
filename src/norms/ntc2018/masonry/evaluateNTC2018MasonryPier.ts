// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/masonry/evaluateNTC2018MasonryPier.js.

import {
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierIrregularDiagonalCapacity,
  calculateNTC2018MasonryPierRegularDiagonalCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
  selectNTC2018MasonryPierGoverningCapacity,
  type NTC2018MasonryPierAvailableCapacity,
  type NTC2018MasonryPierCapacity,
  type NTC2018MasonryPierUnavailableCapacity,
} from "./ntc2018MasonryPierCapacity.js";
import {
  calculateNTC2018MasonryPierUltimateDisplacement,
  type NTC2018MasonryPierNormativeScope,
  type NTC2018MasonryPierUltimateDisplacement,
} from "./ntc2018MasonryPierDeformation.js";
import {
  calculateNTC2018MasonryPierElasticStiffness,
  type NTC2018MasonryPierElasticStiffness,
} from "./ntc2018MasonryPierStiffness.js";

export interface NTC2018MasonryPierGeometry {
  length: number;
  height: number;
  thickness: number;
  deformableHeight?: number;
  [key: string]: unknown;
}

export interface NTC2018MasonryPierMaterial {
  compressiveStrength?: number;
  cohesion?: number;
  shearStrengthLimit?: number;
  referenceShearStrength?: number;
  diagonalTensileStrength?: number | null;
  interlockingCoefficient?: number;
  localFrictionCoefficient?: number;
  blockTensileStrength?: number;
  elasticModulus?: number;
  shearModulus?: number;
  [key: string]: unknown;
}

export interface NTC2018MasonryPierActions {
  axialCompression?: number;
  shearAxialCompression?: number;
  [key: string]: unknown;
}

export interface NTC2018MasonryPierEvaluationOptions {
  masonryTexture?: string;
  boundaryCondition?: "cantilever" | "fixed-fixed";
  shearSpan?: number | null;
  shearCorrectionFactor?: number;
  crackedStiffnessFactor?: number;
  scope?: NTC2018MasonryPierNormativeScope;
  modernPerforatedBlocks?: boolean;
  [key: string]: unknown;
}

export interface EvaluateNTC2018MasonryPierOptions {
  geometry: NTC2018MasonryPierGeometry;
  material: NTC2018MasonryPierMaterial;
  actions: NTC2018MasonryPierActions;
  options?: NTC2018MasonryPierEvaluationOptions;
  lateralDisplacement?: number | null;
}

export interface NTC2018MasonryPierMissingInput {
  mechanism: string;
  parameters: string[];
}

export interface NTC2018MasonryPierResponse {
  displacement: number;
  force: number;
  tangent: number;
  branch: "failed" | "elastic" | "plastic-plateau";
}

export interface NTC2018MasonryPierCurvePoint {
  id: "origin" | "yield" | "ultimate";
  displacement: number;
  force: number;
}

export interface NTC2018MasonryPierIncompleteEvaluation {
  complete: false;
  geometry: NTC2018MasonryPierGeometry;
  actions: {
    axialCompression: number;
    shearAxialCompression: number;
  };
  options: NTC2018MasonryPierEvaluationOptions & {
    masonryTexture: string;
    boundaryCondition: "cantilever" | "fixed-fixed";
    shearSpan: number;
  };
  capacities: {
    flexural: NTC2018MasonryPierCapacity;
    sliding: NTC2018MasonryPierCapacity;
    diagonal: NTC2018MasonryPierCapacity;
  };
  governing: null;
  stiffness: null | NTC2018MasonryPierElasticStiffness;
  deformation: null;
  yieldDisplacement: null;
  curve: NTC2018MasonryPierCurvePoint[];
  response: null;
  missing: NTC2018MasonryPierMissingInput[];
}

export interface NTC2018MasonryPierCompleteEvaluation {
  complete: true;
  consistentBilinear: boolean;
  geometry: NTC2018MasonryPierGeometry;
  actions: {
    axialCompression: number;
    shearAxialCompression: number;
  };
  options: NTC2018MasonryPierEvaluationOptions & {
    masonryTexture: string;
    boundaryCondition: "cantilever" | "fixed-fixed";
    shearSpan: number;
  };
  capacities: {
    flexural: NTC2018MasonryPierCapacity;
    sliding: NTC2018MasonryPierCapacity;
    diagonal: NTC2018MasonryPierCapacity;
  };
  governing: Exclude<NTC2018MasonryPierCapacity, NTC2018MasonryPierUnavailableCapacity>;
  stiffness: NTC2018MasonryPierElasticStiffness;
  deformation: NTC2018MasonryPierUltimateDisplacement;
  yieldDisplacement: number;
  curve: NTC2018MasonryPierCurvePoint[];
  response: NTC2018MasonryPierResponse | null;
  missing: never[];
}

export type NTC2018MasonryPierEvaluation =
  | NTC2018MasonryPierIncompleteEvaluation
  | NTC2018MasonryPierCompleteEvaluation;

function normalizeTexture(value: unknown = "irregular"): string {
  const normalized = String(value).trim().toLowerCase();

  if (normalized !== "irregular" && normalized !== "regular") {
    throw new Error(`Unsupported masonryTexture: ${String(value)}.`);
  }

  return normalized;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

function responseAtDisplacement({
  displacement,
  stiffness,
  resistance,
  yieldDisplacement,
  ultimateDisplacement,
}: {
  displacement: number | null;
  stiffness: number;
  resistance: number;
  yieldDisplacement: number;
  ultimateDisplacement: number;
}): NTC2018MasonryPierResponse | null {
  if (!isFiniteNumber(displacement)) return null;

  const sign = displacement < 0 ? -1 : 1;
  const absoluteDisplacement = Math.abs(displacement);

  if (absoluteDisplacement > ultimateDisplacement) {
    return {
      displacement,
      force: 0,
      tangent: 0,
      branch: "failed",
    };
  }

  if (absoluteDisplacement <= yieldDisplacement) {
    return {
      displacement,
      force: stiffness * displacement,
      tangent: stiffness,
      branch: "elastic",
    };
  }

  return {
    displacement,
    force: sign * resistance,
    tangent: 0,
    branch: "plastic-plateau",
  };
}

/**
 * Pure NTC 2018 / Circular 2019 bilinear pier evaluator. All inputs must use
 * a coherent unit system and resistance inputs must already be the values to
 * use in nonlinear analysis (mean values, divided by FC for existing construction).
 */
export function evaluateNTC2018MasonryPier({
  geometry,
  material,
  actions,
  options = {},
  lateralDisplacement = null,
}: EvaluateNTC2018MasonryPierOptions): NTC2018MasonryPierEvaluation {
  const texture = normalizeTexture(options.masonryTexture);
  const length = geometry.length;
  const height = geometry.height;
  const thickness = geometry.thickness;
  const deformableHeight = geometry.deformableHeight ?? height;
  const boundaryCondition = options.boundaryCondition ?? "cantilever";
  const shearSpan =
    options.shearSpan ?? (boundaryCondition === "fixed-fixed" ? height / 2 : height);
  const axialCompression = Math.max(0, actions.axialCompression ?? 0);
  const shearAxialCompression = Math.max(0, actions.shearAxialCompression ?? axialCompression);
  const flexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression,
    compressiveStrength: material.compressiveStrength,
    length,
    thickness,
    shearSpan,
  });
  const sliding = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: shearAxialCompression,
    cohesion: material.cohesion,
    shearStrengthLimit: material.shearStrengthLimit,
    length,
    thickness,
    shearSpan,
  });
  const diagonal =
    texture === "regular"
      ? calculateNTC2018MasonryPierRegularDiagonalCapacity({
          axialCompression: shearAxialCompression,
          cohesion: material.cohesion,
          interlockingCoefficient: material.interlockingCoefficient,
          localFrictionCoefficient: material.localFrictionCoefficient,
          blockTensileStrength: material.blockTensileStrength,
          length,
          thickness,
          height,
        })
      : calculateNTC2018MasonryPierIrregularDiagonalCapacity({
          axialCompression: shearAxialCompression,
          referenceShearStrength: material.referenceShearStrength,
          diagonalTensileStrength: material.diagonalTensileStrength,
          length,
          thickness,
          height,
        });
  const capacities = [flexural, sliding, diagonal];
  const missing = capacities
    .filter((capacity): capacity is NTC2018MasonryPierUnavailableCapacity => !capacity.available)
    .map((capacity) => ({
      mechanism: capacity.mechanism,
      parameters: capacity.missing,
    }));
  const governing: NTC2018MasonryPierAvailableCapacity | null =
    missing.length === 0 ? selectNTC2018MasonryPierGoverningCapacity(capacities) : null;

  let stiffness: NTC2018MasonryPierElasticStiffness | null = null;
  const stiffnessMissing: string[] = [];
  const elasticModulus = material.elasticModulus;
  const shearModulus = material.shearModulus;

  if (!isFiniteNumber(elasticModulus) || elasticModulus <= 0) {
    stiffnessMissing.push("elasticModulus");
  }
  if (!isFiniteNumber(shearModulus) || shearModulus <= 0) {
    stiffnessMissing.push("shearModulus");
  }

  if (stiffnessMissing.length === 0) {
    stiffness = calculateNTC2018MasonryPierElasticStiffness({
      elasticModulus: elasticModulus ?? 0,
      shearModulus: shearModulus ?? 0,
      length,
      thickness,
      deformableHeight,
      boundaryCondition,
      shearCorrectionFactor: options.shearCorrectionFactor,
      crackedStiffnessFactor: options.crackedStiffnessFactor,
    });
  }

  const normalizedOptions = {
    ...options,
    masonryTexture: texture,
    boundaryCondition,
    shearSpan,
  };
  const normalizedGeometry = { ...geometry, deformableHeight };
  const normalizedActions = { axialCompression, shearAxialCompression };

  if (!governing || !stiffness) {
    return {
      complete: false,
      geometry: normalizedGeometry,
      actions: normalizedActions,
      options: normalizedOptions,
      capacities: { flexural, sliding, diagonal },
      governing: null,
      stiffness,
      deformation: null,
      yieldDisplacement: null,
      curve: [],
      response: null,
      missing: [
        ...missing,
        ...(stiffnessMissing.length > 0
          ? [{ mechanism: "elastic-stiffness", parameters: stiffnessMissing }]
          : []),
      ],
    };
  }

  const deformation = calculateNTC2018MasonryPierUltimateDisplacement({
    height,
    mechanism: governing.mechanism,
    scope: options.scope,
    modernPerforatedBlocks: options.modernPerforatedBlocks,
  });
  const yieldDisplacement = governing.capacity / stiffness.totalStiffness;
  const consistentBilinear = yieldDisplacement < deformation.ultimateDisplacement;
  const curve = consistentBilinear
    ? [
        { id: "origin" as const, displacement: 0, force: 0 },
        { id: "yield" as const, displacement: yieldDisplacement, force: governing.capacity },
        {
          id: "ultimate" as const,
          displacement: deformation.ultimateDisplacement,
          force: governing.capacity,
        },
      ]
    : [];

  return {
    complete: true,
    consistentBilinear,
    geometry: normalizedGeometry,
    actions: normalizedActions,
    options: normalizedOptions,
    capacities: { flexural, sliding, diagonal },
    governing,
    stiffness,
    deformation,
    yieldDisplacement,
    curve,
    response: consistentBilinear
      ? responseAtDisplacement({
          displacement: lateralDisplacement,
          stiffness: stiffness.totalStiffness,
          resistance: governing.capacity,
          yieldDisplacement,
          ultimateDisplacement: deformation.ultimateDisplacement,
        })
      : null,
    missing: [],
  };
}
