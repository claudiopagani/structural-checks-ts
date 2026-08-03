import { LoadCombination } from "../../../domain/analysis/LoadCombination.js";
import { NTC2018_ULS_PARTIAL_FACTORS } from "./ntc2018LoadParameters.js";
import { getNTC2018ActionCombinationFactors } from "../actions/createNTC2018Action.js";
import type { NTC2018ActionCombinationFactorDefinition } from "../actions/ntc2018ActionParameters.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";

export interface NTC2018CombinationLoadCase {
  readonly id?: string | null;
}

export interface NTC2018CombinationActionMethods {
  getPartialFactor(options: { combinationSet: string; effect: string }): number | null;
  getCombinationFactor(kind: "psi0" | "psi1" | "psi2"): number;
}

export interface NTC2018CombinationAction {
  nature?: string | null;
  permanentClass?: string | null;
  actionType?: string | null;
  favourable?: boolean | null;
  category?: string | null;
  loadCase?: NTC2018CombinationLoadCase | null;
  action?: NTC2018CombinationActionMethods | null;
  getPartialFactor?: NTC2018CombinationActionMethods["getPartialFactor"];
  getCombinationFactor?: NTC2018CombinationActionMethods["getCombinationFactor"];
}

export interface CreateNTC2018ULSFundamentalCombinationOptions {
  id?: string | null;
  name?: string | null;
  permanentActions?: readonly NTC2018CombinationAction[];
  variableActions?: readonly NTC2018CombinationAction[];
  leadingVariableAction?: NTC2018CombinationAction | null;
  metadata?: Record<string, unknown>;
}

export interface CreateNTC2018SLECombinationOptions {
  id?: string | null;
  name?: string | null;
  type?: string;
  permanentActions?: readonly NTC2018CombinationAction[];
  variableActions?: readonly NTC2018CombinationAction[];
  leadingVariableAction?: NTC2018CombinationAction | null;
  metadata?: Record<string, unknown>;
}

interface NormalizedPermanentAction {
  actionType: string;
  favourable: boolean;
  loadCase: unknown;
  actionObject: unknown;
}

interface NormalizedVariableAction {
  category: string | null | undefined;
  loadCase: unknown;
  actionObject: unknown;
}

function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Reflect.get(Object(value), key);
}

function readLoadCaseId(loadCase: unknown): unknown {
  if (loadCase === null) {
    throw new TypeError("Cannot read properties of null (reading 'id')");
  }
  if (loadCase === undefined) {
    throw new TypeError("Cannot read properties of undefined (reading 'id')");
  }

  return Reflect.get(Object(loadCase), "id");
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

function normalizePermanentAction(action: NTC2018CombinationAction): NormalizedPermanentAction {
  if (action?.nature === "permanent") {
    return {
      actionType: action.permanentClass ?? "G1",
      favourable: false,
      loadCase: action.loadCase,
      actionObject: action,
    };
  }

  return {
    actionType: action.actionType ?? "G1",
    favourable: Boolean(action.favourable),
    loadCase: action.loadCase,
    actionObject: action.action ?? null,
  };
}

function normalizeVariableAction(action: NTC2018CombinationAction): NormalizedVariableAction {
  if (action?.nature === "variable") {
    return {
      category: action.category,
      loadCase: action.loadCase,
      actionObject: action,
    };
  }

  return {
    category: action.category,
    loadCase: action.loadCase,
    actionObject: action.action ?? null,
  };
}

function addFactor(combination: LoadCombination, loadCase: unknown, factor: unknown): void {
  callMethod(combination, "addFactor", [loadCase, factor]);
}

function getCombinationFactors(
  category: string | null | undefined,
): NTC2018ActionCombinationFactorDefinition {
  if (typeof category === "string") {
    return getNTC2018ActionCombinationFactors(category);
  }

  throw new Error(`Unsupported NTC 2018 action category: ${String(category)}.`);
}

function metadataWithNormativePreset(metadata: Record<string, unknown>): Record<string, unknown> {
  return {
    ...metadata,
    normativePreset: "NTC2018",
    ntcReference: NTC2018_REFERENCE,
  };
}

export function createNTC2018ULSFundamentalCombination({
  id,
  name = id,
  permanentActions = [],
  variableActions = [],
  leadingVariableAction,
  metadata = {},
}: CreateNTC2018ULSFundamentalCombinationOptions): LoadCombination {
  if (!leadingVariableAction) {
    throw new Error("A leading variable action is required for an NTC 2018 ULS combination.");
  }

  const combination = new LoadCombination({
    id,
    name,
    combinationType: "ULS_STR_GEO",
    metadata: metadataWithNormativePreset(metadata),
  });

  permanentActions.map(normalizePermanentAction).forEach((action) => {
    const factor = action.actionObject
      ? callMethod(action.actionObject, "getPartialFactor", [
          {
            combinationSet: "A1",
            effect: action.favourable ? "favourable" : "unfavourable",
          },
        ])
      : action.actionType === "G2"
        ? action.favourable
          ? NTC2018_ULS_PARTIAL_FACTORS.G2_FAVOURABLE
          : NTC2018_ULS_PARTIAL_FACTORS.G2_UNFAVOURABLE
        : action.favourable
          ? NTC2018_ULS_PARTIAL_FACTORS.G1_FAVOURABLE
          : NTC2018_ULS_PARTIAL_FACTORS.G1_UNFAVOURABLE;

    addFactor(combination, action.loadCase, factor);
  });

  const normalizedLeadingAction = normalizeVariableAction(leadingVariableAction);
  const leadingFactor = normalizedLeadingAction.actionObject
    ? callMethod(normalizedLeadingAction.actionObject, "getPartialFactor", [
        {
          combinationSet: "A1",
          effect: "unfavourable",
        },
      ])
    : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;

  addFactor(combination, normalizedLeadingAction.loadCase, leadingFactor);

  variableActions
    .map(normalizeVariableAction)
    .filter(
      (action) =>
        readLoadCaseId(action.loadCase) !== readLoadCaseId(normalizedLeadingAction.loadCase),
    )
    .forEach((action) => {
      const combinationFactor = action.actionObject
        ? callMethod(action.actionObject, "getCombinationFactor", ["psi0"])
        : getCombinationFactors(action.category).psi0;
      const partialFactor = action.actionObject
        ? callMethod(action.actionObject, "getPartialFactor", [
            {
              combinationSet: "A1",
              effect: "unfavourable",
            },
          ])
        : NTC2018_ULS_PARTIAL_FACTORS.Q_UNFAVOURABLE;

      addFactor(combination, action.loadCase, Number(partialFactor) * Number(combinationFactor));
    });

  return combination;
}

export function createNTC2018SLECombination({
  id,
  name = id,
  type = "RARE",
  permanentActions = [],
  variableActions = [],
  leadingVariableAction = null,
  metadata = {},
}: CreateNTC2018SLECombinationOptions): LoadCombination {
  const normalizedType = type.toUpperCase();
  const supportedTypes = ["RARE", "FREQUENT", "QUASI_PERMANENT"];

  if (!supportedTypes.includes(normalizedType)) {
    throw new Error(`Unsupported NTC 2018 SLE combination type: ${type}.`);
  }

  const combination = new LoadCombination({
    id,
    name,
    combinationType: `SLE_${normalizedType}`,
    metadata: metadataWithNormativePreset(metadata),
  });

  permanentActions.map(normalizePermanentAction).forEach((action) => {
    addFactor(combination, action.loadCase, 1.0);
  });

  const normalizedLeadingAction = leadingVariableAction
    ? normalizeVariableAction(leadingVariableAction)
    : null;

  variableActions.map(normalizeVariableAction).forEach((action) => {
    const psi0 = action.actionObject
      ? callMethod(action.actionObject, "getCombinationFactor", ["psi0"])
      : getCombinationFactors(action.category).psi0;
    const psi1 = action.actionObject
      ? callMethod(action.actionObject, "getCombinationFactor", ["psi1"])
      : getCombinationFactors(action.category).psi1;
    const psi2 = action.actionObject
      ? callMethod(action.actionObject, "getCombinationFactor", ["psi2"])
      : getCombinationFactors(action.category).psi2;

    if (normalizedType === "QUASI_PERMANENT") {
      addFactor(combination, action.loadCase, psi2);
      return;
    }

    if (!normalizedLeadingAction) {
      throw new Error(`A leading variable action is required for SLE ${normalizedType}.`);
    }

    if (readLoadCaseId(action.loadCase) === readLoadCaseId(normalizedLeadingAction.loadCase)) {
      addFactor(combination, action.loadCase, normalizedType === "RARE" ? 1.0 : psi1);
      return;
    }

    addFactor(combination, action.loadCase, normalizedType === "RARE" ? psi0 : psi2);
  });

  return combination;
}
