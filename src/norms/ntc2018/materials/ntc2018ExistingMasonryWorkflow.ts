// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/materials/ntc2018ExistingMasonryWorkflow.js.

import { createNTC2018ExistingMasonryMaterial } from "./createNTC2018Material.js";
import type { CreateNTC2018ExistingMasonryMaterialOptions } from "./createNTC2018Material.js";
import {
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
  resolveMasonryTypology,
  type Ntc2018ExistingMasonryModifierDefinition,
  type Ntc2018ExistingMasonryTypology,
} from "./ntc2018ExistingMasonryCatalogs.js";
import type { UnitSystemInput } from "../../../domain/units/UnitSystem.js";

const DEFAULT_TYPOLOGY_ID = 1;
const DEFAULT_PARAMETER_LEVEL = 1;

export interface Ntc2018ExistingMasonryModifierSelection {
  selected?: unknown;
  value?: unknown;
}

export type Ntc2018ExistingMasonryModifierSelections = Record<
  string,
  Ntc2018ExistingMasonryModifierSelection
>;

export interface Ntc2018ExistingMasonryModifierState {
  id: number;
  key: string;
  text: string;
  type: string;
  checked: boolean;
  enabled: boolean;
  value: unknown;
  toDisable: number[];
  toUncheck: number[];
}

export interface Ntc2018ExistingMasonryWorkflowState {
  tipologiaIndex: number;
  livelloDiConfidenza: number;
  coefficienti: Ntc2018ExistingMasonryModifierState[];
}

export interface Ntc2018ExistingMasonryWorkflowRequest {
  tipologiaIndex: number;
  livelloDiConfidenza: number;
  coefficienti?: Ntc2018ExistingMasonryModifierState[];
  units?: UnitSystemInput | null;
}

export interface Ntc2018ExistingMasonryWorkflowData {
  parametriOriginali: Record<string, number | undefined>;
  parametriAnteOperam: Record<string, number | undefined>;
  modificatoriStatoDiFatto: Record<string, number>;
  modificatori: Record<string, number>;
  parametriPostOperam: Record<string, number | null | undefined>;
  materiale: unknown;
}

export interface Ntc2018ExistingMasonryWorkflowResponse {
  ok: true;
  data: Ntc2018ExistingMasonryWorkflowData;
}

function readProperty(value: unknown, key: string): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    throw new TypeError(`Cannot read properties of null (reading '${key}')`);
  }

  if (typeof value === "object" || typeof value === "function") {
    return Reflect.get(value, key);
  }

  return undefined;
}

const getModifierDefinitionById = (
  modifierId: number,
): Ntc2018ExistingMasonryModifierDefinition | undefined =>
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.find((modifier) => modifier.id === modifierId);

function buildModifierItem(
  definition: Ntc2018ExistingMasonryModifierDefinition,
  typology: Ntc2018ExistingMasonryTypology,
  selection: unknown = {},
): Ntc2018ExistingMasonryModifierState {
  const valueKey = definition.usesTypologyValueKey ?? definition.key;
  const typologyValue = typology?.multipliers?.[valueKey];
  const enabled = typologyValue != null;
  const value =
    definition.key === "maltaBuona"
      ? (readProperty(selection, "value") ?? typologyValue)
      : typologyValue;

  return {
    id: definition.id,
    key: definition.key,
    text: definition.label,
    type: definition.phase === "survey" ? "Stato di fatto" : "Interventi di consolidamento",
    checked: enabled ? Boolean(readProperty(selection, "selected")) : false,
    enabled,
    value,
    toDisable: [...(definition.incompatibleWith ?? [])],
    toUncheck: [...(definition.incompatibleWith ?? [])],
  };
}

export const createNTC2018ExistingMasonryModifierState = (
  typologyId = DEFAULT_TYPOLOGY_ID,
  selections: Ntc2018ExistingMasonryModifierSelections = {},
): Ntc2018ExistingMasonryModifierState[] => {
  const typology = resolveMasonryTypology(typologyId);

  if (!typology) {
    throw new Error(`Tipologia muraria NTC 2018 non riconosciuta: ${typologyId}.`);
  }

  const modifiers = NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.map((definition) =>
    buildModifierItem(definition, typology, selections[definition.key]),
  );

  modifiers.push({
    id: 9,
    key: "coefficienteMassimoComplessivo",
    text: "Coefficiente massimo complessivo",
    type: "Coefficiente massimo complessivo",
    checked: false,
    enabled: true,
    value: typology.multipliers.coefficienteMassimoComplessivo,
    toDisable: [],
    toUncheck: [],
  });

  return modifiers;
};

export const toggleNTC2018ExistingMasonryModifier = (
  modifiers: Ntc2018ExistingMasonryModifierState[],
  modifierId: number,
): Ntc2018ExistingMasonryModifierState[] => {
  const selected = modifiers.find((item) => item.id === modifierId);

  if (!selected || !selected.enabled) {
    return modifiers.map((item) => ({ ...item }));
  }

  const nextChecked = !selected.checked;
  const idsToDisable = selected.toDisable ?? selected.toUncheck ?? [];

  return modifiers.map((item) => {
    if (item.id === modifierId) {
      return {
        ...item,
        checked: nextChecked,
      };
    }

    if (idsToDisable.includes(item.id)) {
      return {
        ...item,
        checked: false,
        enabled: !nextChecked,
      };
    }

    return { ...item };
  });
};

export const updateNTC2018ExistingMasonryMaltaBuona = (
  modifiers: Ntc2018ExistingMasonryModifierState[],
  fm: number,
): Ntc2018ExistingMasonryModifierState[] => {
  const coefficienteMaltaBuona = Math.pow(fm, 0.35);

  return modifiers.map((item) =>
    item.key === "maltaBuona"
      ? {
          ...item,
          value: coefficienteMaltaBuona,
        }
      : { ...item },
  );
};

export const createNTC2018ExistingMasonryWorkflowState =
  (): Ntc2018ExistingMasonryWorkflowState => ({
    tipologiaIndex: DEFAULT_TYPOLOGY_ID,
    livelloDiConfidenza: DEFAULT_PARAMETER_LEVEL,
    coefficienti: createNTC2018ExistingMasonryModifierState(DEFAULT_TYPOLOGY_ID),
  });

export const selectNTC2018ExistingMasonryTypology = (
  currentState: Ntc2018ExistingMasonryWorkflowState,
  tipologiaIndex: number,
): Ntc2018ExistingMasonryWorkflowState => ({
  ...currentState,
  tipologiaIndex,
  coefficienti: createNTC2018ExistingMasonryModifierState(tipologiaIndex),
});

export const selectNTC2018ExistingMasonryParameterLevel = (
  currentState: Ntc2018ExistingMasonryWorkflowState,
  livelloDiConfidenza: number,
): Ntc2018ExistingMasonryWorkflowState => ({
  ...currentState,
  livelloDiConfidenza,
});

export const applyNTC2018ExistingMasonryModifierToggle = (
  currentState: Ntc2018ExistingMasonryWorkflowState,
  coefficienteId: number,
): Ntc2018ExistingMasonryWorkflowState => ({
  ...currentState,
  coefficienti: toggleNTC2018ExistingMasonryModifier(currentState.coefficienti, coefficienteId),
});

export const applyNTC2018ExistingMasonryMaltaBuonaUpdate = (
  currentState: Ntc2018ExistingMasonryWorkflowState,
  fm: number,
): Ntc2018ExistingMasonryWorkflowState => ({
  ...currentState,
  coefficienti: updateNTC2018ExistingMasonryMaltaBuona(currentState.coefficienti, fm),
});

export const modifierSelectionsFromState = (
  modifiers: Ntc2018ExistingMasonryModifierState[],
): Ntc2018ExistingMasonryModifierSelections =>
  modifiers.reduce<Ntc2018ExistingMasonryModifierSelections>((accumulator, modifier) => {
    if (!modifier.key || modifier.id === 9 || !modifier.enabled || !modifier.checked) {
      return accumulator;
    }

    accumulator[modifier.key] = {
      selected: true,
      value: modifier.value,
    };
    return accumulator;
  }, {});

export const evaluateNTC2018ExistingMasonryWorkflow = async (
  requestBody: Ntc2018ExistingMasonryWorkflowRequest,
): Promise<Ntc2018ExistingMasonryWorkflowResponse> => {
  const materialOptions: CreateNTC2018ExistingMasonryMaterialOptions & {
    masonryTypologyId: number;
  } = {
    masonryTypologyId: requestBody.tipologiaIndex,
    parameterLevel: requestBody.livelloDiConfidenza,
    modifierSelections: modifierSelectionsFromState(requestBody.coefficienti ?? []),
  };

  if (requestBody.units !== undefined) {
    materialOptions.units = requestBody.units;
  }

  const material = createNTC2018ExistingMasonryMaterial(materialOptions);

  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    ok: true,
    data: {
      parametriOriginali: material.originalPropertiesJSON(),
      parametriAnteOperam: material.stateOfFactPropertiesJSON(),
      modificatoriStatoDiFatto: { ...material.stateOfFactMultipliers },
      modificatori: { ...material.improvementMultipliers },
      parametriPostOperam: material.adjustedProperties(),
      materiale: material.toJSON(),
    },
  };
};

export const getNTC2018ExistingMasonryModifierDefinition = getModifierDefinitionById;
