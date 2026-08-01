import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../units/UnitSystem.js";
import type {
  PunchingActionSource,
  PunchingActionStateJson,
  PunchingActionStateOptions,
  PunchingDemand,
  PunchingDemandInput,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;
const SOURCE_METHODS: ReadonlySet<string> = new Set([
  "manual",
  "joint-equilibrium",
  "integrated-contour",
]);

function finite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }

  return value as number;
}

function normalizeCombinationType(value: string | null | undefined): string | null {
  if (value == null || value === "") {
    return null;
  }

  return String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, "_");
}

function normalizeSource(source: PunchingActionSource | null | undefined): PunchingActionSource {
  if (source != null && (typeof source !== "object" || Array.isArray(source))) {
    throw new Error("Punching action source must be an object.");
  }

  const normalized: PunchingActionSource = structuredClone(source ?? { method: "manual" });
  normalized.method ??= "manual";

  if (!SOURCE_METHODS.has(normalized.method)) {
    throw new Error(`Unsupported punching action source method: ${normalized.method}.`);
  }

  return normalized;
}

function optionalNonNegativeForce(
  value: unknown,
  resolver: UnitResolver,
  label: string,
): number | null {
  if (value == null) {
    return null;
  }

  const normalized = resolver.force(finite(Number(value), label));

  if (normalized < 0) {
    throw new Error(`${label} must be non-negative.`);
  }

  return normalized;
}

function normalizePerimeterForceMap(
  input: Record<string, number | null> | null | undefined,
  resolver: UnitResolver,
  label: string,
): Record<string, number | null> {
  if (input == null) {
    return {};
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${label} must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(input).map(([role, value]) => [
      role,
      optionalNonNegativeForce(value, resolver, `${label}.${role}`),
    ]),
  );
}

function normalizePunchingDemand(
  input: PunchingDemandInput | null | undefined,
  resolver: UnitResolver,
): PunchingDemand | null {
  if (input == null) {
    return null;
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("punchingDemand must be an object or null.");
  }

  return {
    supportReaction: optionalNonNegativeForce(
      input.supportReaction,
      resolver,
      "punchingDemand.supportReaction",
    ),
    punchingForce: optionalNonNegativeForce(
      input.punchingForce,
      resolver,
      "punchingDemand.punchingForce",
    ),
    punchingForceByPerimeter: normalizePerimeterForceMap(
      input.punchingForceByPerimeter,
      resolver,
      "punchingDemand.punchingForceByPerimeter",
    ),
    enclosedLoadByPerimeter: normalizePerimeterForceMap(
      input.enclosedLoadByPerimeter,
      resolver,
      "punchingDemand.enclosedLoadByPerimeter",
    ),
    lineOfAction:
      input.lineOfAction == null
        ? null
        : {
            x: resolver.length(
              finite(Number(input.lineOfAction.x), "punchingDemand.lineOfAction.x"),
            ),
            y: resolver.length(
              finite(Number(input.lineOfAction.y), "punchingDemand.lineOfAction.y"),
            ),
          },
    source: structuredClone(input.source ?? { method: "explicit" }),
  };
}

export const PUNCHING_ACTION_SCHEMA_VERSION = "rc-punching-action-state/v0";

export class PunchingActionState {
  id: string;
  connectionId: string;
  localFrameId: string | null;
  schemaVersion = PUNCHING_ACTION_SCHEMA_VERSION;
  combinationType: string | null;
  units = INTERNAL_UNITS;
  referencePoint: PunchingActionStateJson["referencePoint"];
  components: PunchingActionStateJson["components"];
  punchingDemand: PunchingDemand | null;
  source: PunchingActionSource;
  metadata: Record<string, unknown>;

  constructor({
    id,
    connectionId,
    localFrameId = null,
    combinationType = null,
    units = null,
    referencePoint = {},
    components = {},
    punchingDemand = null,
    source = { method: "manual" },
    metadata = {},
  }: PunchingActionStateOptions = {}) {
    if (!id) {
      throw new Error("A punching action state id is required.");
    }

    if (!connectionId) {
      throw new Error("PunchingActionState requires a connectionId.");
    }

    assertExplicitUnitSystem(units, "PunchingActionState");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.connectionId = connectionId;
    this.localFrameId = localFrameId;
    this.combinationType = normalizeCombinationType(combinationType);
    this.referencePoint = {
      x: resolver.length(finite(Number(referencePoint.x ?? 0), "referencePoint.x")),
      y: resolver.length(finite(Number(referencePoint.y ?? 0), "referencePoint.y")),
      z: resolver.length(finite(Number(referencePoint.z ?? 0), "referencePoint.z")),
    };
    this.components = {
      fz: resolver.force(finite(Number(components.fz ?? 0), "components.fz")),
      mx: resolver.moment(finite(Number(components.mx ?? 0), "components.mx")),
      my: resolver.moment(finite(Number(components.my ?? 0), "components.my")),
    };
    this.punchingDemand = normalizePunchingDemand(punchingDemand, resolver);
    this.source = normalizeSource(source);
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
      componentConvention: "right-handed-actions-exerted-on-slab-in-connection-local-frame",
    };
  }

  toJSON(): PunchingActionStateJson {
    return {
      id: this.id,
      connectionId: this.connectionId,
      localFrameId: this.localFrameId,
      schemaVersion: this.schemaVersion,
      combinationType: this.combinationType,
      units: { ...this.units },
      referencePoint: { ...this.referencePoint },
      components: { ...this.components },
      punchingDemand: structuredClone(this.punchingDemand),
      source: structuredClone(this.source),
      metadata: { ...this.metadata },
    };
  }
}
