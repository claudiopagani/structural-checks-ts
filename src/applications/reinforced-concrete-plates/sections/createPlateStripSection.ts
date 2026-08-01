import { RectangularSection } from "../../../domain/geometry/RectangularSection.js";
import { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import {
  ReinforcementBar,
  type ReinforcementGrade,
} from "../../../domain/reinforcement/ReinforcementBar.js";
import type { UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import type { ReinforcedConcretePlateModel } from "../ReinforcedConcretePlateModel.js";
import type { RcPlateDirection, RcPlateLayer } from "../types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;

export interface PlateStripReinforcementGroup {
  id: string;
  name: string;
  face: "bottom" | "top";
  direction: RcPlateDirection;
  barIds: string[];
  diameter: number;
  countPerMeter: number;
  spacing: number;
  clearCover: number;
  axis: number;
  longitudinalReinforcementArea: number;
  effectiveDepth: number;
}

export interface PlateStripSection {
  section: ReinforcedConcreteSection;
  groups: PlateStripReinforcementGroup[];
  reinforcementBars: ReinforcementBar[];
  direction: RcPlateDirection;
}

function equivalentBarForLayer({
  layer,
  width,
  material,
  idPrefix,
}: {
  layer: RcPlateLayer;
  width: number;
  material: ReinforcedConcretePlateModel["materials"]["reinforcementMaterial"];
  idPrefix: string;
}): ReinforcementBar {
  const grade: ReinforcementGrade =
    material.grade === "B450A" || material.grade === "B450C" ? material.grade : "B450C";
  return new ReinforcementBar({
    id: idPrefix,
    name: `${idPrefix} equivalent reinforcement layer`,
    diameter: layer.diameter,
    area: layer.area,
    grade,
    material,
    y: layer.axis,
    z: width / 2,
    units: INTERNAL_UNITS,
    metadata: {
      face: layer.face,
      direction: layer.direction,
      equivalentDistributedArea: true,
      barsPerMeter: layer.barsPerMeter,
      equivalentSpacing: layer.spacing,
      layerArea: layer.area,
    },
  });
}

export function createPlateStripSection({
  model,
  direction,
}: {
  model?: ReinforcedConcretePlateModel;
  direction?: RcPlateDirection;
} = {}): PlateStripSection {
  if (!model || !direction || !["x", "y"].includes(direction)) {
    throw new Error("createPlateStripSection requires a plate model and direction x or y.");
  }

  const width = model.geometry.unitWidth;
  const concreteSection = new RectangularSection({
    id: `${model.id}-${direction}-strip-concrete`,
    name: `${direction.toUpperCase()} plate strip concrete`,
    width,
    height: model.geometry.thickness,
    units: INTERNAL_UNITS,
  });
  const groups: PlateStripReinforcementGroup[] = [];
  const reinforcementBars: ReinforcementBar[] = [];

  for (const face of ["bottom", "top"] as const) {
    const layer = model.reinforcement[face][direction];
    const id = `${face}-${direction}`;
    const bar = equivalentBarForLayer({
      layer,
      width,
      material: model.materials.reinforcementMaterial,
      idPrefix: id,
    });
    reinforcementBars.push(bar);
    groups.push({
      id,
      name: `${face} ${direction.toUpperCase()} plate reinforcement`,
      face,
      direction,
      barIds: [id],
      diameter: layer.diameter,
      countPerMeter: layer.barsPerMeter,
      spacing: layer.spacing,
      clearCover: layer.clearCover,
      axis: layer.axis,
      longitudinalReinforcementArea: layer.area,
      effectiveDepth: face === "bottom" ? model.geometry.thickness - layer.axis : layer.axis,
    });
  }

  const section = new ReinforcedConcreteSection({
    id: `${model.id}-${direction}-strip`,
    name: `${direction.toUpperCase()} reinforced-concrete plate strip`,
    concreteSection,
    reinforcementBars,
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    referenceModularRatio:
      typeof model.analysis.serviceability.modularRatio === "number"
        ? model.analysis.serviceability.modularRatio
        : 15,
    units: INTERNAL_UNITS,
    metadata: {
      direction,
      plateModelId: model.id,
      unitWidth: width,
      longitudinalReinforcementGroups: groups,
      numericalRepresentation:
        "Each distributed reinforcement layer is passed to the uniaxial solver as its exact total area at the real bar-axis depth; physical diameter and equivalent spacing remain explicit metadata.",
    },
  });

  return {
    section,
    groups,
    reinforcementBars,
    direction,
  };
}
