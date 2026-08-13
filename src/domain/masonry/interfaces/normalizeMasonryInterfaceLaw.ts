import type { UnitResolver } from "../../units/UnitSystem.js";
import type {
  MasonryCoulombFrictionInput,
  MasonryInterfaceLawInput,
  NormalizedMasonryInterfaceLaw,
} from "./types.js";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved <= 0) throw new Error(`${label} must be positive.`);
  return resolved;
}

function nonNegative(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved < 0) throw new Error(`${label} must be non-negative.`);
  return resolved;
}

function normalizeFriction(
  input: MasonryCoulombFrictionInput,
  resolver: UnitResolver,
  label: string,
): NonNullable<NormalizedMasonryInterfaceLaw["friction"]> {
  const frictionCoefficient = nonNegative(
    input.frictionCoefficient,
    `${label}.frictionCoefficient`,
  );
  const cohesion = nonNegative(resolver.stress(input.cohesion ?? 0), `${label}.cohesion`);
  const frictionAngle = Math.atan(frictionCoefficient);
  const flowRule = input.flowRule ?? { type: "non-associated" as const };
  const dilationAngle =
    flowRule.type === "associated"
      ? frictionAngle
      : (() => {
          const supplied = finite(flowRule.dilationAngle ?? 0, `${label}.dilationAngle`);
          const radians =
            (flowRule.angleUnit ?? "rad") === "deg" ? (supplied * Math.PI) / 180 : supplied;
          if (radians < 0 || radians > frictionAngle + 1e-12) {
            throw new Error(`${label}.dilationAngle must satisfy 0 <= psi <= atan(mu).`);
          }
          return radians;
        })();
  return {
    frictionCoefficient,
    cohesion,
    flowRule: { type: flowRule.type, dilationAngle },
  };
}

export function normalizeMasonryInterfaceLaw(
  input: MasonryInterfaceLawInput,
  resolver: UnitResolver,
  label: string,
): NormalizedMasonryInterfaceLaw {
  const approachingLimitRatio = input.reporting?.approachingLimitRatio ?? 0.9;
  if (approachingLimitRatio <= 0 || approachingLimitRatio >= 1) {
    throw new Error(`${label}.reporting.approachingLimitRatio must satisfy 0 < ratio < 1.`);
  }

  if (input.response === "rigid-plastic") {
    const compressiveStrength =
      input.normal.compressiveStrength === undefined
        ? null
        : positive(
            resolver.stress(input.normal.compressiveStrength),
            `${label}.normal.compressiveStrength`,
          );
    const compressionFacetCount = input.normal.compressionFacetCount ?? 8;
    if (
      compressiveStrength !== null &&
      (!Number.isInteger(compressionFacetCount) || compressionFacetCount < 2)
    ) {
      throw new Error(`${label}.normal.compressionFacetCount must be at least two.`);
    }
    return {
      response: "rigid-plastic",
      approachingLimitRatio,
      friction:
        input.tangential.type === "frictionless"
          ? null
          : normalizeFriction(input.tangential, resolver, `${label}.tangential`),
      compressiveStrength,
      compressionFacetCount: compressiveStrength === null ? 1 : compressionFacetCount,
      deformability: null,
    };
  }

  const integrationPointCount = input.normal.integrationPointCount ?? 16;
  if (!Number.isInteger(integrationPointCount) || integrationPointCount < 2) {
    throw new Error(`${label}.normal.integrationPointCount must be at least two.`);
  }
  const compressiveStrength =
    input.normal.compressiveStrength === undefined
      ? null
      : positive(
          resolver.stress(input.normal.compressiveStrength),
          `${label}.normal.compressiveStrength`,
        );
  const postCrushingBehavior = input.normal.postCrushingBehavior ?? "stop-at-onset";
  if (postCrushingBehavior === "perfectly-plastic" && compressiveStrength === null) {
    throw new Error(`${label}.normal perfectly-plastic crushing requires compressiveStrength.`);
  }
  const compressionFacetCount = input.normal.compressionFacetCount ?? 8;
  if (!Number.isInteger(compressionFacetCount) || compressionFacetCount < 2) {
    throw new Error(`${label}.normal.compressionFacetCount must be at least two.`);
  }
  return {
    response: "deformable",
    approachingLimitRatio,
    friction: normalizeFriction(input.tangential, resolver, `${label}.tangential`),
    compressiveStrength,
    compressionFacetCount,
    deformability: {
      normal: {
        elasticModulus: positive(
          resolver.stress(input.normal.elasticModulus),
          `${label}.normal.elasticModulus`,
        ),
        characteristicLength: positive(
          resolver.length(input.normal.characteristicLength),
          `${label}.normal.characteristicLength`,
        ),
        integrationPointCount,
        postCrushingBehavior,
      },
      tangential: {
        shearModulus: positive(
          resolver.stress(input.tangential.shearModulus),
          `${label}.tangential.shearModulus`,
        ),
        characteristicLength: positive(
          resolver.length(input.tangential.characteristicLength),
          `${label}.tangential.characteristicLength`,
        ),
      },
    },
  };
}
