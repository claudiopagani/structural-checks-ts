// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/norms/ntc2018/beams/createNTC2018BeamCombinations.js.

import { getNTC2018ActionCombinationFactors } from "../actions/createNTC2018Action.js";
import { NTC2018_ULS_PARTIAL_FACTORS } from "../loads/ntc2018LoadParameters.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";
const DEFAULT_COMBINATION_TYPES = Object.freeze([
  "ULS",
  "SLE_RARE",
  "SLE_FREQUENT",
  "SLE_QUASI_PERMANENT",
] as const);

export interface NTC2018BeamCombinationInput {
  [key: string]: unknown;
  id?: string | number | null;
  loadCaseId?: string | number | null;
  loadCase?: unknown;
  load?: unknown;
  action?: unknown;
  nature?: string | null;
  actionType?: string | null;
  category?: string | null;
  variableCategory?: string | null;
  family?: string | null;
  permanentClass?: string | null;
  loadDurationClass?: string | null;
  durationClass?: string | null;
  favourable?: boolean | null;
  leadingEligible?: boolean | null;
  metadata?: Record<string, unknown> | null;
  value?: number;
}

export interface CreateNTC2018BeamCombinationsOptions {
  loads?: readonly NTC2018BeamCombinationInput[];
  permanentActions?: readonly NTC2018BeamCombinationInput[];
  variableActions?: readonly NTC2018BeamCombinationInput[];
  types?: readonly (string | null | undefined)[];
  idPrefix?: string | number;
  combinationSet?: string;
}

export interface NTC2018BeamCombinationMetadata {
  normativePreset: string;
  ntcReference: string;
  leadingLoadCaseId: unknown;
  leadingActionId: unknown;
  leadingVariableCategory: unknown;
  accompanyingLoadCaseIds: unknown[];
  loadDurations: Record<string, unknown>;
  generatedBy: string;
  requestedType: string;
  [key: string]: unknown;
}

export interface NTC2018BeamCombination {
  id: string;
  name: string;
  limitState: string;
  combinationType: string;
  factors: Record<string, number>;
  metadata: NTC2018BeamCombinationMetadata;
}

interface NTC2018BeamCombinationFactors {
  psi0: number;
  psi1: number;
  psi2: number;
}

interface NormalizedPermanentAction {
  id: unknown;
  loadCaseId: unknown;
  action: unknown;
  actionId: unknown;
  actionType: unknown;
  permanentClass: unknown;
  nature: "permanent";
  favourable: boolean;
  loadDurationClass: unknown;
  metadata: Record<string, unknown>;
}

interface NormalizedVariableAction {
  id: unknown;
  loadCaseId: unknown;
  action: unknown;
  actionId: unknown;
  actionType: "Qk";
  category: unknown;
  family: unknown;
  nature: "variable";
  leadingEligible: unknown;
  loadDurationClass: unknown;
  combinationFactors: NTC2018BeamCombinationFactors;
  metadata: Record<string, unknown>;
}

function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Reflect.get(Object(value), key);
}

function callable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function callMethod(value: unknown, method: string, args: readonly unknown[]): unknown {
  const candidate = readProperty(value, method);
  if (!callable(candidate)) {
    return undefined;
  }

  return Reflect.apply(candidate, value, [...args]);
}

function spreadProperties(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === "string") {
    return Object.fromEntries(
      value.split("").map((character, index) => [String(index), character]),
    );
  }

  if (typeof value === "object" || typeof value === "function") {
    return Object.fromEntries(Object.entries(value));
  }

  return {};
}

function sourceString(value: unknown, nullishFallback = ""): string {
  if (value === null || value === undefined) {
    return nullishFallback;
  }

  if (typeof value === "object") {
    return Object.prototype.toString.call(value);
  }

  if (typeof value === "function") {
    return value.toString();
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  return "";
}

function compactId(value: unknown): string {
  return sourceString(value)
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/[^A-Za-z0-9_.-]/g, "");
}

function normalizeType(type: unknown): string {
  const normalized = sourceString(type).trim().toUpperCase();
  const aliases: Record<string, string> = {
    SLU: "ULS",
    ULS_STR_GEO: "ULS",
    RARE: "SLE_RARE",
    SLE: "SLE_RARE",
    SLS: "SLE_RARE",
    SLS_RARE: "SLE_RARE",
    FREQUENT: "SLE_FREQUENT",
    SLS_FREQUENT: "SLE_FREQUENT",
    QUASI_PERMANENT: "SLE_QUASI_PERMANENT",
    SLE_QP: "SLE_QUASI_PERMANENT",
    SLS_QP: "SLE_QUASI_PERMANENT",
    SLS_QUASI_PERMANENT: "SLE_QUASI_PERMANENT",
  };

  return aliases[normalized] ?? normalized;
}

function resolveAction(input: unknown): unknown {
  return (
    readProperty(input, "action") ??
    readProperty(readProperty(input, "loadCase"), "action") ??
    readProperty(readProperty(input, "load"), "action") ??
    null
  );
}

function resolveLoadCase(input: unknown, action = resolveAction(input)): unknown {
  return (
    readProperty(input, "loadCase") ??
    readProperty(readProperty(input, "load"), "loadCase") ??
    readProperty(action, "loadCase") ??
    null
  );
}

function resolveLoadCaseId(input: unknown, action = resolveAction(input)): unknown {
  const loadCase = resolveLoadCase(input, action);

  return (
    readProperty(input, "loadCaseId") ??
    readProperty(readProperty(input, "load"), "loadCaseId") ??
    readProperty(loadCase, "id") ??
    readProperty(readProperty(action, "loadCase"), "id") ??
    readProperty(input, "id") ??
    readProperty(action, "id") ??
    null
  );
}

function resolveActionType(input: unknown, action = resolveAction(input)): unknown {
  const actionType = readProperty(input, "actionType");
  if (actionType) {
    return actionType;
  }

  const loadActionType = readProperty(readProperty(input, "load"), "actionType");
  if (loadActionType) {
    return loadActionType;
  }

  const permanentClass = readProperty(action, "permanentClass");
  if (permanentClass) {
    return permanentClass;
  }

  if (readProperty(action, "nature") === "variable" || readProperty(action, "category")) {
    return "Qk";
  }

  return readProperty(input, "category") ?? null;
}

function resolveNature(input: unknown, action = resolveAction(input)): unknown {
  const nature = readProperty(input, "nature");
  if (nature) {
    return nature;
  }

  const loadNature = readProperty(readProperty(input, "load"), "nature");
  if (loadNature) {
    return loadNature;
  }

  const actionNature = readProperty(action, "nature");
  if (actionNature) {
    return actionNature;
  }

  const actionType = sourceString(resolveActionType(input, action)).toUpperCase();

  if (actionType === "G1" || actionType === "G2") {
    return "permanent";
  }

  if (actionType === "QK" || actionType === "Q") {
    return "variable";
  }

  return readProperty(input, "variableCategory") || readProperty(input, "category")
    ? "variable"
    : "generic";
}

function resolveCategory(input: unknown, action = resolveAction(input)): unknown {
  return (
    readProperty(input, "category") ??
    readProperty(input, "variableCategory") ??
    readProperty(readProperty(input, "load"), "variableCategory") ??
    readProperty(readProperty(input, "load"), "category") ??
    readProperty(action, "category") ??
    null
  );
}

function resolveLoadDurationClass(input: unknown, action = resolveAction(input)): unknown {
  return (
    readProperty(input, "loadDurationClass") ??
    readProperty(input, "durationClass") ??
    readProperty(readProperty(input, "load"), "loadDurationClass") ??
    readProperty(readProperty(input, "load"), "durationClass") ??
    readProperty(action, "loadDurationClass") ??
    (resolveNature(input, action) === "permanent" ? "permanent" : null)
  );
}

function resolvePermanentClass(input: unknown, action = resolveAction(input)): unknown {
  return (
    readProperty(input, "permanentClass") ??
    readProperty(readProperty(input, "load"), "permanentClass") ??
    readProperty(action, "permanentClass") ??
    resolveActionType(input, action) ??
    "G1"
  );
}

function numericValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  return Number(value);
}

function resolvePartialFactor(
  action: unknown,
  {
    permanentClass = null,
    family = "imposed",
    effect = "unfavourable",
    combinationSet = "A1",
  }: {
    permanentClass?: unknown;
    family?: unknown;
    effect?: string;
    combinationSet?: string;
  } = {},
): number {
  const actionFactor = callMethod(action, "getPartialFactor", [{ combinationSet, effect }]);
  if (typeof readProperty(action, "getPartialFactor") === "function") {
    return numericValue(actionFactor);
  }

  if (permanentClass) {
    const key = `${sourceString(permanentClass).toUpperCase()}_${effect.toUpperCase()}`;
    const fallback = readProperty(NTC2018_ULS_PARTIAL_FACTORS, key);

    if (typeof fallback === "number" && Number.isFinite(fallback)) {
      return fallback;
    }

    return effect === "favourable" ? 1 : 1.3;
  }

  void family;
  return effect === "favourable" ? 0 : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;
}

function resolveCombinationFactors(
  action: unknown,
  category: unknown,
): NTC2018BeamCombinationFactors {
  if (typeof readProperty(action, "getCombinationFactor") === "function") {
    return {
      psi0: numericValue(callMethod(action, "getCombinationFactor", ["psi0"])),
      psi1: numericValue(callMethod(action, "getCombinationFactor", ["psi1"])),
      psi2: numericValue(callMethod(action, "getCombinationFactor", ["psi2"])),
    };
  }

  const factors = getNTC2018ActionCombinationFactors(sourceString(category));
  return {
    psi0: factors.psi0,
    psi1: factors.psi1,
    psi2: factors.psi2,
  };
}

function normalizePermanentEntry(input: unknown): NormalizedPermanentAction {
  const action = resolveAction(input);
  const loadCaseId = resolveLoadCaseId(input, action);
  const permanentClass = resolvePermanentClass(input, action);

  if (!loadCaseId) {
    throw new Error("NTC 2018 beam permanent actions require a loadCaseId.");
  }

  return {
    id: readProperty(input, "id") ?? readProperty(action, "id") ?? loadCaseId,
    loadCaseId,
    action,
    actionId: readProperty(action, "id") ?? null,
    actionType: permanentClass,
    permanentClass,
    nature: "permanent",
    favourable: Boolean(
      readProperty(input, "favourable") ?? readProperty(readProperty(input, "load"), "favourable"),
    ),
    loadDurationClass: resolveLoadDurationClass(input, action) ?? "permanent",
    metadata: {
      ...spreadProperties(readProperty(input, "metadata")),
      ...spreadProperties(readProperty(readProperty(input, "load"), "metadata")),
    },
  };
}

function normalizeVariableEntry(input: unknown): NormalizedVariableAction {
  const action = resolveAction(input);
  const loadCaseId = resolveLoadCaseId(input, action);
  const category = resolveCategory(input, action);

  if (!loadCaseId) {
    throw new Error("NTC 2018 beam variable actions require a loadCaseId.");
  }

  if (!category) {
    throw new Error(
      `NTC 2018 beam variable action ${sourceString(loadCaseId)} requires a category.`,
    );
  }

  return {
    id: readProperty(input, "id") ?? readProperty(action, "id") ?? loadCaseId,
    loadCaseId,
    action,
    actionId: readProperty(action, "id") ?? null,
    actionType: "Qk",
    category,
    family:
      readProperty(input, "family") ??
      readProperty(readProperty(input, "load"), "family") ??
      readProperty(action, "family") ??
      "imposed",
    nature: "variable",
    leadingEligible:
      readProperty(input, "leadingEligible") ??
      readProperty(readProperty(input, "load"), "leadingEligible") ??
      readProperty(action, "leadingEligible") ??
      true,
    loadDurationClass: resolveLoadDurationClass(input, action),
    combinationFactors: resolveCombinationFactors(action, category),
    metadata: {
      ...spreadProperties(readProperty(input, "metadata")),
      ...spreadProperties(readProperty(readProperty(input, "load"), "metadata")),
    },
  };
}

function normalizeLoads(loads: readonly unknown[]): {
  permanentActions: NormalizedPermanentAction[];
  variableActions: NormalizedVariableAction[];
} {
  const permanentActions: NormalizedPermanentAction[] = [];
  const variableActions: NormalizedVariableAction[] = [];

  for (const load of loads) {
    const nature = resolveNature(load);

    if (nature === "permanent") {
      permanentActions.push(normalizePermanentEntry({ load, ...spreadProperties(load) }));
      continue;
    }

    if (nature === "variable") {
      variableActions.push(normalizeVariableEntry({ load, ...spreadProperties(load) }));
    }
  }

  return { permanentActions, variableActions };
}

function normalizeInputActions({
  loads = [],
  permanentActions = [],
  variableActions = [],
}: {
  loads?: readonly unknown[];
  permanentActions?: readonly unknown[];
  variableActions?: readonly unknown[];
} = {}): {
  permanentActions: NormalizedPermanentAction[];
  variableActions: NormalizedVariableAction[];
} {
  const fromLoads = normalizeLoads(loads);

  return {
    permanentActions: [
      ...fromLoads.permanentActions,
      ...permanentActions.map((action) => normalizePermanentEntry(action)),
    ],
    variableActions: [
      ...fromLoads.variableActions,
      ...variableActions.map((action) => normalizeVariableEntry(action)),
    ],
  };
}

function factorKey(value: unknown): string {
  return sourceString(value);
}

function factorsToMetadata(factors: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(factors).map(([loadCaseId, factor]) => [loadCaseId, Number(factor.toFixed(12))]),
  );
}

function baseMetadata({
  type,
  leadingVariableAction = null,
  permanentActions,
  variableActions,
}: {
  type: string;
  leadingVariableAction?: NormalizedVariableAction | null;
  permanentActions: readonly NormalizedPermanentAction[];
  variableActions: readonly NormalizedVariableAction[];
}): NTC2018BeamCombinationMetadata {
  return {
    normativePreset: "NTC2018",
    ntcReference: NTC2018_REFERENCE,
    leadingLoadCaseId: leadingVariableAction?.loadCaseId ?? null,
    leadingActionId: leadingVariableAction?.actionId ?? null,
    leadingVariableCategory: leadingVariableAction?.category ?? null,
    accompanyingLoadCaseIds: leadingVariableAction
      ? variableActions
          .filter((action) => action.loadCaseId !== leadingVariableAction.loadCaseId)
          .map((action) => action.loadCaseId)
      : [],
    loadDurations: Object.fromEntries(
      [...permanentActions, ...variableActions].map((action) => [
        factorKey(action.loadCaseId),
        action.loadDurationClass,
      ]),
    ),
    generatedBy: "createNTC2018BeamCombinations",
    requestedType: type,
  };
}

function createUlsCombination({
  idPrefix,
  permanentActions,
  variableActions,
  leadingVariableAction = null,
  combinationSet,
}: {
  idPrefix: string | number;
  permanentActions: readonly NormalizedPermanentAction[];
  variableActions: readonly NormalizedVariableAction[];
  leadingVariableAction?: NormalizedVariableAction | null;
  combinationSet: string;
}): NTC2018BeamCombination {
  const factors: Record<string, number> = {};
  const partialFactors: Record<string, number> = {};

  for (const action of permanentActions) {
    const effect = action.favourable ? "favourable" : "unfavourable";
    const factor = resolvePartialFactor(action.action, {
      permanentClass: action.permanentClass,
      effect,
      combinationSet,
    });

    factors[factorKey(action.loadCaseId)] = factor;
    partialFactors[factorKey(action.loadCaseId)] = factor;
  }

  if (leadingVariableAction) {
    for (const action of variableActions) {
      const partialFactor = resolvePartialFactor(action.action, {
        family: action.family,
        effect: "unfavourable",
        combinationSet,
      });
      const combinationFactor =
        action.loadCaseId === leadingVariableAction.loadCaseId ? 1 : action.combinationFactors.psi0;

      factors[factorKey(action.loadCaseId)] = partialFactor * combinationFactor;
      partialFactors[factorKey(action.loadCaseId)] = partialFactor;
    }
  }

  const suffix = leadingVariableAction ? compactId(leadingVariableAction.loadCaseId) : "permanent";

  return {
    id: `${idPrefix}-ULS-${suffix}`,
    name: `ULS ${suffix}`,
    limitState: "ULS",
    combinationType: "ULS_STR_GEO",
    factors,
    metadata: {
      ...baseMetadata({
        type: "ULS",
        leadingVariableAction,
        permanentActions,
        variableActions,
      }),
      partialFactors: factorsToMetadata(partialFactors),
      combinationFactors: Object.fromEntries(
        variableActions.map((action) => [
          factorKey(action.loadCaseId),
          action.loadCaseId === leadingVariableAction?.loadCaseId
            ? 1
            : action.combinationFactors.psi0,
        ]),
      ),
    },
  };
}

function createSleCombination({
  idPrefix,
  type,
  permanentActions,
  variableActions,
  leadingVariableAction = null,
}: {
  idPrefix: string | number;
  type: string;
  permanentActions: readonly NormalizedPermanentAction[];
  variableActions: readonly NormalizedVariableAction[];
  leadingVariableAction?: NormalizedVariableAction | null;
}): NTC2018BeamCombination {
  const normalizedType = normalizeType(type);
  const sleType = normalizedType.replace("SLE_", "");
  const factors: Record<string, number> = {};
  const psiFactors: Record<string, number> = {};

  for (const action of permanentActions) {
    factors[factorKey(action.loadCaseId)] = 1;
    psiFactors[factorKey(action.loadCaseId)] = 1;
  }

  for (const action of variableActions) {
    let factor = action.combinationFactors.psi2;

    if (sleType === "RARE") {
      factor =
        action.loadCaseId === leadingVariableAction?.loadCaseId
          ? 1
          : action.combinationFactors.psi0;
    } else if (sleType === "FREQUENT") {
      factor =
        action.loadCaseId === leadingVariableAction?.loadCaseId
          ? action.combinationFactors.psi1
          : action.combinationFactors.psi2;
    }

    factors[factorKey(action.loadCaseId)] = factor;
    psiFactors[factorKey(action.loadCaseId)] = factor;
  }

  const suffix = leadingVariableAction ? compactId(leadingVariableAction.loadCaseId) : "all";

  return {
    id: `${idPrefix}-${normalizedType}-${suffix}`,
    name: `${normalizedType} ${suffix}`,
    limitState: "SLE",
    combinationType: normalizedType,
    factors,
    metadata: {
      ...baseMetadata({
        type: normalizedType,
        leadingVariableAction,
        permanentActions,
        variableActions,
      }),
      serviceCombination: sleType.toLowerCase().replace("_", "-"),
      psiFactors: factorsToMetadata(psiFactors),
    },
  };
}

function leadingVariableActionsFor(
  type: string,
  variableActions: readonly NormalizedVariableAction[],
): (NormalizedVariableAction | null)[] {
  const normalizedType = normalizeType(type);

  if (normalizedType === "SLE_QUASI_PERMANENT") {
    return [null];
  }

  const candidates = variableActions.filter((action) => action.leadingEligible);

  return candidates.length > 0 ? candidates : [null];
}

export function createNTC2018BeamCombinations({
  loads = [],
  permanentActions = [],
  variableActions = [],
  types = DEFAULT_COMBINATION_TYPES,
  idPrefix = "NTC2018",
  combinationSet = "A1",
}: CreateNTC2018BeamCombinationsOptions = {}): NTC2018BeamCombination[] {
  const normalizedTypes = types.map(normalizeType);
  const normalized = normalizeInputActions({
    loads,
    permanentActions,
    variableActions,
  });
  const combinations: NTC2018BeamCombination[] = [];

  for (const type of normalizedTypes) {
    if (type === "ULS") {
      for (const leadingVariableAction of leadingVariableActionsFor(
        type,
        normalized.variableActions,
      )) {
        combinations.push(
          createUlsCombination({
            idPrefix,
            permanentActions: normalized.permanentActions,
            variableActions: normalized.variableActions,
            leadingVariableAction,
            combinationSet,
          }),
        );
      }
      continue;
    }

    if (["SLE_RARE", "SLE_FREQUENT", "SLE_QUASI_PERMANENT"].includes(type)) {
      for (const leadingVariableAction of leadingVariableActionsFor(
        type,
        normalized.variableActions,
      )) {
        combinations.push(
          createSleCombination({
            idPrefix,
            type,
            permanentActions: normalized.permanentActions,
            variableActions: normalized.variableActions,
            leadingVariableAction,
          }),
        );
      }
      continue;
    }

    throw new Error(`Unsupported NTC 2018 beam combination type: ${sourceString(type)}.`);
  }

  return combinations;
}
