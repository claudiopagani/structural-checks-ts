import { createUnitResolver, type UnitSystem } from "../units/UnitSystem.js";
import {
  createElementLoadIndex,
  type ElementLoadIndex,
  type ElementLoadTarget,
} from "../fem/ElementLoadIndex.js";
import { coordinateAtStation } from "./SingleBeamStations.js";
import { splitPrincipalActions, type NormalizedSectionRotation } from "./SectionRotation.js";
import type { SingleBeamModel } from "./SingleBeamInput.js";
import type { SingleBeamFemModel } from "./SingleBeamFemBuilder.js";
import type { ElasticBeamSectionProperties } from "./ElasticBeamSectionProvider.js";
import type { DistributedLoad } from "../loads/DistributedLoad.js";
import type { DofRegistry } from "../fem/DofRegistry.js";

const DEFAULT_SECTION_PROPERTY_UNITS = Object.freeze({ force: "N", length: "mm" });
const SECTION_ROTATION_2D_WARNING =
  "Section rotation alpha is non-zero: SingleBeamAnalysis remains a 2D FEM model. Vertical deflection uses equivalent projected EI/GA and actions are split into principal components; torsion and independent weak-axis transverse displacement are not modeled.";

export function sectionRotationWarnings(sectionRotation: NormalizedSectionRotation): string[] {
  return Math.abs(sectionRotation?.alpha ?? 0) > 1e-14 ? [SECTION_ROTATION_2D_WARNING] : [];
}

export function convertBeamProperties(
  properties: ElasticBeamSectionProperties,
  targetUnits: UnitSystem,
): ElasticBeamSectionProperties {
  const propertyUnits = properties.units ?? DEFAULT_SECTION_PROPERTY_UNITS;
  const resolver = createUnitResolver(propertyUnits, targetUnits);
  const flexural = (value: number | null | undefined): number | null =>
    value == null
      ? null
      : resolver.convert(value, {
          forceExponent: 1,
          lengthExponent: 2,
        });
  const converted = {
    axialRigidity: resolver.force(properties.axialRigidity),
    flexuralRigidity: flexural(properties.flexuralRigidity) as number,
    flexuralRigidityY: flexural(properties.flexuralRigidityY),
    flexuralRigidityZ: flexural(properties.flexuralRigidityZ),
    shearRigidity:
      properties.shearRigidity == null ? null : resolver.force(properties.shearRigidity),
    shearRigidityY:
      properties.shearRigidityY == null ? null : resolver.force(properties.shearRigidityY),
    shearRigidityZ:
      properties.shearRigidityZ == null ? null : resolver.force(properties.shearRigidityZ),
    shearCorrectionFactor: properties.shearCorrectionFactor ?? null,
    units: targetUnits,
    metadata: { ...properties.metadata },
  };

  return converted;
}

interface NumericDisplacement {
  ux?: number;
  uy?: number;
  rz?: number;
}

interface NumericReaction {
  ux?: number;
  uy?: number;
  rz?: number;
}

function convertDisplacementMap(
  displacementByNode: Record<string, NumericDisplacement>,
  resolver: ReturnType<typeof createUnitResolver>,
): Record<string, { ux: number; uy: number; rz: number }> {
  return Object.fromEntries(
    Object.entries(displacementByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.length(values.ux ?? 0),
        uy: resolver.length(values.uy ?? 0),
        rz: values.rz ?? 0,
      },
    ]),
  );
}

function convertReactionMap(
  reactionByNode: Record<string, NumericReaction>,
  resolver: ReturnType<typeof createUnitResolver>,
): Record<string, { ux: number; uy: number; rz: number }> {
  return Object.fromEntries(
    Object.entries(reactionByNode).map(([nodeId, values]) => [
      nodeId,
      {
        ux: resolver.force(values.ux ?? 0),
        uy: resolver.force(values.uy ?? 0),
        rz: resolver.moment(values.rz ?? 0),
      },
    ]),
  );
}

function extremum<T extends Record<string, unknown>>(
  samples: T[],
  key: string,
  compare: (a: number, b: number) => boolean,
): T | null {
  if (samples.length === 0) {
    return null;
  }

  return samples.reduce((selected, sample) =>
    compare(sample[key] as number, selected[key] as number) ? sample : selected,
  );
}

export interface BeamInternalForceSample extends Record<string, unknown> {
  elementId: string;
  station: number;
  x: number;
  y: number;
  n: number;
  v: number;
  m: number;
  vY: number;
  vZ: number;
  mY: number;
  mZ: number;
  principalActions: ReturnType<typeof splitPrincipalActions>;
}

function summarizeInternalForces(
  samples: BeamInternalForceSample[],
): Record<string, BeamInternalForceSample | null> {
  return {
    maxAxialForce: extremum(samples, "n", (a, b) => a > b),
    minAxialForce: extremum(samples, "n", (a, b) => a < b),
    maxShearForce: extremum(samples, "v", (a, b) => a > b),
    minShearForce: extremum(samples, "v", (a, b) => a < b),
    maxShearForceY: extremum(samples, "vY", (a, b) => a > b),
    minShearForceY: extremum(samples, "vY", (a, b) => a < b),
    maxShearForceZ: extremum(samples, "vZ", (a, b) => a > b),
    minShearForceZ: extremum(samples, "vZ", (a, b) => a < b),
    maxBendingMoment: extremum(samples, "m", (a, b) => a > b),
    minBendingMoment: extremum(samples, "m", (a, b) => a < b),
    maxBendingMomentY: extremum(samples, "mY", (a, b) => a > b),
    minBendingMomentY: extremum(samples, "mY", (a, b) => a < b),
    maxBendingMomentZ: extremum(samples, "mZ", (a, b) => a > b),
    minBendingMomentZ: extremum(samples, "mZ", (a, b) => a < b),
    maxAbsBendingMoment: samples.reduce(
      (selected, sample) => (Math.abs(sample.m) > Math.abs(selected?.m ?? 0) ? sample : selected),
      samples[0] ?? null,
    ),
    maxAbsBendingMomentY: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.mY ?? 0) > Math.abs(selected?.mY ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsBendingMomentZ: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.mZ ?? 0) > Math.abs(selected?.mZ ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsShearForceY: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.vY ?? 0) > Math.abs(selected?.vY ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
    maxAbsShearForceZ: samples.reduce(
      (selected, sample) =>
        Math.abs(sample.vZ ?? 0) > Math.abs(selected?.vZ ?? 0) ? sample : selected,
      samples[0] ?? null,
    ),
  };
}

interface ReactionSample extends Record<string, unknown> {
  supportId: string;
  nodeId: string;
  station: number;
  type: string | null;
  ux: number;
  uy: number;
  rz: number;
}

function summarizeReactions(samples: ReactionSample[]): Record<string, ReactionSample | null> {
  return {
    maxHorizontalReaction: extremum(samples, "ux", (a, b) => a > b),
    minHorizontalReaction: extremum(samples, "ux", (a, b) => a < b),
    maxVerticalReaction: extremum(samples, "uy", (a, b) => a > b),
    minVerticalReaction: extremum(samples, "uy", (a, b) => a < b),
    maxSupportMomentReaction: extremum(samples, "rz", (a, b) => a > b),
    minSupportMomentReaction: extremum(samples, "rz", (a, b) => a < b),
    maxAbsHorizontalReaction: samples.reduce(
      (selected, sample) => (Math.abs(sample.ux) > Math.abs(selected?.ux ?? 0) ? sample : selected),
      samples[0] ?? null,
    ),
    maxAbsVerticalReaction: samples.reduce(
      (selected, sample) => (Math.abs(sample.uy) > Math.abs(selected?.uy ?? 0) ? sample : selected),
      samples[0] ?? null,
    ),
    maxAbsSupportMomentReaction: samples.reduce(
      (selected, sample) => (Math.abs(sample.rz) > Math.abs(selected?.rz ?? 0) ? sample : selected),
      samples[0] ?? null,
    ),
  };
}

export interface BeamResultNode {
  id: string;
  station: number;
  x: number;
  y: number;
  displacement: { ux: number; uy: number; rz: number };
  reaction: { ux: number; uy: number; rz: number };
}

export interface SingleBeamResult extends Record<string, unknown> {
  id: string;
  resultType: string | undefined;
  context: Record<string, unknown>;
  units: UnitSystem;
  geometry: SingleBeamFemModel["outputGeometry"];
  sectionProperties: ElasticBeamSectionProperties;
  sectionRotation: NormalizedSectionRotation;
  warnings: string[];
  nodes: BeamResultNode[];
  supports: Array<Record<string, unknown>>;
  displacementByNode: Record<string, { ux: number; uy: number; rz: number }>;
  reactionByNode: Record<string, { ux: number; uy: number; rz: number }>;
  reactions: Record<string, unknown>;
  displacements: Record<string, unknown>;
  internalForces: Record<string, unknown>;
  fem: { nodeCount: number; elementCount: number; loadCount: number };
}

export interface BeamAnalysisSolution {
  displacementByNode: Record<string, NumericDisplacement>;
  reactionByNode: Record<string, NumericReaction>;
  displacements: number[];
  dofRegistry: DofRegistry;
}

export function sampleBeamResult({
  model,
  femModel,
  solution,
  sectionProperties,
  femUnits,
  elementLoadIndex = null,
}: {
  model: SingleBeamModel;
  femModel: SingleBeamFemModel;
  solution: BeamAnalysisSolution;
  sectionProperties: ElasticBeamSectionProperties;
  femUnits: UnitSystem;
  elementLoadIndex?: ElementLoadIndex<ElementLoadTarget, DistributedLoad> | null;
}): Omit<SingleBeamResult, "id" | "resultType" | "context"> {
  const resolver = createUnitResolver(femUnits, model.units);
  const displacementByNode = convertDisplacementMap(solution.displacementByNode, resolver);
  const reactionByNode = convertReactionMap(solution.reactionByNode, resolver);
  const nodeResults = femModel.nodes.map((node) => ({
    id: node.id,
    station: resolver.length((node.metadata.station as number | undefined) ?? 0),
    x: resolver.length(node.x),
    y: resolver.length(node.y),
    displacement: displacementByNode[node.id] ?? { ux: 0, uy: 0, rz: 0 },
    reaction: reactionByNode[node.id] ?? { ux: 0, uy: 0, rz: 0 },
  }));
  const supports = femModel.supports.map((support) => ({
    id: support.id,
    nodeId: support.node?.id ?? null,
    station: resolver.length((support.metadata.station as number | undefined) ?? 0),
    type: typeof support.metadata.type === "string" ? support.metadata.type : null,
    restraints: { ...support.restraints },
    reaction: support.node ? reactionByNode[support.node.id] : undefined,
  }));
  const reactionSamples: ReactionSample[] = supports.map((support) => ({
    supportId: support.id,
    nodeId: support.nodeId ?? "",
    station: support.station,
    type: support.type,
    ux: support.reaction?.ux ?? 0,
    uy: support.reaction?.uy ?? 0,
    rz: support.reaction?.rz ?? 0,
  }));
  const internalForceSamples: BeamInternalForceSample[] = [];
  const resolvedElementLoadIndex =
    elementLoadIndex ?? createElementLoadIndex<ElementLoadTarget, DistributedLoad>(femModel.loads);

  for (const element of femModel.elements) {
    const elementLoads = resolvedElementLoadIndex.get(element);
    const localStations = [0, element.length() / 2, element.length()];
    const samples = element.sampleInternalForces({
      displacements: solution.displacements,
      dofRegistry: solution.dofRegistry,
      loads: elementLoads,
      stations: localStations,
    });

    for (const sample of samples) {
      const startStation = element.metadata.startStation;
      if (typeof startStation !== "number") {
        throw new Error("SingleBeamResults element start station is unavailable.");
      }
      const station = startStation + sample.x;
      const coordinates = coordinateAtStation(femModel.geometry, station);
      const principalActions = splitPrincipalActions(
        {
          n: resolver.force(sample.n),
          v: resolver.force(sample.v),
          m: resolver.moment(sample.m),
        },
        model.sectionRotation,
      );

      internalForceSamples.push({
        elementId: element.id,
        station: resolver.length(station),
        x: resolver.length(coordinates.x),
        y: resolver.length(coordinates.y),
        n: resolver.force(sample.n),
        v: resolver.force(sample.v),
        m: resolver.moment(sample.m),
        vY: principalActions.vY,
        vZ: principalActions.vZ,
        mY: principalActions.mY,
        mZ: principalActions.mZ,
        principalActions,
      });
    }
  }

  const displacementSamples = nodeResults.map((node) => ({
    nodeId: node.id,
    station: node.station,
    x: node.x,
    y: node.y,
    ux: node.displacement.ux,
    uy: node.displacement.uy,
    rz: node.displacement.rz,
  }));
  const maxAbsVerticalDisplacement = displacementSamples.reduce(
    (selected, sample) => (Math.abs(sample.uy) > Math.abs(selected?.uy ?? 0) ? sample : selected),
    displacementSamples[0] ?? null,
  );

  return {
    units: model.units,
    geometry: femModel.outputGeometry,
    sectionProperties: convertBeamProperties(sectionProperties, model.units),
    sectionRotation: { ...model.sectionRotation },
    warnings: sectionRotationWarnings(model.sectionRotation),
    nodes: nodeResults,
    supports,
    displacementByNode,
    reactionByNode,
    reactions: {
      samples: reactionSamples,
      ...summarizeReactions(reactionSamples),
    },
    displacements: {
      samples: displacementSamples,
      maxAbsVerticalDisplacement,
    },
    internalForces: {
      samples: internalForceSamples,
      ...summarizeInternalForces(internalForceSamples),
    },
    fem: {
      nodeCount: femModel.nodes.length,
      elementCount: femModel.elements.length,
      loadCount: femModel.allLoads.length,
    },
  };
}
