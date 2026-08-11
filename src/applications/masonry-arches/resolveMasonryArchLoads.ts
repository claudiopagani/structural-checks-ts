import { cross2d } from "../../domain/masonry/rigid-blocks/vector2d.js";
import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { evaluateMasonryArchCurveAtStation } from "./geometry.js";
import type {
  MasonryArchAppliedLoadResult,
  MasonryArchBlockLoadResult,
  MasonryArchLoadApplicationCurve,
  MasonryArchLoadCombinationLike,
  NormalizedMasonryArchGeometry,
  NormalizedMasonryArchLoad,
  NormalizedMasonryArchModel,
} from "./types.js";

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;

interface MutableBlockWrench {
  forceX: number;
  forceY: number;
  moment: number;
  sourceLoadIds: string[];
}

export interface ResolveMasonryArchLoadsOptions {
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  readonly loadFactorsByCaseId?: Readonly<Record<string, number>>;
}

export interface ResolvedMasonryArchLoads {
  readonly loadFactorsByCaseId: Readonly<Record<string, number>>;
  readonly appliedLoads: readonly MasonryArchAppliedLoadResult[];
  readonly blockWrenches: readonly MasonryArchBlockLoadResult[];
  /** Dead-load actions retained at material points for updated-geometry equilibrium. */
  readonly actions: readonly MasonryArchResolvedLoadAction[];
}

export interface MasonryArchResolvedLoadAction {
  readonly loadId: string;
  readonly loadCaseId: string;
  readonly blockId: string;
  readonly referencePoint: RigidBlockPoint2D;
  readonly force: RigidBlockVector2D;
  readonly moment: number;
}

function finiteFactor(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function resolveLoadFactors(
  loads: readonly NormalizedMasonryArchLoad[],
  options: ResolveMasonryArchLoadsOptions,
): Record<string, number> {
  const factors: Record<string, number> = {};
  if (options.loadCombination === undefined || options.loadCombination === null) {
    for (const load of loads) {
      factors[load.loadCaseId] = 1;
    }
  } else {
    for (const item of options.loadCombination.factors) {
      const id = item.loadCase.id;
      if (typeof id !== "string" || id.trim().length === 0) {
        throw new Error("Every load-combination factor requires a load case id.");
      }
      factors[id] =
        (factors[id] ?? 0) + finiteFactor(item.factor, `Load-combination factor for ${id}`);
    }
    for (const load of loads) {
      factors[load.loadCaseId] ??= 0;
    }
  }
  for (const [id, factor] of Object.entries(options.loadFactorsByCaseId ?? {})) {
    factors[id] = finiteFactor(factor, `Explicit load factor for ${id}`);
  }
  return factors;
}

function applicationPoint(
  geometry: NormalizedMasonryArchGeometry,
  station: number,
  curve: MasonryArchLoadApplicationCurve,
): RigidBlockPoint2D {
  return evaluateMasonryArchCurveAtStation(geometry, station)[curve];
}

function addBlockContribution(
  accumulator: MutableBlockWrench,
  blockCentroid: RigidBlockPoint2D,
  force: RigidBlockVector2D,
  momentAboutOrigin: number,
  loadId: string,
): void {
  accumulator.forceX += force.x;
  accumulator.forceY += force.y;
  accumulator.moment += momentAboutOrigin - cross2d(blockCentroid, force);
  if (!accumulator.sourceLoadIds.includes(loadId)) {
    accumulator.sourceLoadIds.push(loadId);
  }
}

function integrateInterval(
  start: number,
  end: number,
  integrand: (station: number, weight: number) => void,
): void {
  const midpoint = (start + end) / 2;
  const halfLength = (end - start) / 2;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = halfLength * GAUSS_NODES[index]!;
    const weight = halfLength * GAUSS_WEIGHTS[index]!;
    integrand(midpoint - offset, weight);
    integrand(midpoint + offset, weight);
  }
}

function loadRange(
  load: NormalizedMasonryArchLoad,
  totalLength: number,
): { readonly start: number; readonly end: number } {
  if (load.type === "patch" || load.type === "fill") {
    return { start: load.startStation * totalLength, end: load.endStation * totalLength };
  }
  return { start: 0, end: totalLength };
}

function resolvePointTarget(
  geometry: NormalizedMasonryArchGeometry,
  station: number,
  targetVoussoirId: string | null,
): number {
  const stationTolerance = 1e-10 * Math.max(1, geometry.totalReferenceArcLength);
  if (targetVoussoirId !== null) {
    const block = geometry.voussoirs.find((item) => item.id === targetVoussoirId);
    if (block === undefined) {
      throw new Error(`Unknown point-load target voussoir: ${targetVoussoirId}.`);
    }
    if (
      station < block.startStation - stationTolerance ||
      station > block.endStation + stationTolerance
    ) {
      throw new Error(`Point-load station is outside target voussoir ${targetVoussoirId}.`);
    }
    return block.index;
  }

  for (let index = 1; index < geometry.interfaces.length - 1; index += 1) {
    if (Math.abs(station - geometry.interfaces[index]!.station) <= stationTolerance) {
      throw new Error(
        `Point load lies on interface ${geometry.interfaces[index]!.id}; targetVoussoirId is required.`,
      );
    }
  }
  if (station <= stationTolerance) return 0;
  if (station >= geometry.totalReferenceArcLength - stationTolerance) {
    return geometry.voussoirs.length - 1;
  }
  const block = geometry.voussoirs.find(
    (item) => station > item.startStation && station < item.endStation,
  );
  if (block === undefined) {
    throw new Error("Point-load station could not be assigned to a voussoir.");
  }
  return block.index;
}

export function resolveMasonryArchLoads(
  model: NormalizedMasonryArchModel,
  options: ResolveMasonryArchLoadsOptions = {},
): ResolvedMasonryArchLoads {
  const geometry = model.geometry;
  const factors = resolveLoadFactors(model.loads, options);
  const mutableWrenches: MutableBlockWrench[] = geometry.voussoirs.map(() => ({
    forceX: 0,
    forceY: 0,
    moment: 0,
    sourceLoadIds: [],
  }));
  const appliedLoads: MasonryArchAppliedLoadResult[] = [];
  const actions: MasonryArchResolvedLoadAction[] = [];

  for (const load of model.loads) {
    const factor = factors[load.loadCaseId] ?? 0;
    let loadForceX = 0;
    let loadForceY = 0;
    let loadMomentOrigin = 0;

    if (factor === 0) {
      appliedLoads.push({
        loadId: load.id,
        loadCaseId: load.loadCaseId,
        factor,
        resultantForce: { x: 0, y: 0 },
        resultantMomentAboutOrigin: 0,
      });
      continue;
    }

    if (load.type === "self-weight") {
      const unitWeight = model.masonry.unitWeight;
      if (unitWeight === null) {
        throw new Error("Masonry unitWeight is required to resolve self-weight.");
      }
      for (const block of geometry.voussoirs) {
        const force = { x: 0, y: -factor * unitWeight * block.volume };
        const momentOrigin = cross2d(block.centroid, force);
        addBlockContribution(
          mutableWrenches[block.index]!,
          block.centroid,
          force,
          momentOrigin,
          load.id,
        );
        actions.push({
          loadId: load.id,
          loadCaseId: load.loadCaseId,
          blockId: block.id,
          referencePoint: block.centroid,
          force,
          moment: 0,
        });
        loadForceY += force.y;
        loadMomentOrigin += momentOrigin;
      }
    } else if (load.type === "point") {
      const station = load.station * geometry.totalReferenceArcLength;
      const blockIndex = resolvePointTarget(geometry, station, load.targetVoussoirId);
      const block = geometry.voussoirs[blockIndex]!;
      const point = applicationPoint(geometry, station, load.applicationCurve);
      const force = { x: factor * load.force.x, y: factor * load.force.y };
      const appliedMoment = factor * load.moment;
      const momentOrigin = cross2d(point, force) + appliedMoment;
      addBlockContribution(
        mutableWrenches[blockIndex]!,
        block.centroid,
        force,
        momentOrigin,
        load.id,
      );
      actions.push({
        loadId: load.id,
        loadCaseId: load.loadCaseId,
        blockId: block.id,
        referencePoint: point,
        force,
        moment: appliedMoment,
      });
      loadForceX = force.x;
      loadForceY = force.y;
      loadMomentOrigin = momentOrigin;
    } else {
      const range = loadRange(load, geometry.totalReferenceArcLength);
      const extradosCrown = evaluateMasonryArchCurveAtStation(
        geometry,
        geometry.totalReferenceArcLength / 2,
      ).extrados;

      for (const block of geometry.voussoirs) {
        const start = Math.max(block.startStation, range.start);
        const end = Math.min(block.endStation, range.end);
        if (end <= start) continue;

        let blockForceX = 0;
        let blockForceY = 0;
        let blockMomentOrigin = 0;
        integrateInterval(start, end, (station, quadratureWeight) => {
          const sample = evaluateMasonryArchCurveAtStation(geometry, station);
          let forceDensityX: number;
          let forceDensityY: number;
          let point: RigidBlockPoint2D;
          if (load.type === "fill") {
            const depth = load.crownCoverDepth + extradosCrown.y - sample.extrados.y;
            const horizontalJacobian =
              Math.abs(sample.chainTangent.x) * sample.arcLengthJacobian.extrados;
            forceDensityX = 0;
            forceDensityY =
              -factor *
              load.unitWeight *
              geometry.outOfPlaneWidth *
              Math.max(0, depth) *
              horizontalJacobian;
            point = sample.extrados;
          } else {
            const curveJacobian = sample.arcLengthJacobian[load.distributionCurve];
            const jacobian =
              load.distributionBasis === "arc-length"
                ? curveJacobian
                : Math.abs(sample.chainTangent.x) * curveJacobian;
            forceDensityX = factor * load.components.x * jacobian;
            forceDensityY = factor * load.components.y * jacobian;
            point = sample[load.applicationCurve];
          }
          const differentialForce = {
            x: forceDensityX * quadratureWeight,
            y: forceDensityY * quadratureWeight,
          };
          actions.push({
            loadId: load.id,
            loadCaseId: load.loadCaseId,
            blockId: block.id,
            referencePoint: point,
            force: differentialForce,
            moment: 0,
          });
          blockForceX += differentialForce.x;
          blockForceY += differentialForce.y;
          blockMomentOrigin += cross2d(point, differentialForce);
        });
        const blockForce = { x: blockForceX, y: blockForceY };
        addBlockContribution(
          mutableWrenches[block.index]!,
          block.centroid,
          blockForce,
          blockMomentOrigin,
          load.id,
        );
        loadForceX += blockForceX;
        loadForceY += blockForceY;
        loadMomentOrigin += blockMomentOrigin;
      }
    }

    appliedLoads.push({
      loadId: load.id,
      loadCaseId: load.loadCaseId,
      factor,
      resultantForce: { x: loadForceX, y: loadForceY },
      resultantMomentAboutOrigin: loadMomentOrigin,
    });
  }

  const blockWrenches: MasonryArchBlockLoadResult[] = geometry.voussoirs.map((block) => {
    const accumulated = mutableWrenches[block.index]!;
    return {
      blockId: block.id,
      force: { x: accumulated.forceX, y: accumulated.forceY },
      moment: accumulated.moment,
      applicationPoint: block.centroid,
      sourceLoadIds: accumulated.sourceLoadIds,
    };
  });

  return { loadFactorsByCaseId: factors, appliedLoads, blockWrenches, actions };
}
