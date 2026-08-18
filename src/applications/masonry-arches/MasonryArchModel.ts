import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
} from "../../domain/units/UnitSystem.js";
import { normalizeMasonryInterfaceLaw } from "../../domain/masonry/interfaces/normalizeMasonryInterfaceLaw.js";
import { buildSimplifiedMasonryArchGeometry } from "./geometry.js";
import {
  MASONRY_ARCH_MODEL_SCHEMA_VERSION,
  type ArchDeviatorLayoutInput,
  type ArchDeviceCapacityInput,
  type ArchDeviceConnectorGroupInput,
  type ArchReinforcementInput,
  type ArchReinforcementTerminationInput,
  type ArchStationedDeviceInput,
  type BondedLayerReinforcementInput,
  type MasonryArchFillLoadInput,
  type MasonryArchLoadInput,
  type MasonryArchModelInput,
  type NormalizedMasonryArchLoad,
  type NormalizedMasonryArchModel,
  type NormalizedArchDeviceCapacity,
  type NormalizedArchConnectorGroup,
  type NormalizedArchReinforcement,
  type NormalizedArchReinforcementTermination,
  type NormalizedArchStationedDevice,
  type NormalizedBondedLayerReinforcement,
  type SimplifiedSymmetricMasonryArchGeometryInput,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" } as const);

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function positive(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return resolved;
}

function nonNegative(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return resolved;
}

function normalizedStation(value: number | undefined, fallback: number, label: string): number {
  const resolved = finite(value ?? fallback, label);
  if (resolved < 0 || resolved > 1) {
    throw new Error(`${label} must satisfy 0 <= station <= 1.`);
  }
  return resolved;
}

function loadCaseId(load: MasonryArchLoadInput): string {
  const id = load.loadCaseId ?? load.loadCase?.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error(`Arch load ${load.id} requires an explicit load case id.`);
  }
  return id;
}

function loadInterval(load: MasonryArchFillLoadInput): {
  readonly startStation: number;
  readonly endStation: number;
} {
  const startStation = normalizedStation(load.startStation, 0, `${load.id}.startStation`);
  const endStation = normalizedStation(load.endStation, 1, `${load.id}.endStation`);
  if (endStation <= startStation) {
    throw new Error(`${load.id} requires endStation greater than startStation.`);
  }
  return { startStation, endStation };
}

function normalizeLoad(
  load: MasonryArchLoadInput,
  resolver: UnitResolver,
  referenceCurve: SimplifiedSymmetricMasonryArchGeometryInput["referenceCurve"],
): NormalizedMasonryArchLoad {
  if (typeof load.id !== "string" || load.id.trim().length === 0) {
    throw new Error("Every arch load requires a non-empty id.");
  }
  const caseId = loadCaseId(load);

  if (load.type === "self-weight") {
    return { id: load.id, type: load.type, loadCaseId: caseId };
  }
  if (load.type === "fill") {
    const interval = loadInterval(load);
    return {
      id: load.id,
      type: load.type,
      loadCaseId: caseId,
      unitWeight: positive(resolver.volumeLoad(load.unitWeight), `${load.id}.unitWeight`),
      crownCoverDepth: positiveOrZero(
        resolver.length(load.crownCoverDepth ?? 0),
        `${load.id}.crownCoverDepth`,
      ),
      ...interval,
    };
  }
  if (load.type === "uniform" || load.type === "patch") {
    const common = {
      id: load.id,
      loadCaseId: caseId,
      components: {
        x: finite(resolver.lineLoad(load.components.x), `${load.id}.components.x`),
        y: finite(resolver.lineLoad(load.components.y), `${load.id}.components.y`),
      },
      distributionBasis: load.distributionBasis ?? "horizontal-projection",
      distributionCurve: load.distributionCurve ?? referenceCurve,
      applicationCurve: load.applicationCurve ?? "extrados",
    } as const;
    if (load.type === "uniform") {
      return { ...common, type: "uniform" };
    }
    const startStation = normalizedStation(load.startStation, 0, `${load.id}.startStation`);
    const endStation = normalizedStation(load.endStation, 1, `${load.id}.endStation`);
    if (endStation <= startStation) {
      throw new Error(`${load.id} requires endStation greater than startStation.`);
    }
    return { ...common, type: "patch", startStation, endStation };
  }

  const station = normalizedStation(load.station, 0, `${load.id}.station`);
  return {
    id: load.id,
    type: load.type,
    loadCaseId: caseId,
    station,
    force: {
      x: finite(resolver.force(load.force.x), `${load.id}.force.x`),
      y: finite(resolver.force(load.force.y), `${load.id}.force.y`),
    },
    moment: finite(resolver.moment(load.moment ?? 0), `${load.id}.moment`),
    applicationCurve: load.applicationCurve ?? "extrados",
    targetVoussoirId: load.targetVoussoirId ?? null,
  };
}

function positiveOrZero(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return resolved;
}

function normalizeDeviceCapacity(
  input: ArchDeviceCapacityInput | undefined,
  resolver: UnitResolver,
  label: string,
): NormalizedArchDeviceCapacity {
  return {
    normalResistance:
      input?.normalResistance === undefined
        ? null
        : positive(resolver.force(input.normalResistance), `${label}.normalResistance`),
    shearResistance:
      input?.shearResistance === undefined
        ? null
        : positive(resolver.force(input.shearResistance), `${label}.shearResistance`),
    resultantResistance:
      input?.resultantResistance === undefined
        ? null
        : positive(resolver.force(input.resultantResistance), `${label}.resultantResistance`),
    interactionRule: input?.interactionRule ?? "independent",
  };
}

function normalizeConnectorGroup(
  input: ArchDeviceConnectorGroupInput | undefined,
  resolver: UnitResolver,
  label: string,
): NormalizedArchConnectorGroup {
  const connectorCount = input?.connectorCount ?? 1;
  if (!Number.isInteger(connectorCount) || connectorCount < 1) {
    throw new Error(`${label}.connectorCount must be a positive integer.`);
  }
  const suppliedWeights = input?.loadShareWeights;
  if (suppliedWeights !== undefined && suppliedWeights.length !== connectorCount) {
    throw new Error(`${label}.loadShareWeights must contain one value per connector.`);
  }
  const weights =
    suppliedWeights?.map((weight, index) =>
      positive(weight, `${label}.loadShareWeights[${index}]`),
    ) ?? Array.from({ length: connectorCount }, () => 1 / connectorCount);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightSum - 1) > 1e-9) {
    throw new Error(`${label}.loadShareWeights must sum to one.`);
  }
  return {
    connectorCount,
    loadShareWeights: weights.map((weight) => weight / weightSum),
    capacity: normalizeDeviceCapacity(input?.capacity, resolver, `${label}.capacity`),
  };
}

function normalizeReinforcementTermination(
  input: ArchReinforcementTerminationInput | undefined,
  resolver: UnitResolver,
  label: string,
): NormalizedArchReinforcementTermination {
  if (input === undefined) {
    throw new Error(
      `${label} is required: every open tendon must declare an arch-anchor or external-anchor termination on each side.`,
    );
  }
  if (input.type === "arch-anchor") {
    const station = normalizedStation(input.station, 0, `${label}.station`);
    return {
      type: "arch-anchor",
      station,
      connectors: normalizeConnectorGroup(input.connectors, resolver, `${label}.connectors`),
    };
  }
  if (input.type === "external-anchor") {
    return {
      type: "external-anchor",
      point: {
        x: finite(resolver.length(input.point.x), `${label}.point.x`),
        y: finite(resolver.length(input.point.y), `${label}.point.y`),
      },
      capacity: normalizeDeviceCapacity(input.capacity, resolver, `${label}.capacity`),
    };
  }
  throw new Error(`${label} has an unsupported termination type.`);
}

function normalizeStationedDevice(
  input: ArchStationedDeviceInput,
  resolver: UnitResolver,
  label: string,
): NormalizedArchStationedDevice {
  return {
    station: normalizedStation(input.station, 0, `${label}.station`),
    connectors: normalizeConnectorGroup(input.connectors, resolver, `${label}.connectors`),
  };
}

/**
 * Resolves an interior-deviator layout into an explicit, strictly increasing station list.
 * Deviators are interior devices only: stations must lie strictly inside (0, 1) and can never
 * coincide with a terminal or return-deviator station.
 */
function normalizeDeviatorLayout(
  input: ArchDeviatorLayoutInput | undefined,
  resolver: UnitResolver,
  label: string,
): readonly NormalizedArchStationedDevice[] {
  if (input === undefined || input.type === "uniform-count") {
    const count = input?.count ?? 1;
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`${label}.deviators.count must be a positive integer.`);
    }
    const connectors = normalizeConnectorGroup(input?.connectors, resolver, `${label}.connectors`);
    return Array.from({ length: count }, (_, index) => ({
      station: (index + 1) / (count + 1),
      connectors,
    }));
  }
  const deviators = input.deviators.map((device, index) =>
    normalizeStationedDevice(device, resolver, `${label}.deviators[${index}]`),
  );
  if (deviators.length === 0) {
    throw new Error(
      `${label}.deviators must not be empty; use uniform-count with a positive count.`,
    );
  }
  for (let index = 0; index < deviators.length; index += 1) {
    const station = deviators[index]!.station;
    if (station <= 0 || station >= 1) {
      throw new Error(`${label}.deviators[${index}].station must lie strictly inside (0, 1).`);
    }
    if (index > 0 && station <= deviators[index - 1]!.station) {
      throw new Error(`${label}.deviators stations must be strictly increasing.`);
    }
  }
  return deviators;
}

function assertDistinctStations(
  stations: readonly { readonly station: number; readonly label: string }[],
): void {
  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index]!.station <= stations[index - 1]!.station) {
      throw new Error(
        `${stations[index]!.label} must have a station strictly greater than ${stations[index - 1]!.label}; overlapping devices are not allowed.`,
      );
    }
  }
}

function normalizeReinforcement(
  input: ArchReinforcementInput,
  resolver: UnitResolver,
  voussoirCount: number,
): NormalizedArchReinforcement {
  const label = `reinforcements.${input.id}`;
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error("Every arch reinforcement requires a non-empty id.");
  }
  const area = positive(resolver.area(input.area), `${label}.area`);
  const elasticModulus = positive(resolver.stress(input.elasticModulus), `${label}.elasticModulus`);
  const initialForce = nonNegative(resolver.force(input.initialForce), `${label}.initialForce`);
  const yieldStrength =
    input.yieldStrength === undefined
      ? null
      : positive(resolver.stress(input.yieldStrength), `${label}.yieldStrength`);
  const tensileStrength =
    input.tensileStrength === undefined
      ? null
      : positive(resolver.stress(input.tensileStrength), `${label}.tensileStrength`);
  if (yieldStrength !== null && tensileStrength !== null && yieldStrength > tensileStrength) {
    throw new Error(`${label}.yieldStrength cannot exceed tensileStrength.`);
  }
  const ultimateStrain =
    input.ultimateStrain === undefined
      ? null
      : positive(input.ultimateStrain, `${label}.ultimateStrain`);
  const common = {
    id: input.id,
    area,
    elasticModulus,
    initialForce,
    yieldStrength,
    tensileStrength,
    ultimateStrain,
  } as const;

  if (input.side === "intrados") {
    if (input.topology.type === "open") {
      const left = normalizeReinforcementTermination(
        input.topology.left,
        resolver,
        `${label}.topology.left`,
      );
      const right = normalizeReinforcementTermination(
        input.topology.right,
        resolver,
        `${label}.topology.right`,
      );
      const deviators = normalizeDeviatorLayout(
        input.topology.deviators,
        resolver,
        `${label}.topology`,
      );
      assertDistinctStations([
        ...(left.type === "arch-anchor"
          ? [{ station: left.station, label: `${label}.topology.left` }]
          : []),
        ...deviators.map((device, index) => ({
          station: device.station,
          label: `${label}.topology.deviators[${index}]`,
        })),
        ...(right.type === "arch-anchor"
          ? [{ station: right.station, label: `${label}.topology.right` }]
          : []),
      ]);
      if (left.type === "arch-anchor" && right.type === "arch-anchor" && deviators.length < 1) {
        throw new Error(
          `${label} with two arch anchors requires at least one interior deviator: a single straight chord is a degenerate intrados path.`,
        );
      }
      return {
        ...common,
        side: "intrados",
        topology: { type: "open", left, right, deviators },
      };
    }
    const leftReturnDeviator = normalizeStationedDevice(
      input.topology.leftReturnDeviator,
      resolver,
      `${label}.topology.leftReturnDeviator`,
    );
    const rightReturnDeviator = normalizeStationedDevice(
      input.topology.rightReturnDeviator,
      resolver,
      `${label}.topology.rightReturnDeviator`,
    );
    const deviators = normalizeDeviatorLayout(
      input.topology.deviators,
      resolver,
      `${label}.topology`,
    );
    assertDistinctStations([
      { station: leftReturnDeviator.station, label: `${label}.topology.leftReturnDeviator` },
      ...deviators.map((device, index) => ({
        station: device.station,
        label: `${label}.topology.deviators[${index}]`,
      })),
      { station: rightReturnDeviator.station, label: `${label}.topology.rightReturnDeviator` },
    ]);
    if (deviators.length < 1) {
      throw new Error(
        `${label} closed loop requires at least one interior deviator: the loop would degenerate into the return segment traversed twice.`,
      );
    }
    return {
      ...common,
      side: "intrados",
      topology: {
        type: "closed-loop",
        leftReturnDeviator,
        rightReturnDeviator,
        deviators,
      },
    };
  }

  if (input.side === "extrados") {
    if (input.topology.type !== "open") {
      throw new Error(`${label}: extrados reinforcement does not support a closed loop.`);
    }
    const left = normalizeReinforcementTermination(
      input.topology.left,
      resolver,
      `${label}.topology.left`,
    );
    const right = normalizeReinforcementTermination(
      input.topology.right,
      resolver,
      `${label}.topology.right`,
    );
    assertDistinctStations([
      ...(left.type === "arch-anchor"
        ? [{ station: left.station, label: `${label}.topology.left` }]
        : []),
      ...(right.type === "arch-anchor"
        ? [{ station: right.station, label: `${label}.topology.right` }]
        : []),
    ]);
    const interaction = input.topology.interaction;
    if (interaction !== undefined && interaction.type !== "unilateral-contact") {
      throw new Error(`${label}.topology.interaction has an unsupported interaction type.`);
    }
    const segmentCount = interaction?.segmentCount ?? Math.max(32, 2 * voussoirCount);
    if (!Number.isInteger(segmentCount) || segmentCount < 2) {
      throw new Error(
        `${label}.topology.interaction.segmentCount must be an integer not smaller than two.`,
      );
    }
    return {
      ...common,
      side: "extrados",
      topology: {
        type: "open",
        left,
        right,
        interaction: { type: "unilateral-contact", segmentCount },
      },
    };
  }

  throw new Error(
    `${label} has an unsupported side: ${String((input as { side?: unknown }).side)}.`,
  );
}

function normalizeBondedLayer(
  input: BondedLayerReinforcementInput,
  resolver: UnitResolver,
): NormalizedBondedLayerReinforcement {
  const label = `bondedLayers.${input.id}`;
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    throw new Error("Every bonded layer requires a non-empty id.");
  }
  const area = positive(resolver.area(input.area), `${label}.area`);
  const elasticModulus = positive(resolver.stress(input.elasticModulus), `${label}.elasticModulus`);
  const tensileStrength =
    input.tensileStrength === undefined
      ? null
      : positive(resolver.stress(input.tensileStrength), `${label}.tensileStrength`);
  const debondingStrain =
    input.debondingStrain === undefined
      ? null
      : positive(input.debondingStrain, `${label}.debondingStrain`);
  const ultimateStrain =
    input.ultimateStrain === undefined
      ? null
      : positive(input.ultimateStrain, `${label}.ultimateStrain`);
  const capacityCandidates = [
    tensileStrength === null
      ? null
      : { limit: "tensile-strength" as const, force: area * tensileStrength },
    debondingStrain === null
      ? null
      : { limit: "debonding-strain" as const, force: area * elasticModulus * debondingStrain },
    ultimateStrain === null
      ? null
      : { limit: "ultimate-strain" as const, force: area * elasticModulus * ultimateStrain },
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  if (capacityCandidates.length === 0) {
    throw new Error(
      `${label} requires tensileStrength, debondingStrain, or ultimateStrain to define capacity.`,
    );
  }
  const governing = capacityCandidates.reduce((minimum, candidate) =>
    candidate.force < minimum.force ? candidate : minimum,
  );
  const startStation = normalizedStation(input.startStation, 0, `${label}.startStation`);
  const endStation = normalizedStation(input.endStation, 1, `${label}.endStation`);
  if (endStation <= startStation) {
    throw new Error(`${label} requires endStation greater than startStation.`);
  }
  return {
    id: input.id,
    family: input.family,
    side: input.side,
    area,
    elasticModulus,
    tensileStrength,
    debondingStrain,
    ultimateStrain,
    startStation,
    endStation,
    tensileCapacity: governing.force,
    governingCapacityLimit: governing.limit,
  };
}

function normalizeGeometryInput(
  geometry: SimplifiedSymmetricMasonryArchGeometryInput,
  resolver: UnitResolver,
): SimplifiedSymmetricMasonryArchGeometryInput {
  return {
    kind: geometry.kind,
    referenceCurve: geometry.referenceCurve,
    profile: { ...geometry.profile },
    span: resolver.length(geometry.span),
    rise: resolver.length(geometry.rise),
    thickness: resolver.length(geometry.thickness),
    outOfPlaneWidth: resolver.length(geometry.outOfPlaneWidth),
    voussoirCount: geometry.voussoirCount,
    ...(geometry.keystone === undefined
      ? {}
      : { keystone: { arcLength: resolver.length(geometry.keystone.arcLength) } }),
    ...(geometry.stationing === undefined ? {} : { stationing: geometry.stationing }),
  };
}

export class MasonryArchModel implements NormalizedMasonryArchModel {
  readonly schemaVersion = MASONRY_ARCH_MODEL_SCHEMA_VERSION;
  readonly id: string;
  readonly sourceUnits: NormalizedMasonryArchModel["sourceUnits"];
  readonly units = INTERNAL_UNITS;
  readonly geometry: NormalizedMasonryArchModel["geometry"];
  readonly masonry: NormalizedMasonryArchModel["masonry"];
  readonly interfaceLaw: NormalizedMasonryArchModel["interfaceLaw"];
  readonly supports: NormalizedMasonryArchModel["supports"];
  readonly loads: NormalizedMasonryArchModel["loads"];
  readonly reinforcements: NormalizedMasonryArchModel["reinforcements"];
  readonly bondedLayers: NormalizedMasonryArchModel["bondedLayers"];
  readonly metadata: Record<string, unknown>;

  constructor(input: MasonryArchModelInput) {
    if (typeof input.id !== "string" || input.id.trim().length === 0) {
      throw new Error("Masonry arch model requires a non-empty id.");
    }
    this.id = input.id;
    this.sourceUnits = assertExplicitUnitSystem(input.units, "MasonryArchModel");
    const resolver = createUnitResolver(this.sourceUnits, INTERNAL_UNITS);
    this.geometry = buildSimplifiedMasonryArchGeometry(
      normalizeGeometryInput(input.geometry, resolver),
    );
    const unitWeight =
      input.masonry?.unitWeight === undefined
        ? null
        : positive(
            resolver.volumeLoad(input.masonry.unitWeight),
            "Masonry arch masonry.unitWeight",
          );
    this.masonry = { unitWeight };

    this.interfaceLaw = normalizeMasonryInterfaceLaw(input.interfaceLaw, resolver, "interfaceLaw");

    for (const [side, support] of [
      ["left", input.supports?.left],
      ["right", input.supports?.right],
    ] as const) {
      if (support !== undefined && support.type !== "rigid-contact") {
        throw new Error(`Unsupported ${side} arch support type: ${String(support.type)}.`);
      }
    }
    this.supports = {
      left: {
        type: "rigid-contact",
        interfaceLaw: normalizeMasonryInterfaceLaw(
          input.supports?.left?.interfaceLaw ?? input.interfaceLaw,
          resolver,
          "supports.left.interfaceLaw",
        ),
      },
      right: {
        type: "rigid-contact",
        interfaceLaw: normalizeMasonryInterfaceLaw(
          input.supports?.right?.interfaceLaw ?? input.interfaceLaw,
          resolver,
          "supports.right.interfaceLaw",
        ),
      },
    };

    const loads = (input.loads ?? []).map((load) =>
      normalizeLoad(load, resolver, this.geometry.referenceCurve),
    );
    const ids = new Set<string>();
    for (const load of loads) {
      if (ids.has(load.id)) {
        throw new Error(`Duplicate masonry arch load id: ${load.id}.`);
      }
      ids.add(load.id);
      if (load.type === "self-weight" && unitWeight === null) {
        throw new Error("Masonry unitWeight is required when a self-weight load is present.");
      }
    }
    this.loads = loads;

    const reinforcements = (input.reinforcements ?? []).map((reinforcement) =>
      normalizeReinforcement(reinforcement, resolver, this.geometry.voussoirCount),
    );
    const reinforcementIds = new Set<string>();
    for (const reinforcement of reinforcements) {
      if (reinforcementIds.has(reinforcement.id)) {
        throw new Error(`Duplicate masonry arch reinforcement id: ${reinforcement.id}.`);
      }
      reinforcementIds.add(reinforcement.id);
    }
    this.reinforcements = reinforcements;
    const bondedLayers = (input.bondedLayers ?? []).map((layer) =>
      normalizeBondedLayer(layer, resolver),
    );
    for (const layer of bondedLayers) {
      if (reinforcementIds.has(layer.id)) {
        throw new Error(`Duplicate masonry arch reinforcement id: ${layer.id}.`);
      }
      reinforcementIds.add(layer.id);
    }
    this.bondedLayers = bondedLayers;
    this.metadata = { ...(input.metadata ?? {}) };
  }

  toJSON(): NormalizedMasonryArchModel {
    return {
      schemaVersion: this.schemaVersion,
      id: this.id,
      sourceUnits: { ...this.sourceUnits },
      units: { ...this.units },
      geometry: this.geometry,
      masonry: { ...this.masonry },
      interfaceLaw: { ...this.interfaceLaw },
      supports: {
        left: { ...this.supports.left },
        right: { ...this.supports.right },
      },
      loads: [...this.loads],
      reinforcements: [...this.reinforcements],
      bondedLayers: [...this.bondedLayers],
      metadata: { ...this.metadata },
    };
  }
}

export function createMasonryArch(input: MasonryArchModelInput): MasonryArchModel {
  return new MasonryArchModel(input);
}

export function asMasonryArchModel(
  model: MasonryArchModel | NormalizedMasonryArchModel | MasonryArchModelInput,
): NormalizedMasonryArchModel {
  if (model instanceof MasonryArchModel) return model;
  if ("schemaVersion" in model && model.schemaVersion === MASONRY_ARCH_MODEL_SCHEMA_VERSION) {
    return model;
  }
  return new MasonryArchModel(model);
}
