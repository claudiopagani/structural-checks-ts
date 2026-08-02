// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/connectors/ShearConnector.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export interface ShearConnectorOptions extends Record<string, unknown> {
  id?: unknown;
  name?: unknown;
  family?: unknown;
  producer?: unknown;
  kser?: number | null;
  ku?: number | null;
  fvrk?: number | null;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface ShearConnectorJson extends Record<string, unknown> {
  id: unknown;
  name: unknown;
  family: unknown;
  producer: unknown;
  kser: number;
  ku: number;
  fvrk: number;
  units: UnitSystem;
  metadata: Record<string, unknown>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export class ShearConnector {
  id: unknown;
  name: unknown;
  family: unknown;
  producer: unknown;
  kser: number;
  ku: number;
  fvrk: number;
  units: UnitSystem;
  metadata: Record<string, unknown>;

  constructor({
    id = null,
    name,
    family = null,
    producer = null,
    kser,
    ku,
    fvrk,
    units = null,
    metadata = {},
  }: ShearConnectorOptions) {
    assertExplicitUnitSystem(units, "ShearConnector");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const resolvedKser = unitResolver.translationalStiffness(kser);
    const resolvedKu = unitResolver.translationalStiffness(ku);
    const resolvedFvrk = unitResolver.force(fvrk);

    if (!name) {
      throw new Error("A connector name is required.");
    }

    if (!isFiniteNumber(resolvedKser) || resolvedKser <= 0) {
      throw new Error("Connector Kser must be positive.");
    }

    if (!isFiniteNumber(resolvedKu) || resolvedKu <= 0) {
      throw new Error("Connector Ku must be positive.");
    }

    if (!isFiniteNumber(resolvedFvrk) || resolvedFvrk <= 0) {
      throw new Error("Connector Fvrk must be positive.");
    }

    this.id = id;
    this.name = name;
    this.family = family;
    this.producer = producer;
    this.kser = resolvedKser;
    this.ku = resolvedKu;
    this.fvrk = resolvedFvrk;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  toJSON(): ShearConnectorJson {
    return {
      id: this.id,
      name: this.name,
      family: this.family,
      producer: this.producer,
      kser: this.kser,
      ku: this.ku,
      fvrk: this.fvrk,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
