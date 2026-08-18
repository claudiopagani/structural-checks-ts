import { rectangularNoTensionCompressionDomain2D } from "../../domain/masonry/rigid-blocks/rectangularNoTensionCompressionDomain2D.js";
import type {
  RigidBlockInterfaceConstraintKind,
  RigidBlockInterfaceLimitLaw2D,
  RigidBlockInterfaceResultant2D,
  RigidBlockResultantFacet2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { evaluateMasonryArchCurveAtStation } from "./geometry.js";
import { solveBoundedMinimumProblem } from "./reinforcementLinearProgram.js";
import type {
  BondedLayerStateResult,
  MasonryArchInterfaceGeometry,
  NormalizedBondedLayerReinforcement,
  NormalizedMasonryArchModel,
} from "./types.js";

/**
 * One bonded layer effective at one interface. The layer is immediately effective at its full
 * assigned capacity inside its `[startStation, endStation]` interval and absent outside it; no
 * development, transfer, or terminal-reduction factor is applied.
 */
export interface BondedLayerInterfaceContribution {
  readonly layer: NormalizedBondedLayerReinforcement;
  /** Section coordinate of the tensile contribution: `-length/2` intrados, `+length/2` extrados. */
  readonly coordinate: number;
  readonly capacity: number;
}

export interface BondedLayerInterfaceSection {
  readonly interface: MasonryArchInterfaceGeometry;
  /** Independent contributions of every effective layer; several sides can coexist. */
  readonly contributions: readonly BondedLayerInterfaceContribution[];
}

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;

function integrateArcLengthJacobian(
  geometry: NormalizedMasonryArchModel["geometry"],
  side: "intrados" | "extrados",
  startStation: number,
  endStation: number,
): number {
  if (endStation <= startStation) return 0;
  const midpoint = (startStation + endStation) / 2;
  const half = (endStation - startStation) / 2;
  let length = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = half * GAUSS_NODES[index]!;
    const weight = half * GAUSS_WEIGHTS[index]!;
    length +=
      weight *
      (evaluateMasonryArchCurveAtStation(geometry, midpoint - offset).arcLengthJacobian[side] +
        evaluateMasonryArchCurveAtStation(geometry, midpoint + offset).arcLengthJacobian[side]);
  }
  return length;
}

/**
 * Normalized side-boundary station of every interface: the side arc length from the left springing
 * to the interface cut, divided by the total side arc length. Bonded-layer effective intervals are
 * expressed in this side stationing.
 */
function interfaceSideStations(
  geometry: NormalizedMasonryArchModel["geometry"],
): ReadonlyMap<number, { readonly intrados: number; readonly extrados: number }> {
  const stations = geometry.interfaces.map((item) => item.station);
  const intradosCumulative = [0];
  const extradosCumulative = [0];
  for (let index = 0; index < stations.length - 1; index += 1) {
    intradosCumulative.push(
      intradosCumulative[index]! +
        integrateArcLengthJacobian(geometry, "intrados", stations[index]!, stations[index + 1]!),
    );
    extradosCumulative.push(
      extradosCumulative[index]! +
        integrateArcLengthJacobian(geometry, "extrados", stations[index]!, stations[index + 1]!),
    );
  }
  const intradosTotal = intradosCumulative.at(-1)!;
  const extradosTotal = extradosCumulative.at(-1)!;
  const result = new Map<number, { readonly intrados: number; readonly extrados: number }>();
  stations.forEach((station, index) => {
    result.set(station, {
      intrados: intradosTotal > 0 ? intradosCumulative[index]! / intradosTotal : 0,
      extrados: extradosTotal > 0 ? extradosCumulative[index]! / extradosTotal : 0,
    });
  });
  return result;
}

export function resolveBondedLayerInterfaceSections(
  model: NormalizedMasonryArchModel,
): readonly BondedLayerInterfaceSection[] {
  const sideStations = interfaceSideStations(model.geometry);
  const tolerance = 1e-10;
  return model.geometry.interfaces.map((geometry) => {
    const stations = sideStations.get(geometry.station)!;
    const contributions = model.bondedLayers
      .map((layer): BondedLayerInterfaceContribution | null => {
        const sideStation = layer.side === "intrados" ? stations.intrados : stations.extrados;
        const effective =
          sideStation >= layer.startStation - tolerance &&
          sideStation <= layer.endStation + tolerance;
        if (!effective) return null;
        return {
          layer,
          coordinate: layer.side === "extrados" ? geometry.length / 2 : -geometry.length / 2,
          capacity: layer.tensileCapacity,
        };
      })
      .filter((item): item is BondedLayerInterfaceContribution => item !== null);
    return { interface: geometry, contributions };
  });
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

/**
 * Support of the masonry-only domain in one direction, used to translate the layer-capacity
 * facets of the reinforced domain. Null when the base domain is unbounded in that direction
 * (possible only for the closed-form no-tension wedge without a finite compression strength).
 */
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

function facetKey(
  facet: Pick<RigidBlockResultantFacet2D, "normalCoefficient" | "momentCoefficient">,
): string {
  const normal = facet.normalCoefficient;
  const moment = facet.momentCoefficient;
  const scale = Math.hypot(normal, moment) || 1;
  return `${(normal / scale).toPrecision(12)}:${(moment / scale).toPrecision(12)}`;
}

/**
 * Builds the reinforced N-M domain as the Minkowski sum of the masonry domain and every effective
 * layer's independent bounded tensile contribution `0 <= T_i <= T_Rd,i` acting at its side
 * coordinate `y_i`. Facets of the sum have the normals of the masonry domain plus, per distinct
 * layer coordinate, the pair of normals perpendicular to that layer's force direction; duplicate
 * normals from layers sharing one coordinate are merged into a single facet pair.
 */
export function applyBondedLayerSectionToLaw(
  baseLaw: RigidBlockInterfaceLimitLaw2D,
  section: BondedLayerInterfaceSection,
): RigidBlockInterfaceLimitLaw2D {
  if (section.contributions.length === 0) return baseLaw;
  const base = baseMasonryDomain(section.interface, { ...baseLaw, resultantFacets: null });
  const layers = section.contributions.map((item) => ({
    capacity: item.capacity,
    coordinate: item.coordinate,
  }));

  const facets: RigidBlockResultantFacet2D[] = base.facets.map((facet) => ({
    ...facet,
    capacity:
      facet.capacity +
      layers.reduce(
        (sum, layer) =>
          sum +
          Math.max(
            0,
            -layer.capacity *
              (facet.normalCoefficient + facet.momentCoefficient * layer.coordinate),
          ),
        0,
      ),
  }));

  const addedKeys = new Set<string>();
  for (const layer of layers) {
    for (const sign of [-1, 1] as const) {
      const normalCoefficient = sign * layer.coordinate;
      const momentCoefficient = -sign;
      const key = facetKey({ normalCoefficient, momentCoefficient });
      if (addedKeys.has(key)) continue;
      const baseSupport = supportOfBaseDomain(
        normalCoefficient,
        momentCoefficient,
        section.interface.length / 2,
        base.vertices,
      );
      if (baseSupport === null) continue;
      addedKeys.add(key);
      facets.push({
        normalCoefficient,
        momentCoefficient,
        capacity:
          baseSupport +
          layers.reduce(
            (sum, item) =>
              sum +
              Math.max(
                0,
                -item.capacity * (normalCoefficient + momentCoefficient * item.coordinate),
              ),
            0,
          ),
        kind: "bonded-layer-capacity",
      });
    }
  }
  return { ...baseLaw, resultantFacets: facets };
}

interface StaticSectionRecovery {
  /**
   * Minimum-required per-contribution forces, in section order; null when the static problem is
   * infeasible or does not determine a unique force vector. When the vector is null the masonry
   * resultants are left untouched.
   */
  readonly forces: readonly number[] | null;
  readonly masonryNormalForce: number | null;
  readonly masonryMoment: number | null;
}

function recoverStaticSection(
  resultant: RigidBlockInterfaceResultant2D,
  law: RigidBlockInterfaceLimitLaw2D,
  section: BondedLayerInterfaceSection,
  tolerance: number,
): StaticSectionRecovery {
  if (section.contributions.length === 0) {
    return {
      forces: [],
      masonryNormalForce: resultant.normalForce,
      masonryMoment: resultant.moment,
    };
  }
  const base = baseMasonryDomain(section.interface, { ...law, resultantFacets: null });
  const contributions = section.contributions;
  const problem = {
    constraints: base.facets.map((facet) => ({
      coefficients: contributions.map(
        (item) => facet.normalCoefficient + facet.momentCoefficient * item.coordinate,
      ),
      rightHandSide:
        facet.capacity -
        facet.normalCoefficient * resultant.normalForce -
        facet.momentCoefficient * resultant.moment,
    })),
    capacities: contributions.map((item) => item.capacity),
  } as const;
  const solution = solveBoundedMinimumProblem(problem, tolerance);
  if (!solution.feasible || !solution.unique || solution.solution === null) {
    return { forces: null, masonryNormalForce: null, masonryMoment: null };
  }
  const totalForce = solution.solution.reduce((sum, force) => sum + force, 0);
  const totalMoment = solution.solution.reduce(
    (sum, force, index) => sum + force * contributions[index]!.coordinate,
    0,
  );
  return {
    forces: solution.solution,
    masonryNormalForce: resultant.normalForce + totalForce,
    masonryMoment: resultant.moment + totalMoment,
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
      const contributionIndex = section.contributions.findIndex(
        (item) => item.layer.id === layer.id,
      );
      if (contributionIndex < 0) return [];
      const contribution = section.contributions[contributionIndex]!;
      const recovery = recoveries[index]!;
      const force = recovery.forces === null ? null : recovery.forces[contributionIndex]!;
      const utilizationRatio = force === null ? null : force / contribution.capacity;
      return [
        {
          reinforcementId: layer.id,
          interfaceId: section.interface.id,
          interfaceIndex: section.interface.index,
          side: layer.side,
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
      startStation: layer.startStation,
      endStation: layer.endStation,
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
    readonly coordinate: number;
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
      ? model.supports.left.interfaceLaw
      : interfaceIndex === model.geometry.interfaces.length - 1
        ? model.supports.right.interfaceLaw
        : model.interfaceLaw;
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
      coordinate: item.coordinate,
      capacity: item.capacity,
    })),
  };
}
