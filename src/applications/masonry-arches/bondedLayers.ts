import { rectangularNoTensionCompressionDomain2D } from "../../domain/masonry/rigid-blocks/rectangularNoTensionCompressionDomain2D.js";
import type {
  RigidBlockInterfaceConstraintKind,
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockInterfaceResultant2D,
  RigidBlockResultantFacet2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import type {
  BondedLayerStateResult,
  MasonryArchInterfaceGeometry,
  NormalizedBondedLayerReinforcement,
  NormalizedMasonryArchModel,
} from "./types.js";

export interface BondedLayerInterfaceContribution {
  readonly layer: NormalizedBondedLayerReinforcement;
  readonly developmentFactor: number;
  readonly capacity: number;
}

export interface BondedLayerInterfaceSection {
  readonly interface: MasonryArchInterfaceGeometry;
  readonly side: "intrados" | "extrados" | null;
  readonly coordinate: number | null;
  readonly capacity: number;
  readonly contributions: readonly BondedLayerInterfaceContribution[];
}

function compressionFraction(facetIndex: number, facetCount: number): number {
  const ratio = facetIndex / facetCount;
  if (ratio <= 0 || ratio >= 1) return ratio;
  const forward = ratio * ratio;
  const backward = (1 - ratio) * (1 - ratio);
  return forward / (forward + backward);
}

function baseMasonryDomain(
  geometry: MasonryArchInterfaceGeometry,
  law: RigidBlockInterfaceLimitLaw2D,
): {
  readonly facets: readonly RigidBlockResultantFacet2D[];
  readonly vertices: readonly { readonly normalForce: number; readonly moment: number }[] | null;
} {
  const halfLength = geometry.length / 2;
  if (law.compressiveStrength === null) {
    return {
      facets: [
        {
          normalCoefficient: -1,
          momentCoefficient: 0,
          capacity: 0,
          kind: "compression",
        },
        {
          normalCoefficient: -halfLength,
          momentCoefficient: 1,
          capacity: 0,
          kind: "extrados",
        },
        {
          normalCoefficient: -halfLength,
          momentCoefficient: -1,
          capacity: 0,
          kind: "intrados",
        },
      ],
      vertices: null,
    };
  }

  const compressionCapacity = law.compressiveStrength * geometry.length * geometry.outOfPlaneWidth;
  const sampled = Array.from({ length: law.compressionFacetCount + 1 }, (_, index) => {
    const normalForce = compressionCapacity * compressionFraction(index, law.compressionFacetCount);
    const moment = rectangularNoTensionCompressionDomain2D({
      normalForce,
      interfaceLength: geometry.length,
      outOfPlaneWidth: geometry.outOfPlaneWidth,
      compressiveStrength: law.compressiveStrength!,
    }).momentCapacity;
    return { normalForce, moment };
  });
  const facets: RigidBlockResultantFacet2D[] = [
    {
      normalCoefficient: -1,
      momentCoefficient: 0,
      capacity: 0,
      kind: "compression",
    },
  ];
  for (let index = 0; index < sampled.length - 1; index += 1) {
    const first = sampled[index]!;
    const second = sampled[index + 1]!;
    const slope = (second.moment - first.moment) / (second.normalForce - first.normalForce);
    const intercept = first.moment - slope * first.normalForce;
    facets.push(
      {
        normalCoefficient: -slope,
        momentCoefficient: 1,
        capacity: intercept,
        kind: "crushing-extrados",
      },
      {
        normalCoefficient: -slope,
        momentCoefficient: -1,
        capacity: intercept,
        kind: "crushing-intrados",
      },
    );
  }
  return {
    facets,
    vertices: sampled.flatMap((item) => [
      { normalForce: item.normalForce, moment: item.moment },
      { normalForce: item.normalForce, moment: -item.moment },
    ]),
  };
}

function developmentFactor(
  layer: NormalizedBondedLayerReinforcement,
  normalizedStation: number,
  totalReferenceArcLength: number,
): number {
  if (
    normalizedStation < layer.startStation - 1e-12 ||
    normalizedStation > layer.endStation + 1e-12
  ) {
    return 0;
  }
  const distanceFromLeft = (normalizedStation - layer.startStation) * totalReferenceArcLength;
  const distanceFromRight = (layer.endStation - normalizedStation) * totalReferenceArcLength;
  const leftFactor =
    layer.terminations.left.type === "anchored"
      ? 1
      : Math.min(1, Math.max(0, distanceFromLeft / layer.terminations.left.developmentLength));
  const rightFactor =
    layer.terminations.right.type === "anchored"
      ? 1
      : Math.min(1, Math.max(0, distanceFromRight / layer.terminations.right.developmentLength));
  return Math.min(leftFactor, rightFactor);
}

export function resolveBondedLayerInterfaceSections(
  model: NormalizedMasonryArchModel,
): readonly BondedLayerInterfaceSection[] {
  return model.geometry.interfaces.map((geometry) => {
    const contributions = model.bondedLayers
      .map((layer): BondedLayerInterfaceContribution | null => {
        const factor = developmentFactor(
          layer,
          geometry.normalizedStation,
          model.geometry.totalReferenceArcLength,
        );
        return factor <= 0
          ? null
          : {
              layer,
              developmentFactor: factor,
              capacity: factor * layer.tensileCapacity,
            };
      })
      .filter((item): item is BondedLayerInterfaceContribution => item !== null);
    const sides = new Set(contributions.map((item) => item.layer.side));
    if (sides.size > 1) {
      throw new Error(
        `Interface ${geometry.id} has bonded layers on both boundaries; the current membrane domain supports one active side per interface.`,
      );
    }
    const side = contributions[0]?.layer.side ?? null;
    return {
      interface: geometry,
      side,
      coordinate:
        side === null ? null : side === "extrados" ? geometry.length / 2 : -geometry.length / 2,
      capacity: contributions.reduce((sum, item) => sum + item.capacity, 0),
      contributions,
    };
  });
}

function supportOfBaseDomain(
  normalCoefficient: number,
  momentCoefficient: number,
  halfLength: number,
  vertices: readonly { readonly normalForce: number; readonly moment: number }[] | null,
): number | null {
  if (vertices !== null) {
    return vertices.reduce(
      (maximum, vertex) =>
        Math.max(
          maximum,
          normalCoefficient * vertex.normalForce + momentCoefficient * vertex.moment,
        ),
      Number.NEGATIVE_INFINITY,
    );
  }
  const tolerance = 1e-12 * Math.max(1, Math.abs(normalCoefficient), Math.abs(momentCoefficient));
  return normalCoefficient + momentCoefficient * halfLength <= tolerance &&
    normalCoefficient - momentCoefficient * halfLength <= tolerance
    ? 0
    : null;
}

export function applyBondedLayerSectionToLaw(
  baseLaw: RigidBlockInterfaceLimitLaw2D,
  section: BondedLayerInterfaceSection,
): RigidBlockInterfaceLimitLaw2D {
  if (section.side === null || section.coordinate === null || section.capacity <= 0) return baseLaw;
  const base = baseMasonryDomain(section.interface, baseLaw);
  const reinforcementVector = {
    normalForce: -section.capacity,
    moment: -section.capacity * section.coordinate,
  };
  const facets: RigidBlockResultantFacet2D[] = base.facets.map((facet) => ({
    ...facet,
    capacity:
      facet.capacity +
      Math.max(
        0,
        facet.normalCoefficient * reinforcementVector.normalForce +
          facet.momentCoefficient * reinforcementVector.moment,
      ),
  }));

  for (const sign of [-1, 1] as const) {
    const normalCoefficient = sign * section.coordinate;
    const momentCoefficient = -sign;
    const baseSupport = supportOfBaseDomain(
      normalCoefficient,
      momentCoefficient,
      section.interface.length / 2,
      base.vertices,
    );
    if (baseSupport === null) continue;
    facets.push({
      normalCoefficient,
      momentCoefficient,
      capacity:
        baseSupport +
        Math.max(
          0,
          normalCoefficient * reinforcementVector.normalForce +
            momentCoefficient * reinforcementVector.moment,
        ),
      kind: "bonded-layer-capacity",
    });
  }
  return { ...baseLaw, resultantFacets: facets };
}

interface StaticSectionRecovery {
  readonly totalLayerForce: number | null;
  readonly masonryNormalForce: number | null;
  readonly masonryMoment: number | null;
}

function recoverStaticSection(
  resultant: RigidBlockInterfaceResultant2D,
  law: RigidBlockInterfaceLimitLaw2D,
  section: BondedLayerInterfaceSection,
  tolerance: number,
): StaticSectionRecovery {
  if (section.coordinate === null || section.capacity <= 0) {
    return {
      totalLayerForce: 0,
      masonryNormalForce: resultant.normalForce,
      masonryMoment: resultant.moment,
    };
  }
  const base = baseMasonryDomain(section.interface, { ...law, resultantFacets: null });
  let lower = 0;
  let upper = section.capacity;
  for (const facet of base.facets) {
    const coefficient = facet.normalCoefficient + facet.momentCoefficient * section.coordinate;
    const rightHandSide =
      facet.capacity -
      facet.normalCoefficient * resultant.normalForce -
      facet.momentCoefficient * resultant.moment;
    if (Math.abs(coefficient) <= tolerance) {
      if (rightHandSide < -tolerance) {
        return { totalLayerForce: null, masonryNormalForce: null, masonryMoment: null };
      }
    } else if (coefficient > 0) {
      upper = Math.min(upper, rightHandSide / coefficient);
    } else {
      lower = Math.max(lower, rightHandSide / coefficient);
    }
  }
  if (lower > upper + tolerance) {
    return { totalLayerForce: null, masonryNormalForce: null, masonryMoment: null };
  }
  const totalLayerForce = Math.min(section.capacity, Math.max(0, lower));
  return {
    totalLayerForce,
    masonryNormalForce: resultant.normalForce + totalLayerForce,
    masonryMoment: resultant.moment + totalLayerForce * section.coordinate,
  };
}

function masonryResultant(
  source: RigidBlockInterfaceResultant2D,
  section: BondedLayerInterfaceSection,
  baseLaw: RigidBlockInterfaceLimitLaw2D,
  recovery: StaticSectionRecovery,
): RigidBlockInterfaceResultant2D {
  if (recovery.masonryNormalForce === null || recovery.masonryMoment === null) return source;
  const normalForce = recovery.masonryNormalForce;
  const moment = recovery.masonryMoment;
  const halfLength = section.interface.length / 2;
  const eccentricity = normalForce > 0 ? moment / normalForce : null;
  const thrustPoint =
    eccentricity === null
      ? null
      : {
          x: section.interface.midpoint.x + eccentricity * section.interface.jointAxis.x,
          y: section.interface.midpoint.y + eccentricity * section.interface.jointAxis.y,
        };
  const frictionCapacity =
    baseLaw.friction === null
      ? null
      : baseLaw.friction.cohesion * section.interface.length * section.interface.outOfPlaneWidth +
        baseLaw.friction.frictionCoefficient * normalForce;
  const compressionStrengthMargin =
    baseLaw.compressiveStrength === null
      ? null
      : rectangularNoTensionCompressionDomain2D({
          normalForce,
          interfaceLength: section.interface.length,
          outOfPlaneWidth: section.interface.outOfPlaneWidth,
          compressiveStrength: baseLaw.compressiveStrength,
        }).momentCapacity - Math.abs(moment);
  return {
    ...source,
    normalForce,
    moment,
    eccentricity,
    normalizedEccentricity: eccentricity === null ? null : eccentricity / halfLength,
    thrustPoint,
    admissibilityMargins: {
      compression: normalForce,
      intrados: halfLength * normalForce + moment,
      extrados: halfLength * normalForce - moment,
      friction: frictionCapacity === null ? null : frictionCapacity - Math.abs(source.shearForce),
      compressionStrength: compressionStrengthMargin,
      resultantDomain: source.admissibilityMargins.resultantDomain,
    },
  };
}

export function recoverBondedLayerStaticState(
  model: NormalizedMasonryArchModel,
  baseLaws: readonly RigidBlockInterfaceLimitLaw2D[],
  resultants: readonly RigidBlockInterfaceResultant2D[],
  tolerance: number,
): {
  readonly masonryResultants: readonly RigidBlockInterfaceResultant2D[];
  readonly bondedLayerState: readonly BondedLayerStateResult[];
} {
  const sections = resolveBondedLayerInterfaceSections(model);
  const recoveries = resultants.map((resultant, index) =>
    recoverStaticSection(resultant, baseLaws[index]!, sections[index]!, tolerance),
  );
  const masonryResultants = resultants.map((resultant, index) =>
    masonryResultant(resultant, sections[index]!, baseLaws[index]!, recoveries[index]!),
  );
  const bondedLayerState = model.bondedLayers.map((layer): BondedLayerStateResult => {
    const interfaces = sections.flatMap((section, index) => {
      const contribution = section.contributions.find((item) => item.layer.id === layer.id);
      if (contribution === undefined) return [];
      const recovery = recoveries[index]!;
      const force =
        recovery.totalLayerForce === null || section.capacity <= 0
          ? null
          : recovery.totalLayerForce * (contribution.capacity / section.capacity);
      const utilizationRatio = force === null ? null : force / contribution.capacity;
      return [
        {
          reinforcementId: layer.id,
          interfaceId: section.interface.id,
          interfaceIndex: section.interface.index,
          side: layer.side,
          developmentFactor: contribution.developmentFactor,
          force,
          capacity: contribution.capacity,
          utilizationRatio,
          state:
            force === null
              ? ("not-uniquely-determined" as const)
              : force <= tolerance
                ? ("inactive" as const)
                : utilizationRatio! >= 1 - tolerance
                  ? ("at-capacity" as const)
                  : ("active" as const),
        },
      ];
    });
    const finiteForces = interfaces
      .map((item) => item.force)
      .filter((value): value is number => value !== null);
    const finiteUtilizations = interfaces
      .map((item) => item.utilizationRatio)
      .filter((value): value is number => value !== null);
    return {
      reinforcementId: layer.id,
      family: layer.family,
      side: layer.side,
      tensileCapacity: layer.tensileCapacity,
      governingCapacityLimit: layer.governingCapacityLimit,
      analysisMeaning: "minimum-required-static-admissibility",
      maximumForce: finiteForces.length === 0 ? null : Math.max(...finiteForces),
      maximumUtilizationRatio:
        finiteUtilizations.length === 0 ? null : Math.max(...finiteUtilizations),
      interfaces,
    };
  });
  return { masonryResultants, bondedLayerState };
}

export function isBondedLayerLimitKind(kind: RigidBlockInterfaceConstraintKind): boolean {
  return kind === "bonded-layer-capacity";
}

export interface MasonryArchBondedSectionDomainResult {
  readonly interfaceId: string;
  readonly normalForce: number;
  readonly minimumMoment: number;
  readonly maximumMoment: number;
  readonly facets: readonly RigidBlockResultantFacet2D[];
  readonly contributions: readonly {
    readonly reinforcementId: string;
    readonly side: "intrados" | "extrados";
    readonly developmentFactor: number;
    readonly capacity: number;
  }[];
}

/** Evaluates one horizontal slice through the polyhedral N-M domain used by static analysis. */
export function evaluateMasonryArchBondedSectionDomain(
  model: NormalizedMasonryArchModel,
  interfaceIndex: number,
  normalForce: number,
): MasonryArchBondedSectionDomainResult {
  if (
    !Number.isInteger(interfaceIndex) ||
    interfaceIndex < 0 ||
    interfaceIndex >= model.geometry.interfaces.length
  ) {
    throw new Error("Bonded-section interfaceIndex is outside the model interface range.");
  }
  if (!Number.isFinite(normalForce)) throw new Error("Bonded-section normalForce must be finite.");
  const geometry = model.geometry.interfaces[interfaceIndex]!;
  const source =
    interfaceIndex === 0
      ? model.supports.left.interface
      : interfaceIndex === model.geometry.interfaces.length - 1
        ? model.supports.right.interface
        : model.interfaces;
  const baseLaw: RigidBlockInterfaceLimitLaw2D = {
    friction:
      source.friction === null
        ? null
        : {
            frictionCoefficient: source.friction.frictionCoefficient,
            cohesion: source.friction.cohesion,
            flowRule: { ...source.friction.flowRule },
          },
    compressiveStrength: source.compressiveStrength,
    compressionFacetCount: source.compressionFacetCount,
  };
  const section = resolveBondedLayerInterfaceSections(model)[interfaceIndex]!;
  const law = applyBondedLayerSectionToLaw(baseLaw, section);
  const facets = law.resultantFacets ?? baseMasonryDomain(geometry, baseLaw).facets;
  let minimumMoment = Number.NEGATIVE_INFINITY;
  let maximumMoment = Number.POSITIVE_INFINITY;
  for (const facet of facets) {
    const remaining = facet.capacity - facet.normalCoefficient * normalForce;
    if (facet.momentCoefficient > 0) {
      maximumMoment = Math.min(maximumMoment, remaining / facet.momentCoefficient);
    } else if (facet.momentCoefficient < 0) {
      minimumMoment = Math.max(minimumMoment, remaining / facet.momentCoefficient);
    } else if (remaining < 0) {
      throw new Error("The requested normalForce lies outside the bonded-section domain.");
    }
  }
  if (
    !Number.isFinite(minimumMoment) ||
    !Number.isFinite(maximumMoment) ||
    minimumMoment > maximumMoment
  ) {
    throw new Error("The requested normalForce lies outside the bonded-section domain.");
  }
  return {
    interfaceId: geometry.id,
    normalForce,
    minimumMoment,
    maximumMoment,
    facets,
    contributions: section.contributions.map((item) => ({
      reinforcementId: item.layer.id,
      side: item.layer.side,
      developmentFactor: item.developmentFactor,
      capacity: item.capacity,
    })),
  };
}
