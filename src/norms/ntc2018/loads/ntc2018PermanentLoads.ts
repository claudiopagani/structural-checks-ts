// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/loads/ntc2018PermanentLoads.js.

import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { AreaLoad, type AreaLoadJson } from "../../../domain/loads/AreaLoad.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { createNTC2018PermanentAction } from "../actions/createNTC2018Action.js";
import type { PermanentActionJson } from "../../../domain/actions/PermanentAction.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;
type PermanentClass = "G1" | "G2";
type PermanentLoadEffect = "favourable" | "unfavourable";
const PERMANENT_CLASS_VALUES: readonly PermanentClass[] = ["G1", "G2"];
const PERMANENT_CLASSES = new Set<string>(PERMANENT_CLASS_VALUES);
const EFFECTS = new Set<string>(["favourable", "unfavourable"]);

export const NTC2018_PERMANENT_LOAD_REFERENCES = Object.freeze({
  unitWeights: "D.M. 17/01/2018, NTC 2018, section 3.1.2, Table 3.1.I",
  equivalentPartitions: "D.M. 17/01/2018, NTC 2018, section 3.1.3",
  partialFactors: "D.M. 17/01/2018, NTC 2018, section 2.6.1, Table 2.6.I",
});

interface FixedUnitWeightDefinition {
  id: string;
  category: string;
  description: string;
  kind: "fixed";
  value: number;
  unit: string;
  reference: string;
}

interface RangedUnitWeightDefinition {
  id: string;
  category: string;
  description: string;
  kind: "range";
  min: number;
  max: number;
  unit: string;
  reference: string;
}

export type NTC2018UnitWeightDefinition = FixedUnitWeightDefinition | RangedUnitWeightDefinition;

function freezeCatalog<T extends object>(entries: readonly T[]): readonly Readonly<T>[] {
  const frozenEntries = entries.map((entry): Readonly<T> => Object.freeze({ ...entry }));
  return Object.freeze(frozenEntries);
}

interface UnitWeightBaseEntry {
  id: string;
  category: string;
  description: string;
  kind: "fixed" | "range";
  value?: number;
  min?: number;
  max?: number;
}

const UNIT_WEIGHT_BASE_ENTRIES = [
  {
    id: "plain-concrete",
    category: "concrete",
    description: "Calcestruzzo ordinario non armato",
    kind: "fixed",
    value: 24,
  },
  {
    id: "reinforced-or-prestressed-concrete",
    category: "concrete",
    description: "Calcestruzzo armato e precompresso",
    kind: "fixed",
    value: 25,
  },
  {
    id: "lightweight-concrete",
    category: "concrete",
    description: "Calcestruzzo leggero",
    kind: "range",
    min: 14,
    max: 20,
  },
  {
    id: "heavyweight-concrete",
    category: "concrete",
    description: "Calcestruzzo pesante",
    kind: "range",
    min: 28,
    max: 50,
  },
  {
    id: "lime-mortar",
    category: "mortars-and-bulk-materials",
    description: "Malta di calce",
    kind: "fixed",
    value: 18,
  },
  {
    id: "cement-mortar",
    category: "mortars-and-bulk-materials",
    description: "Malta di cemento",
    kind: "fixed",
    value: 21,
  },
  {
    id: "powdered-lime",
    category: "mortars-and-bulk-materials",
    description: "Calce in polvere",
    kind: "fixed",
    value: 10,
  },
  {
    id: "powdered-cement",
    category: "mortars-and-bulk-materials",
    description: "Cemento in polvere",
    kind: "fixed",
    value: 14,
  },
  {
    id: "sand",
    category: "mortars-and-bulk-materials",
    description: "Sabbia",
    kind: "fixed",
    value: 17,
  },
  {
    id: "steel",
    category: "metals",
    description: "Acciaio",
    kind: "fixed",
    value: 78.5,
  },
  {
    id: "cast-iron",
    category: "metals",
    description: "Ghisa",
    kind: "fixed",
    value: 72.5,
  },
  {
    id: "aluminium",
    category: "metals",
    description: "Alluminio",
    kind: "fixed",
    value: 27,
  },
  {
    id: "volcanic-tuff",
    category: "natural-stone",
    description: "Tufo vulcanico",
    kind: "fixed",
    value: 17,
  },
  {
    id: "compact-limestone",
    category: "natural-stone",
    description: "Calcare compatto",
    kind: "fixed",
    value: 26,
  },
  {
    id: "soft-limestone",
    category: "natural-stone",
    description: "Calcare tenero",
    kind: "fixed",
    value: 22,
  },
  {
    id: "gypsum",
    category: "natural-stone",
    description: "Gesso",
    kind: "fixed",
    value: 13,
  },
  {
    id: "granite",
    category: "natural-stone",
    description: "Granito",
    kind: "fixed",
    value: 27,
  },
  {
    id: "solid-brick",
    category: "masonry",
    description: "Mattoni pieni",
    kind: "fixed",
    value: 18,
  },
  {
    id: "softwood-or-poplar",
    category: "timber",
    description: "Legname di conifera e pioppo",
    kind: "range",
    min: 4,
    max: 6,
  },
  {
    id: "hardwood-excluding-poplar",
    category: "timber",
    description: "Legname di latifoglia, escluso il pioppo",
    kind: "range",
    min: 6,
    max: 8,
  },
  {
    id: "fresh-water",
    category: "liquids-and-other",
    description: "Acqua dolce",
    kind: "fixed",
    value: 9.81,
  },
  {
    id: "sea-water",
    category: "liquids-and-other",
    description: "Acqua di mare",
    kind: "fixed",
    value: 10.1,
  },
  {
    id: "paper",
    category: "liquids-and-other",
    description: "Carta",
    kind: "fixed",
    value: 10,
  },
  {
    id: "glass",
    category: "liquids-and-other",
    description: "Vetro",
    kind: "fixed",
    value: 25,
  },
] satisfies readonly UnitWeightBaseEntry[];

export const NTC2018_UNIT_WEIGHT_CATALOG: readonly NTC2018UnitWeightDefinition[] = freezeCatalog(
  UNIT_WEIGHT_BASE_ENTRIES.map((entry) => ({
    ...entry,
    unit: "kN/m^3",
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
  })),
);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return value;
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }

  return value;
}

function unitWeightDefinition(materialId: unknown): NTC2018UnitWeightDefinition {
  const definition = NTC2018_UNIT_WEIGHT_CATALOG.find(({ id }) => id === materialId);

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 unit-weight material: ${String(materialId)}.`);
  }

  return definition;
}

export interface ListNTC2018UnitWeightDefinitionsOptions {
  category?: string | null;
}

export function listNTC2018UnitWeightDefinitions({
  category = null,
}: ListNTC2018UnitWeightDefinitionsOptions = {}): NTC2018UnitWeightDefinition[] {
  const definitions =
    category == null
      ? NTC2018_UNIT_WEIGHT_CATALOG
      : NTC2018_UNIT_WEIGHT_CATALOG.filter((entry) => entry.category === category);

  return definitions.map(clone);
}

export function getNTC2018UnitWeightDefinition(materialId: unknown): NTC2018UnitWeightDefinition {
  return clone(unitWeightDefinition(materialId));
}

export interface ResolveNTC2018UnitWeightOptions {
  materialId?: string;
  value?: number | null;
}

export type ResolvedNTC2018UnitWeight = NTC2018UnitWeightDefinition &
  (
    | { selectedValue: number; selection: "tabulated-fixed" }
    | {
        selectedValue: number;
        selection: "explicit-within-tabulated-range";
      }
  );

export function resolveNTC2018UnitWeight({
  materialId,
  value = null,
}: ResolveNTC2018UnitWeightOptions = {}): ResolvedNTC2018UnitWeight {
  const definition = unitWeightDefinition(materialId);

  if (definition.kind === "fixed") {
    if (value != null) {
      throw new Error(
        `${materialId} has the fixed NTC 2018 unit weight ${definition.value} kN/m^3; omit value.`,
      );
    }

    return {
      ...clone(definition),
      selectedValue: definition.value,
      selection: "tabulated-fixed",
    };
  }

  const normalizedValue = finitePositive(value, "value");

  if (normalizedValue < definition.min || normalizedValue > definition.max) {
    throw new Error(
      `value for ${materialId} must be between ${definition.min} and ${definition.max} kN/m^3.`,
    );
  }

  return {
    ...clone(definition),
    selectedValue: normalizedValue,
    selection: "explicit-within-tabulated-range",
  };
}

export interface NTC2018SelfWeightCalculation {
  model: "layer" | "solid-volume";
  operands: Record<string, number>;
  formula: string;
  value: number;
  quantity: "force" | "area-load";
  units: UnitSystem;
  reference: string;
  metadata: Record<string, unknown>;
}

function normalizedCalculation({
  units,
  model,
  operands,
  formula,
  value,
  reference,
}: {
  units: UnitSystem;
  model: NTC2018SelfWeightCalculation["model"];
  operands: Record<string, number>;
  formula: string;
  value: number;
  reference: string;
}): NTC2018SelfWeightCalculation {
  return {
    model,
    operands,
    formula,
    value,
    quantity: model === "solid-volume" ? "force" : "area-load",
    units: { ...INTERNAL_UNITS },
    reference,
    metadata: {
      sourceUnitSystem: { ...units },
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export interface CalculateNTC2018AreaSelfWeightOptions {
  unitWeight?: number;
  thickness?: number;
  units?: UnitSystemInput | null;
}

export function calculateNTC2018AreaSelfWeight({
  unitWeight,
  thickness,
  units = null,
}: CalculateNTC2018AreaSelfWeightOptions = {}): NTC2018SelfWeightCalculation {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018AreaSelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(resolver.volumeLoad(unitWeight), "unitWeight");
  const normalizedThickness = finiteNonNegative(resolver.length(thickness), "thickness");

  return normalizedCalculation({
    units: sourceUnits,
    model: "layer",
    operands: {
      unitWeight: normalizedUnitWeight,
      thickness: normalizedThickness,
    },
    formula: "areaLoad = unitWeight * thickness",
    value: normalizedUnitWeight * normalizedThickness,
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
  });
}

export interface CalculateNTC2018LineSelfWeightOptions {
  unitWeight?: number;
  crossSectionArea?: number;
  units?: UnitSystemInput | null;
}

export interface NTC2018LineSelfWeightResult {
  model: "prismatic-line";
  operands: Record<string, number>;
  formula: "lineLoad = unitWeight * crossSectionArea";
  value: number;
  quantity: "line-load";
  units: UnitSystem;
  reference: string;
  metadata: Record<string, unknown>;
}

export function calculateNTC2018LineSelfWeight({
  unitWeight,
  crossSectionArea,
  units = null,
}: CalculateNTC2018LineSelfWeightOptions = {}): NTC2018LineSelfWeightResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018LineSelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(resolver.volumeLoad(unitWeight), "unitWeight");
  const normalizedArea = finiteNonNegative(resolver.area(crossSectionArea), "crossSectionArea");

  return {
    model: "prismatic-line",
    operands: {
      unitWeight: normalizedUnitWeight,
      crossSectionArea: normalizedArea,
    },
    formula: "lineLoad = unitWeight * crossSectionArea",
    value: normalizedUnitWeight * normalizedArea,
    quantity: "line-load",
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
    metadata: {
      sourceUnitSystem: { ...sourceUnits },
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export interface CalculateNTC2018SelfWeightOptions {
  unitWeight?: number;
  volume?: number;
  units?: UnitSystemInput | null;
}

export function calculateNTC2018SelfWeight({
  unitWeight,
  volume,
  units = null,
}: CalculateNTC2018SelfWeightOptions = {}): NTC2018SelfWeightCalculation {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018SelfWeight");
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedUnitWeight = finiteNonNegative(resolver.volumeLoad(unitWeight), "unitWeight");
  const normalizedVolume = finiteNonNegative(resolver.volume(volume), "volume");

  return normalizedCalculation({
    units: sourceUnits,
    model: "solid-volume",
    operands: {
      unitWeight: normalizedUnitWeight,
      volume: normalizedVolume,
    },
    formula: "selfWeight = unitWeight * volume",
    value: normalizedUnitWeight * normalizedVolume,
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.unitWeights,
  });
}

export interface CalculateNTC2018EquivalentPartitionAreaLoadOptions {
  partitionLineLoad?: number;
  units?: UnitSystemInput | null;
}

export interface NTC2018EquivalentPartitionAreaLoadResult {
  partitionLineLoad: number;
  equivalentUniformLoadApplicable: boolean;
  areaLoad: number | null;
  requiresActualPositioning: boolean;
  units: UnitSystem;
  reference: string;
  metadata: Record<string, unknown>;
}

export function calculateNTC2018EquivalentPartitionAreaLoad({
  partitionLineLoad,
  units = null,
}: CalculateNTC2018EquivalentPartitionAreaLoadOptions = {}): NTC2018EquivalentPartitionAreaLoadResult {
  const sourceUnits = assertExplicitUnitSystem(
    units,
    "calculateNTC2018EquivalentPartitionAreaLoad",
  );
  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedLineLoad = finitePositive(
    resolver.lineLoad(partitionLineLoad),
    "partitionLineLoad",
  );
  const steps = [
    { maximumLineLoad: 1, areaLoad: 0.4 },
    { maximumLineLoad: 2, areaLoad: 0.8 },
    { maximumLineLoad: 3, areaLoad: 1.2 },
    { maximumLineLoad: 4, areaLoad: 1.6 },
    { maximumLineLoad: 5, areaLoad: 2.0 },
  ];
  const selected = steps.find(({ maximumLineLoad }) => normalizedLineLoad <= maximumLineLoad);

  return {
    partitionLineLoad: normalizedLineLoad,
    equivalentUniformLoadApplicable: selected != null,
    areaLoad: selected?.areaLoad ?? null,
    requiresActualPositioning: selected == null,
    units: { ...INTERNAL_UNITS },
    reference: NTC2018_PERMANENT_LOAD_REFERENCES.equivalentPartitions,
    metadata: {
      sourceUnitSystem: { ...sourceUnits },
      unitSystem: { ...INTERNAL_UNITS },
    },
  };
}

export type NTC2018PermanentAreaLoadModel =
  | "layer"
  | "surface"
  | "repeated-line"
  | "repeated-section"
  | "distributed-wall";

export interface NTC2018PermanentAreaLoadItemInput {
  id?: string;
  description?: string;
  model?: NTC2018PermanentAreaLoadModel;
  permanentClass?: PermanentClass;
  effect?: PermanentLoadEffect;
  unitWeight?: number;
  thickness?: number;
  areaLoad?: number;
  lineLoad?: number;
  spacing?: number;
  crossSectionArea?: number;
  height?: number;
}

export interface NTC2018NormalizedPermanentAreaLoadItem {
  id: string;
  description: string;
  model: string;
  permanentClass: PermanentClass;
  effect: PermanentLoadEffect;
  operands: Record<string, number>;
  formula: string;
  value: number;
  quantity: "area-load";
  units: UnitSystem;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPermanentClass(value: unknown): value is PermanentClass {
  return typeof value === "string" && PERMANENT_CLASSES.has(value);
}

function isPermanentLoadEffect(value: unknown): value is PermanentLoadEffect {
  return typeof value === "string" && EFFECTS.has(value);
}

function unitInput(value: unknown): number | null | undefined {
  if (typeof value === "number" || value == null) {
    return value;
  }

  return Number.NaN;
}

function normalizePermanentAreaItem(
  item: unknown,
  resolver: UnitResolver,
): NTC2018NormalizedPermanentAreaLoadItem {
  if (!isRecord(item)) {
    throw new Error("Each permanent-load item must be an object.");
  }

  const id = item.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("Each permanent-load item requires a stable non-empty string id.");
  }

  if (!isPermanentClass(item.permanentClass)) {
    throw new Error(`${id}.permanentClass must be G1 or G2.`);
  }

  const effect = item.effect ?? "unfavourable";
  if (!isPermanentLoadEffect(effect)) {
    throw new Error(`${id}.effect must be favourable or unfavourable.`);
  }

  let operands: Record<string, number>;
  let value: number;
  let formula: string;

  switch (item.model) {
    case "layer": {
      const unitWeight = finiteNonNegative(
        resolver.volumeLoad(unitInput(item.unitWeight)),
        `${id}.unitWeight`,
      );
      const thickness = finiteNonNegative(
        resolver.length(unitInput(item.thickness)),
        `${id}.thickness`,
      );
      operands = {
        unitWeight,
        thickness,
      };
      formula = "areaLoad = unitWeight * thickness";
      value = unitWeight * thickness;
      break;
    }
    case "surface": {
      const areaLoad = finiteNonNegative(
        resolver.areaLoad(unitInput(item.areaLoad)),
        `${id}.areaLoad`,
      );
      operands = {
        areaLoad,
      };
      formula = "areaLoad = assignedAreaLoad";
      value = areaLoad;
      break;
    }
    case "repeated-line": {
      const lineLoad = finiteNonNegative(
        resolver.lineLoad(unitInput(item.lineLoad)),
        `${id}.lineLoad`,
      );
      const spacing = finitePositive(resolver.length(unitInput(item.spacing)), `${id}.spacing`);
      operands = {
        lineLoad,
        spacing,
      };
      formula = "areaLoad = lineLoad / spacing";
      value = lineLoad / spacing;
      break;
    }
    case "repeated-section": {
      const unitWeight = finiteNonNegative(
        resolver.volumeLoad(unitInput(item.unitWeight)),
        `${id}.unitWeight`,
      );
      const crossSectionArea = finiteNonNegative(
        resolver.area(unitInput(item.crossSectionArea)),
        `${id}.crossSectionArea`,
      );
      const spacing = finitePositive(resolver.length(unitInput(item.spacing)), `${id}.spacing`);
      operands = {
        unitWeight,
        crossSectionArea,
        spacing,
      };
      formula = "areaLoad = unitWeight * crossSectionArea / spacing";
      value = (unitWeight * crossSectionArea) / spacing;
      break;
    }
    case "distributed-wall": {
      const unitWeight = finiteNonNegative(
        resolver.volumeLoad(unitInput(item.unitWeight)),
        `${id}.unitWeight`,
      );
      const height = finiteNonNegative(resolver.length(unitInput(item.height)), `${id}.height`);
      const thickness = finiteNonNegative(
        resolver.length(unitInput(item.thickness)),
        `${id}.thickness`,
      );
      const spacing = finitePositive(resolver.length(unitInput(item.spacing)), `${id}.spacing`);
      operands = {
        unitWeight,
        height,
        thickness,
        spacing,
      };
      formula = "areaLoad = unitWeight * height * thickness / spacing";
      value = (unitWeight * height * thickness) / spacing;
      break;
    }
    default:
      throw new Error(`Unsupported permanent-load model for ${id}: ${String(item.model)}.`);
  }

  return {
    id,
    description: typeof item.description === "string" ? item.description : id,
    model: String(item.model),
    permanentClass: item.permanentClass,
    effect,
    operands,
    formula,
    value,
    quantity: "area-load",
    units: { ...INTERNAL_UNITS },
  };
}

export interface NTC2018PermanentAreaLoadTotals {
  G1: number;
  G2: number;
  total: number;
  byClassAndEffect: Record<PermanentClass, Record<PermanentLoadEffect, number>>;
}

function createTotals(
  items: readonly NTC2018NormalizedPermanentAreaLoadItem[],
): NTC2018PermanentAreaLoadTotals {
  const byClassAndEffect: Record<PermanentClass, Record<PermanentLoadEffect, number>> = {
    G1: { favourable: 0, unfavourable: 0 },
    G2: { favourable: 0, unfavourable: 0 },
  };

  for (const item of items) {
    byClassAndEffect[item.permanentClass][item.effect] += item.value;
  }

  const G1 = byClassAndEffect.G1.favourable + byClassAndEffect.G1.unfavourable;
  const G2 = byClassAndEffect.G2.favourable + byClassAndEffect.G2.unfavourable;

  return {
    G1,
    G2,
    total: G1 + G2,
    byClassAndEffect,
  };
}

export interface CalculateNTC2018PermanentAreaLoadsOptions {
  units?: UnitSystemInput | null;
  items?: readonly NTC2018PermanentAreaLoadItemInput[];
}

export interface NTC2018PermanentAreaLoadOutputs {
  [key: string]: unknown;
  schemaVersion: "ntc2018-permanent-area-loads/v1";
  units: UnitSystem;
  items: NTC2018NormalizedPermanentAreaLoadItem[];
  actions: PermanentActionJson[];
  loads: AreaLoadJson[];
  totals: NTC2018PermanentAreaLoadTotals;
}

export type NTC2018PermanentAreaLoadResult = CalculationResult<NTC2018PermanentAreaLoadOutputs>;

export function calculateNTC2018PermanentAreaLoads({
  units = null,
  items = [],
}: CalculateNTC2018PermanentAreaLoadsOptions = {}): NTC2018PermanentAreaLoadResult {
  const sourceUnits = assertExplicitUnitSystem(units, "calculateNTC2018PermanentAreaLoads");
  if (!Array.isArray(items)) {
    throw new Error("items must be an array.");
  }

  const resolver = createUnitResolver(sourceUnits, INTERNAL_UNITS);
  const normalizedItems = items.map((item) => normalizePermanentAreaItem(item, resolver));
  const ids = normalizedItems.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Permanent-load item ids must be unique.");
  }

  const classActions: Partial<
    Record<PermanentClass, ReturnType<typeof createNTC2018PermanentAction>>
  > = {};
  for (const permanentClass of PERMANENT_CLASS_VALUES) {
    if (normalizedItems.some((item) => item.permanentClass === permanentClass)) {
      classActions[permanentClass] = createNTC2018PermanentAction({
        id: `NTC2018-${permanentClass}`,
        name: `NTC 2018 ${permanentClass}`,
        permanentClass,
        metadata: {
          reference: NTC2018_PERMANENT_LOAD_REFERENCES.partialFactors,
        },
      });
    }
  }

  const actions = Object.values(classActions).filter((action) => action !== undefined);
  const loads = normalizedItems.map((item) => {
    const action = classActions[item.permanentClass];
    if (action === undefined) {
      throw new Error(`Missing action for permanent class ${item.permanentClass}.`);
    }

    return new AreaLoad({
      id: item.id,
      name: item.description,
      type: "permanent-area",
      intensity: item.value,
      action,
      units: INTERNAL_UNITS,
      metadata: {
        permanentClass: item.permanentClass,
        effect: item.effect,
        model: item.model,
        operands: item.operands,
        formula: item.formula,
        sourceUnitSystem: sourceUnits,
      },
    });
  });

  return new CalculationResult<NTC2018PermanentAreaLoadOutputs>({
    applicationId: "ntc2018-permanent-area-loads",
    status: "ok",
    summary: `Calculated ${normalizedItems.length} NTC 2018 permanent area-load item(s).`,
    outputs: {
      schemaVersion: "ntc2018-permanent-area-loads/v1",
      units: { ...INTERNAL_UNITS },
      items: normalizedItems,
      actions: actions.map((action) => action.toJSON()),
      loads: loads.map((load) => load.toJSON()),
      totals: createTotals(normalizedItems),
    },
    assumptions: [
      "Input values are non-negative characteristic magnitudes.",
      "Load direction and geometric application remain the consumer's responsibility.",
      "The permanent class G1 or G2 and the favourable or unfavourable effect are explicit caller decisions.",
    ],
    metadata: {
      method: "ntc2018-permanent-area-loads",
      normativePreset: "NTC2018",
      references: { ...NTC2018_PERMANENT_LOAD_REFERENCES },
      unitSystem: { ...INTERNAL_UNITS },
      sourceUnitSystem: sourceUnits,
    },
  });
}
