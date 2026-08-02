// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/norms/ntc2018/actions/createNTC2018Action.js.

import {
  AccidentalAction,
  ImposedAction,
  PermanentAction,
  SeismicAction,
  SnowAction,
  ThermalAction,
  TrafficAction,
  VariableAction,
  WindAction,
} from "../../../domain/actions/index.js";
import type {
  ActionLoadCaseReference,
  ActionPartialFactors,
} from "../../../domain/actions/Action.js";
import {
  NTC2018_ACTION_COMBINATION_FACTORS,
  NTC2018_ACTION_PARTIAL_FACTORS,
  NTC2018_CASE_BY_CASE_COMBINATION_CATEGORIES,
  NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION,
  NTC2018_LOAD_DURATION_CLASSES,
  NTC2018_TIMBER_KMOD,
} from "./ntc2018ActionParameters.js";
import type {
  NTC2018ActionCombinationFactorDefinition,
  NTC2018LoadDurationDefinition,
  NTC2018PartialFactorDefinition,
} from "./ntc2018ActionParameters.js";

export interface NTC2018ExplicitCombinationFactors {
  psi0: number;
  psi1: number;
  psi2: number;
  description?: string;
  [key: string]: number | string | undefined;
}

export interface NTC2018CombinationFactorsSource {
  reference?: unknown;
  [key: string]: unknown;
}

export interface GetNTC2018ActionPartialFactorsOptions {
  nature: string;
  family?: string;
  permanentClass?: string | null;
}

export interface NTC2018ActionDurationLike {
  loadDurationClass?: string | null;
}

export interface GetNTC2018TimberKmodOptions {
  materialType?: string;
  serviceClass?: number;
  loadDurationClass?: string;
}

export interface CreateNTC2018PermanentActionOptions {
  id?: string | undefined;
  name?: string | null | undefined;
  permanentClass?: string;
  loadCase?: ActionLoadCaseReference | null;
  metadata?: Record<string, unknown>;
}

export interface CreateNTC2018VariableActionOptions {
  id?: string | undefined;
  name?: string | null | undefined;
  category: string;
  family?: string;
  loadCase?: ActionLoadCaseReference | null;
  loadDurationClass?: string | null;
  combinationFactors?: NTC2018ExplicitCombinationFactors | null;
  combinationFactorsSource?: NTC2018CombinationFactorsSource | null;
  metadata?: Record<string, unknown>;
}

export interface CreateNTC2018SnowActionOptions
  extends Omit<CreateNTC2018VariableActionOptions, "category" | "family"> {
  highAltitude?: boolean;
}

export type CreateNTC2018WindActionOptions = Omit<
  CreateNTC2018VariableActionOptions,
  "category" | "family"
>;

export type CreateNTC2018ThermalActionOptions = Omit<
  CreateNTC2018VariableActionOptions,
  "category" | "family"
>;

export type CreateNTC2018AccidentalActionOptions = Omit<
  CreateNTC2018PermanentActionOptions,
  "permanentClass"
>;

export type CreateNTC2018SeismicActionOptions = CreateNTC2018AccidentalActionOptions;

interface DocumentedCombinationFactors {
  factors: NTC2018ExplicitCombinationFactors;
  description: string;
  source: NTC2018CombinationFactorsSource;
}

type FactoryCombinationFactors =
  | NTC2018ActionCombinationFactorDefinition
  | NTC2018ExplicitCombinationFactors;

function documentedCombinationFactors({
  category,
  combinationFactors,
  source,
}: {
  category: string;
  combinationFactors: NTC2018ExplicitCombinationFactors | null;
  source: NTC2018CombinationFactorsSource | null;
}): DocumentedCombinationFactors | null {
  const definition = NTC2018_CASE_BY_CASE_COMBINATION_CATEGORIES[category];
  if (!definition) {
    if (combinationFactors != null || source != null) {
      throw new Error(
        `Explicit combination factors are only accepted for NTC 2018 categories I and K, not ${category}.`,
      );
    }
    return null;
  }
  if (
    source == null ||
    typeof source !== "object" ||
    typeof source.reference !== "string" ||
    source.reference.trim() === ""
  ) {
    throw new Error(`NTC 2018 category ${category} requires combinationFactorsSource.reference.`);
  }

  const normalized: NTC2018ExplicitCombinationFactors = {
    psi0: 0,
    psi1: 0,
    psi2: 0,
  };
  for (const key of ["psi0", "psi1", "psi2"] as const) {
    const value = combinationFactors?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`combinationFactors.${key} must be between 0 and 1.`);
    }
    normalized[key] = value;
  }

  return {
    factors: normalized,
    description: definition.description,
    source: { ...source },
  };
}

function cloneFactors(
  source: Record<string, NTC2018PartialFactorDefinition>,
): ActionPartialFactors {
  const cloned: ActionPartialFactors = {};

  for (const [combinationSet, factors] of Object.entries(source)) {
    cloned[combinationSet] = { ...factors };
  }

  return cloned;
}

function durationOrder(durationClass: string): number {
  const definition = NTC2018_LOAD_DURATION_CLASSES[durationClass];
  if (!definition) {
    throw new TypeError("Cannot read properties of undefined (reading 'order')");
  }
  return definition.order;
}

function isDurationActionArray(value: unknown): value is readonly NTC2018ActionDurationLike[] {
  return Array.isArray(value);
}

export function getNTC2018ActionCombinationFactors(
  category: string,
): NTC2018ActionCombinationFactorDefinition {
  const entry = NTC2018_ACTION_COMBINATION_FACTORS[category];

  if (!entry) {
    throw new Error(`Unsupported NTC 2018 action category: ${category}.`);
  }

  return { ...entry };
}

export function getNTC2018ActionPartialFactors({
  nature,
  family,
  permanentClass = null,
}: GetNTC2018ActionPartialFactorsOptions): ActionPartialFactors {
  if (nature === "permanent") {
    const permanentFactors = NTC2018_ACTION_PARTIAL_FACTORS.permanent;
    const entry = permanentClass === null ? undefined : permanentFactors?.[permanentClass];

    if (!entry) {
      throw new Error(`Unsupported NTC 2018 permanent action class: ${permanentClass}.`);
    }

    return cloneFactors(entry);
  }

  const byNature = NTC2018_ACTION_PARTIAL_FACTORS[nature];
  const entry = family === undefined ? undefined : byNature?.[family];

  if (!entry) {
    throw new Error(`Unsupported NTC 2018 action family '${family}' for nature '${nature}'.`);
  }

  return cloneFactors(entry);
}

export function getNTC2018LoadDurationClass(actionKey: string): string {
  const durationClass = NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION[actionKey];

  if (!durationClass) {
    throw new Error(`Unsupported NTC 2018 action key for load duration: ${actionKey}.`);
  }

  return durationClass;
}

export function getNTC2018LoadDurationDefinition(
  durationClass: string,
): NTC2018LoadDurationDefinition & { key: string } {
  const definition = NTC2018_LOAD_DURATION_CLASSES[durationClass];

  if (!definition) {
    throw new Error(`Unsupported NTC 2018 load duration class: ${durationClass}.`);
  }

  return {
    key: durationClass,
    ...definition,
  };
}

export function resolveNTC2018GoverningLoadDuration(
  actions: readonly NTC2018ActionDurationLike[] | null = [],
): NTC2018LoadDurationDefinition & { key: string } {
  if (!isDurationActionArray(actions) || actions.length === 0) {
    return getNTC2018LoadDurationDefinition("permanent");
  }

  const governingKey = actions.reduce((current, action) => {
    const candidate = action.loadDurationClass ?? "permanent";
    return durationOrder(candidate) < durationOrder(current) ? candidate : current;
  }, "permanent");

  return getNTC2018LoadDurationDefinition(governingKey);
}

export function getNTC2018TimberKmod({
  materialType = "solid_timber",
  serviceClass = 1,
  loadDurationClass,
}: GetNTC2018TimberKmodOptions): number {
  const byMaterial = NTC2018_TIMBER_KMOD[materialType];

  if (!byMaterial) {
    throw new Error(`Unsupported timber material type for kmod: ${materialType}.`);
  }

  const byServiceClass = byMaterial[serviceClass];

  if (!byServiceClass) {
    throw new Error(`Unsupported timber service class for kmod: ${serviceClass}.`);
  }

  const value = loadDurationClass === undefined ? undefined : byServiceClass[loadDurationClass];

  if (value === undefined) {
    throw new Error(`Unsupported timber load duration class for kmod: ${loadDurationClass}.`);
  }

  return value;
}

export function createNTC2018PermanentAction({
  id,
  name = id,
  permanentClass = "G1",
  loadCase = null,
  metadata = {},
}: CreateNTC2018PermanentActionOptions): PermanentAction {
  return new PermanentAction({
    id,
    name,
    permanentClass,
    loadCase,
    combinationFactors: { psi0: 1, psi1: 1, psi2: 1 },
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "permanent",
      permanentClass,
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}

export function createNTC2018VariableAction({
  id,
  name = id,
  category,
  family = "imposed",
  loadCase = null,
  loadDurationClass = null,
  combinationFactors = null,
  combinationFactorsSource = null,
  metadata = {},
}: CreateNTC2018VariableActionOptions): VariableAction {
  const documentedFactors = documentedCombinationFactors({
    category,
    combinationFactors,
    source: combinationFactorsSource,
  });
  const factors: FactoryCombinationFactors =
    documentedFactors?.factors ?? getNTC2018ActionCombinationFactors(category);
  if (documentedFactors && loadDurationClass == null) {
    throw new Error(`NTC 2018 category ${category} requires an explicit loadDurationClass.`);
  }
  const durationClass = loadDurationClass ?? getNTC2018LoadDurationClass(category);
  const commonProps = {
    id,
    name,
    category,
    loadCase,
    loadDurationClass: durationClass,
    combinationFactors: factors,
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "variable",
      family,
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
      categoryDescription: documentedFactors?.description ?? factors.description,
      combinationFactorsSource: documentedFactors?.source ?? null,
    },
  };

  if (family === "traffic") {
    return new TrafficAction(commonProps);
  }

  if (family === "wind") {
    return new WindAction(commonProps);
  }

  if (family === "snow") {
    return new SnowAction(commonProps);
  }

  if (family === "thermal") {
    return new ThermalAction(commonProps);
  }

  if (family === "imposed") {
    return new ImposedAction(commonProps);
  }

  return new VariableAction({
    ...commonProps,
    family,
  });
}

export function createNTC2018SnowAction({
  id,
  name = id,
  highAltitude = false,
  ...rest
}: CreateNTC2018SnowActionOptions): VariableAction {
  return createNTC2018VariableAction({
    id,
    name,
    category: highAltitude ? "SNOW_HIGH" : "SNOW_LOW",
    family: "snow",
    ...rest,
  });
}

export function createNTC2018WindAction({
  id,
  name = id,
  ...rest
}: CreateNTC2018WindActionOptions): VariableAction {
  return createNTC2018VariableAction({
    id,
    name,
    category: "WIND",
    family: "wind",
    ...rest,
  });
}

export function createNTC2018ThermalAction({
  id,
  name = id,
  ...rest
}: CreateNTC2018ThermalActionOptions): VariableAction {
  return createNTC2018VariableAction({
    id,
    name,
    category: "THERMAL",
    family: "thermal",
    ...rest,
  });
}

export function createNTC2018AccidentalAction({
  id,
  name = id,
  loadCase = null,
  metadata = {},
}: CreateNTC2018AccidentalActionOptions): AccidentalAction {
  return new AccidentalAction({
    id,
    name,
    loadCase,
    combinationFactors: getNTC2018ActionCombinationFactors("ACCIDENTAL"),
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "accidental",
      family: "accidental",
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}

export function createNTC2018SeismicAction({
  id,
  name = id,
  loadCase = null,
  metadata = {},
}: CreateNTC2018SeismicActionOptions): SeismicAction {
  return new SeismicAction({
    id,
    name,
    loadCase,
    combinationFactors: getNTC2018ActionCombinationFactors("SEISMIC"),
    partialFactors: getNTC2018ActionPartialFactors({
      nature: "seismic",
      family: "seismic",
    }),
    metadata: {
      ...metadata,
      normativePreset: "NTC2018",
    },
  });
}
