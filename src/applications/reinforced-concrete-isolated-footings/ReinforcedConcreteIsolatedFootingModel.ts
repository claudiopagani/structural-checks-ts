import type { ConcreteMaterial } from "../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../domain/materials/SteelMaterial.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../domain/units/UnitSystem.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

export interface FootingGeometryInput {
  widthX?: number;
  widthY?: number;
  thickness?: number;
}

export interface FootingColumnInput {
  widthX?: number;
  widthY?: number;
  offsetX?: number | null;
  offsetY?: number | null;
  rotation?: number | null;
}

export interface FootingActionsInput {
  columnVerticalForce?: number;
  nEd?: number;
  uniformDownwardPressure?: number;
  horizontalX?: number;
  horizontalY?: number;
  momentX?: number;
  momentY?: number;
  mxEd?: number;
  myEd?: number;
}

export interface FootingSoilInput {
  designBearingResistance?: number;
  designSlidingResistance?: number | null;
  bearingResistanceSource?: unknown;
  slidingResistanceSource?: unknown;
}

export interface FootingReinforcementLayerInput {
  diameter?: number;
  spacing?: number;
  clearCover?: number;
  layerOffset?: number;
}

export interface FootingReinforcementLayer {
  diameter: number;
  spacing: number;
  clearCover: number;
  layerOffset: number;
  axisFromBottom: number;
  barsPerMeter: number;
  areaPerMeter: number;
}

export interface FootingAnchorageInput extends Record<string, unknown> {
  diameter?: number;
  availableLength?: number;
  designSteelStress?: number | null;
  fctd?: number | null;
}

export interface NormalizedFootingAnchorage extends Record<string, unknown> {
  diameter: number;
  availableLength: number;
  designSteelStress: number | null;
  fctd: number | null;
}

export interface ReinforcedConcreteIsolatedFootingModelInput {
  id: string;
  geometry?: FootingGeometryInput;
  column?: FootingColumnInput;
  actions?: FootingActionsInput;
  soil?: FootingSoilInput;
  materials?: {
    concreteMaterial?: ConcreteMaterial;
    reinforcementMaterial?: SteelMaterial;
  };
  reinforcement?: {
    bottom?: {
      x?: FootingReinforcementLayerInput;
      y?: FootingReinforcementLayerInput;
    };
    punching?: Record<string, unknown> | null;
  };
  punching?: Record<string, unknown>;
  localBearing?: {
    distributionArea?: number | null;
    resistanceReductionFactor?: number;
  };
  anchorage?: {
    columnBars?: FootingAnchorageInput | null;
    footingBars?: {
      x?: FootingAnchorageInput | null;
      y?: FootingAnchorageInput | null;
    };
  };
  mesh?: Record<string, unknown>;
  solver?: Record<string, unknown>;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface ReinforcedConcreteIsolatedFootingJson {
  id: string;
  geometry: { widthX: number; widthY: number; thickness: number };
  column: { widthX: number; widthY: number };
  actions: {
    columnVerticalForce: number;
    uniformDownwardPressure: number;
    horizontalX: number;
    horizontalY: number;
    momentX: number;
    momentY: number;
    referencePoint: "footing-base-center";
    compressionConvention: "positive-downward";
  };
  soil: {
    designBearingResistance: number;
    designSlidingResistance: number | null;
    bearingResistanceSource: unknown;
    slidingResistanceSource: unknown;
  };
  materials: {
    concreteMaterial: unknown;
    reinforcementMaterial: unknown;
  };
  reinforcement: {
    bottom: { x: FootingReinforcementLayer; y: FootingReinforcementLayer };
    punching: Record<string, unknown>;
  };
  punching: Record<string, unknown>;
  localBearing: { distributionArea: number | null; resistanceReductionFactor: number };
  anchorage: {
    columnBars: NormalizedFootingAnchorage | null;
    footingBars: {
      x: NormalizedFootingAnchorage | null;
      y: NormalizedFootingAnchorage | null;
    };
  };
  mesh: Record<string, unknown>;
  solver: Record<string, unknown>;
  units: UnitSystem;
  metadata: Record<string, unknown>;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }
  return value;
}

function normalizeLayer(
  input: FootingReinforcementLayerInput | undefined,
  resolver: ReturnType<typeof createUnitResolver>,
  label: string,
): FootingReinforcementLayer {
  if (!input) {
    throw new Error(`${label} is required.`);
  }

  const diameter = positive(resolver.length(Number(input.diameter)), `${label}.diameter`);
  const spacing = positive(resolver.length(Number(input.spacing)), `${label}.spacing`);
  const clearCover = positive(resolver.length(Number(input.clearCover)), `${label}.clearCover`);
  const layerOffset = nonNegative(
    resolver.length(Number(input.layerOffset ?? 0)),
    `${label}.layerOffset`,
  );
  const barsPerMeter = 1000 / spacing;

  return {
    diameter,
    spacing,
    clearCover,
    layerOffset,
    axisFromBottom: clearCover + layerOffset + diameter / 2,
    barsPerMeter,
    areaPerMeter: (barsPerMeter * Math.PI * diameter ** 2) / 4,
  };
}

export class ReinforcedConcreteIsolatedFootingModel {
  id: string;
  geometry: { widthX: number; widthY: number; thickness: number };
  column: { widthX: number; widthY: number };
  actions: ReinforcedConcreteIsolatedFootingJson["actions"];
  soil: ReinforcedConcreteIsolatedFootingJson["soil"];
  materials: {
    concreteMaterial: ConcreteMaterial;
    reinforcementMaterial: SteelMaterial;
  };
  reinforcement: ReinforcedConcreteIsolatedFootingJson["reinforcement"];
  punching: Record<string, unknown>;
  localBearing: ReinforcedConcreteIsolatedFootingJson["localBearing"];
  anchorage: ReinforcedConcreteIsolatedFootingJson["anchorage"];
  mesh: Record<string, unknown>;
  solver: Record<string, unknown>;
  units: UnitSystem;
  metadata: Record<string, unknown>;

  constructor({
    id,
    geometry = {},
    column = {},
    actions = {},
    soil = {},
    materials = {},
    reinforcement = {},
    punching = {},
    localBearing = {},
    anchorage = {},
    mesh = {},
    solver = {},
    units = null,
    metadata = {},
  }: ReinforcedConcreteIsolatedFootingModelInput) {
    if (!id) {
      throw new Error("A reinforced-concrete isolated footing id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteIsolatedFootingModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const widthX = positive(resolver.length(Number(geometry.widthX)), "geometry.widthX");
    const widthY = positive(resolver.length(Number(geometry.widthY)), "geometry.widthY");
    const thickness = positive(resolver.length(Number(geometry.thickness)), "geometry.thickness");
    const columnWidthX = positive(resolver.length(Number(column.widthX)), "column.widthX");
    const columnWidthY = positive(resolver.length(Number(column.widthY)), "column.widthY");

    if (columnWidthX >= widthX || columnWidthY >= widthY) {
      throw new Error("The centered column footprint must lie inside the footing footprint.");
    }
    if (column.offsetX != null || column.offsetY != null || column.rotation != null) {
      throw new Error(
        "The local isolated-footing verifier supports only a centered, unrotated rectangular column.",
      );
    }
    if (!materials.concreteMaterial || !materials.reinforcementMaterial) {
      throw new Error("Concrete and reinforcement materials are required.");
    }

    const bottomX = normalizeLayer(reinforcement.bottom?.x, resolver, "reinforcement.bottom.x");
    const bottomY = normalizeLayer(reinforcement.bottom?.y, resolver, "reinforcement.bottom.y");
    if (bottomX.axisFromBottom >= thickness || bottomY.axisFromBottom >= thickness) {
      throw new Error("Bottom reinforcement axes must lie inside the footing thickness.");
    }

    const columnVerticalForce = positive(
      resolver.force(Number(actions.columnVerticalForce ?? actions.nEd)),
      "actions.columnVerticalForce",
    );
    const uniformDownwardPressure = nonNegative(
      resolver.stress(Number(actions.uniformDownwardPressure ?? 0)),
      "actions.uniformDownwardPressure",
    );
    const designBearingResistance = positive(
      resolver.stress(Number(soil.designBearingResistance)),
      "soil.designBearingResistance",
    );
    const horizontalX = resolver.force(Number(actions.horizontalX ?? 0));
    const horizontalY = resolver.force(Number(actions.horizontalY ?? 0));
    const momentX = resolver.moment(Number(actions.momentX ?? actions.mxEd ?? 0));
    const momentY = resolver.moment(Number(actions.momentY ?? actions.myEd ?? 0));
    const designSlidingResistance =
      soil.designSlidingResistance == null
        ? null
        : nonNegative(
            resolver.force(Number(soil.designSlidingResistance)),
            "soil.designSlidingResistance",
          );

    for (const [label, value] of Object.entries({
      horizontalX,
      horizontalY,
      momentX,
      momentY,
    })) {
      if (!Number.isFinite(value)) {
        throw new Error(`actions.${label} must be finite.`);
      }
    }

    const normalizeAnchor = (
      input: FootingAnchorageInput | null | undefined,
      label: string,
    ): NormalizedFootingAnchorage | null =>
      input == null
        ? null
        : {
            ...input,
            diameter: positive(resolver.length(Number(input.diameter)), `${label}.diameter`),
            availableLength: positive(
              resolver.length(Number(input.availableLength)),
              `${label}.availableLength`,
            ),
            designSteelStress:
              input.designSteelStress == null
                ? null
                : positive(
                    resolver.stress(Number(input.designSteelStress)),
                    `${label}.designSteelStress`,
                  ),
            fctd:
              input.fctd == null
                ? null
                : positive(resolver.stress(Number(input.fctd)), `${label}.fctd`),
          };

    this.id = id;
    this.geometry = { widthX, widthY, thickness };
    this.column = { widthX: columnWidthX, widthY: columnWidthY };
    this.actions = {
      columnVerticalForce,
      uniformDownwardPressure,
      horizontalX,
      horizontalY,
      momentX,
      momentY,
      referencePoint: "footing-base-center",
      compressionConvention: "positive-downward",
    };
    this.soil = {
      designBearingResistance,
      designSlidingResistance,
      bearingResistanceSource: soil.bearingResistanceSource ?? null,
      slidingResistanceSource: soil.slidingResistanceSource ?? null,
    };
    this.materials = {
      concreteMaterial: materials.concreteMaterial,
      reinforcementMaterial: materials.reinforcementMaterial,
    };
    this.reinforcement = {
      bottom: { x: bottomX, y: bottomY },
      punching:
        reinforcement.punching == null
          ? { present: false }
          : structuredClone(reinforcement.punching),
    };
    this.punching = structuredClone(punching);
    this.localBearing = {
      distributionArea:
        localBearing.distributionArea == null
          ? null
          : positive(
              resolver.area(Number(localBearing.distributionArea)),
              "localBearing.distributionArea",
            ),
      resistanceReductionFactor: localBearing.resistanceReductionFactor ?? 1,
    };
    this.anchorage = {
      columnBars: normalizeAnchor(anchorage.columnBars, "anchorage.columnBars"),
      footingBars: {
        x: normalizeAnchor(anchorage.footingBars?.x, "anchorage.footingBars.x"),
        y: normalizeAnchor(anchorage.footingBars?.y, "anchorage.footingBars.y"),
      },
    };
    this.mesh = { targetFiberCount: 50, ...mesh };
    this.solver = { tolerance: 1e-6, maxIterations: 100, ...solver };
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }

  toJSON(): ReinforcedConcreteIsolatedFootingJson {
    return {
      id: this.id,
      geometry: { ...this.geometry },
      column: { ...this.column },
      actions: { ...this.actions },
      soil: { ...this.soil },
      materials: {
        concreteMaterial: this.materials.concreteMaterial.toJSON(),
        reinforcementMaterial: this.materials.reinforcementMaterial.toJSON(),
      },
      reinforcement: structuredClone(this.reinforcement),
      punching: structuredClone(this.punching),
      localBearing: { ...this.localBearing },
      anchorage: structuredClone(this.anchorage),
      mesh: { ...this.mesh },
      solver: { ...this.solver },
      units: { ...this.units },
      metadata: { ...this.metadata },
    };
  }
}
