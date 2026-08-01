import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import type { SectionMetadata } from "../geometry/CrossSection.js";

const REINFORCEMENT_GRADES: ReadonlySet<string> = new Set(["B450A", "B450C"]);

export type ReinforcementGrade = "B450A" | "B450C";

export interface ReinforcementBarOptions {
  id?: string | null;
  name?: string | null;
  diameter?: number | null;
  area?: number | null;
  grade?: ReinforcementGrade;
  material?: unknown;
  y?: number | null;
  z?: number | null;
  units?: UnitSystemInput | null;
  metadata?: SectionMetadata;
}

export interface ReinforcementBarJson {
  id: string | null;
  name: string;
  diameter: number;
  area: number;
  grade: ReinforcementGrade;
  material: unknown;
  y: number | null;
  z: number | null;
  units: UnitSystem;
  metadata: SectionMetadata;
}

interface Serializable {
  toJSON: () => unknown;
}

function serialize(value: unknown): unknown {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    "toJSON" in value &&
    (value as { toJSON?: unknown }).toJSON
  ) {
    return (value as Serializable).toJSON();
  }

  return value;
}

export class ReinforcementBar {
  id: string | null;
  name: string;
  diameter: number;
  area: number;
  grade: ReinforcementGrade;
  material: unknown;
  y: number | null;
  z: number | null;
  units: UnitSystem;
  metadata: SectionMetadata;

  constructor({
    id = null,
    name = null,
    diameter = null,
    area = null,
    grade = "B450C",
    material = null,
    y = null,
    z = null,
    units = null,
    metadata = {},
  }: ReinforcementBarOptions) {
    if (!REINFORCEMENT_GRADES.has(grade)) {
      throw new Error(`Unsupported reinforcement grade: ${grade}.`);
    }

    assertExplicitUnitSystem(units, "ReinforcementBar");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    if (diameter == null && area == null) {
      throw new Error("ReinforcementBar requires either a diameter or an area.");
    }

    const resolvedDiameter = diameter == null ? null : unitResolver.length(Number(diameter));
    const resolvedArea =
      area == null
        ? (Math.PI * Number(resolvedDiameter) ** 2) / 4
        : unitResolver.area(Number(area));
    const normalizedDiameter =
      diameter == null ? Math.sqrt((4 * Number(resolvedArea)) / Math.PI) : resolvedDiameter;

    if (!Number.isFinite(resolvedArea) || resolvedArea <= 0) {
      throw new Error("ReinforcementBar area must be positive.");
    }

    if (
      normalizedDiameter == null ||
      !Number.isFinite(normalizedDiameter) ||
      normalizedDiameter <= 0
    ) {
      throw new Error("ReinforcementBar diameter must be positive.");
    }

    this.id = id;
    this.name = name ?? `Rebar ${grade} d${normalizedDiameter}`;
    this.diameter = normalizedDiameter;
    this.area = resolvedArea;
    this.grade = grade;
    this.material = material;
    this.y = unitResolver.length(y);
    this.z = unitResolver.length(z);
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  areaPerSpacing(spacing: number): number {
    if (!Number.isFinite(spacing) || spacing <= 0) {
      throw new Error("A positive spacing is required.");
    }

    return this.area / spacing;
  }

  distributedArea(width: number, spacing: number): number {
    if (!Number.isFinite(width) || width <= 0) {
      throw new Error("A positive width is required.");
    }

    return this.areaPerSpacing(spacing) * width;
  }

  toJSON(): ReinforcementBarJson {
    return {
      id: this.id,
      name: this.name,
      diameter: this.diameter,
      area: this.area,
      grade: this.grade,
      material: serialize(this.material),
      y: this.y,
      z: this.z,
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
