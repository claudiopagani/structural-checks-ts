// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// Source path: src/norms/ntc2018/materials/NTC2018ExistingMasonryMaterial.js.

import {
  ExistingMasonryMaterial,
  type ExistingMasonryMaterialJson,
} from "../../../domain/materials/ExistingMasonryMaterial.js";
import {
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
  NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
  getTabulatedMechanicalProperties,
  resolveMasonryTypology,
  type Ntc2018ExistingMasonryMechanicalProperties,
  type Ntc2018ExistingMasonryModifierDefinition,
  type Ntc2018ExistingMasonryParameterLevel,
  type Ntc2018ExistingMasonryTypology,
} from "./ntc2018ExistingMasonryCatalogs.js";

export interface Ntc2018ExistingMasonryMultiplierSet extends Record<string, number> {
  resistenzaCompressione: number;
  resistenzaTaglio: number;
  moduliElastici: number;
}

export interface Ntc2018ExistingMasonryAvailableModifier
  extends Ntc2018ExistingMasonryModifierDefinition {
  enabled: boolean;
  selected: unknown;
  value: number | undefined;
}

export interface Ntc2018ExistingMasonryMaterialOptions extends Record<string, unknown> {
  masonryTypology?: unknown;
  masonryTypologyId?: unknown;
  masonryType?: unknown;
  parameterLevel?: number | string | null;
  knowledgeLevel?: string | number | null;
  confidenceFactor?: number;
  modifierSelections?: Record<string, unknown>;
  surveyFactors?: Record<string, unknown>;
  improvementFactors?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  id?: string | null;
  name?: string | null;
  conditionLevel?: string;
  testResults?: readonly unknown[];
  interventions?: readonly unknown[];
}

export interface Ntc2018ExistingMasonryMaterialJson extends ExistingMasonryMaterialJson {
  masonryTypology: Pick<Ntc2018ExistingMasonryTypology, "id" | "name" | "notes">;
  parameterLevel: Ntc2018ExistingMasonryParameterLevel;
  modifierSelections: unknown;
  availableModifiers: unknown[];
  originalMechanicalProperties: Ntc2018ExistingMasonryMechanicalProperties;
  stateOfFactMultipliers: Ntc2018ExistingMasonryMultiplierSet;
  stateOfFactProperties: Ntc2018ExistingMasonryMechanicalProperties;
  improvementMultipliers: Ntc2018ExistingMasonryMultiplierSet;
  improvedMechanicalProperties: Record<string, number | null | undefined>;
}

const STATE_OF_FACT_MODIFIER_IDS = [1, 2, 3];
const KNOWLEDGE_TO_PARAMETER_LEVEL: Record<string, 1 | 2> = {
  LC1: 1,
  LC2: 2,
  LC3: 2,
};

function round(value: number, decimals = 3): number {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

function clone(value: unknown): unknown {
  return JSON.parse(String(JSON.stringify(value)));
}

function cloneForObjectSpread(value: unknown): Record<string, unknown> {
  const cloned = clone(value);

  if (cloned === null || cloned === undefined) {
    return {};
  }

  if (typeof cloned !== "object" && typeof cloned !== "string") {
    return {};
  }

  return Object.fromEntries(Object.entries(cloned));
}

function cloneArray(value: readonly unknown[]): unknown[] {
  const cloned = clone(value);
  return Array.isArray(cloned) ? cloned : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function selectionFlag(selection: unknown): unknown {
  return isRecord(selection) ? selection.selected : undefined;
}

function isSelected(selection: unknown): boolean {
  return Boolean(selectionFlag(selection));
}

function selectionValue(selection: unknown): number | undefined {
  if (!isRecord(selection) || selection.value == null) {
    return undefined;
  }

  return typeof selection.value === "number" ? selection.value : Number(selection.value);
}

function applyMechanicalMultipliers(
  properties: Ntc2018ExistingMasonryMechanicalProperties,
  multipliers: Ntc2018ExistingMasonryMultiplierSet,
): Ntc2018ExistingMasonryMechanicalProperties {
  const multiply = (value: number | undefined, factor: number): number =>
    round(value === undefined ? Number.NaN : value * factor);

  return {
    fm: multiply(properties.fm, multipliers.resistenzaCompressione),
    tau0: multiply(properties.tau0, multipliers.resistenzaTaglio),
    fv0: properties.fv0 == null ? undefined : round(properties.fv0 * multipliers.resistenzaTaglio),
    E: multiply(properties.E, multipliers.moduliElastici),
    G: multiply(properties.G, multipliers.moduliElastici),
    w: properties.w,
  };
}

function normalizeParameterLevel({
  parameterLevel,
  knowledgeLevel,
}: {
  parameterLevel: number | string | null;
  knowledgeLevel: string | number | null;
}): 1 | 2 {
  if (parameterLevel != null) {
    const normalized = Number(parameterLevel);

    if (normalized === 1 || normalized === 2) {
      return normalized;
    }

    throw new Error(
      "parameterLevel deve assumere valore 1 oppure 2 per i parametri tabellati di muratura esistente.",
    );
  }

  return KNOWLEDGE_TO_PARAMETER_LEVEL[String(knowledgeLevel)] ?? 2;
}

function getModifierValue({
  selection,
  availableModifier,
}: {
  selection: unknown;
  availableModifier: Ntc2018ExistingMasonryAvailableModifier | undefined;
}): number {
  if (!isSelected(selection)) {
    return 1;
  }

  return selectionValue(selection) ?? availableModifier?.value ?? 1;
}

export class NTC2018ExistingMasonryMaterial extends ExistingMasonryMaterial {
  masonryTypology: Ntc2018ExistingMasonryTypology;
  parameterLevel: 1 | 2;
  modifierSelections: Record<string, unknown>;
  availableModifiers: Ntc2018ExistingMasonryAvailableModifier[];
  originalMechanicalProperties: Ntc2018ExistingMasonryMechanicalProperties;
  stateOfFactMultipliers: Ntc2018ExistingMasonryMultiplierSet;
  stateOfFactProperties: Ntc2018ExistingMasonryMechanicalProperties;
  improvementMultipliers: Ntc2018ExistingMasonryMultiplierSet;
  improvedMechanicalProperties: Ntc2018ExistingMasonryMechanicalProperties;

  constructor({
    masonryTypology,
    masonryTypologyId,
    masonryType,
    parameterLevel = null,
    knowledgeLevel = "LC2",
    confidenceFactor = 1,
    modifierSelections = {},
    surveyFactors,
    improvementFactors,
    metadata = {},
    id = null,
    name = null,
    conditionLevel = "existing",
    testResults = [],
    interventions = [],
    ...rest
  }: Ntc2018ExistingMasonryMaterialOptions) {
    const resolvedTypology = resolveMasonryTypology(
      masonryTypologyId ?? masonryTypology ?? masonryType,
    );

    if (!resolvedTypology) {
      throw new Error(
        "Tipologia muraria NTC 2018 non riconosciuta. Passare masonryTypologyId oppure il nome completo della tipologia.",
      );
    }

    const resolvedParameterLevel = normalizeParameterLevel({
      parameterLevel,
      knowledgeLevel,
    });
    const selectedModifiers = {
      ...NTC2018ExistingMasonryMaterial.mergeLegacySelections(surveyFactors, improvementFactors),
      ...cloneForObjectSpread(modifierSelections),
    };
    const availableModifiers = NTC2018ExistingMasonryMaterial.buildAvailableModifiers(
      resolvedTypology,
      selectedModifiers,
    );

    NTC2018ExistingMasonryMaterial.validateModifierSelections(
      selectedModifiers,
      availableModifiers,
    );

    const baseProperties = getTabulatedMechanicalProperties(
      resolvedTypology,
      resolvedParameterLevel,
    );
    const stateOfFactMultipliers = NTC2018ExistingMasonryMaterial.computeStateOfFactMultipliers(
      availableModifiers,
      selectedModifiers,
    );
    const stateOfFactProperties = applyMechanicalMultipliers(
      baseProperties,
      stateOfFactMultipliers,
    );
    const improvementMultipliers = NTC2018ExistingMasonryMaterial.computeImprovementMultipliers(
      resolvedTypology,
      availableModifiers,
      selectedModifiers,
    );
    const improvedProperties = applyMechanicalMultipliers(
      stateOfFactProperties,
      improvementMultipliers,
    );

    super({
      id,
      name: name ?? resolvedTypology.name,
      masonryType: resolvedTypology.name,
      baseProperties,
      surveyFactors: stateOfFactMultipliers,
      improvementFactors: improvementMultipliers,
      knowledgeLevel,
      confidenceFactor,
      conditionLevel,
      elasticModulus: improvedProperties.E ?? null,
      shearModulus: improvedProperties.G ?? null,
      metadata: {
        ...metadata,
        normativePreset: "NTC2018ExistingMasonry",
        masonryTypologyId: resolvedTypology.id,
        masonryTypologyName: resolvedTypology.name,
        masonryParameterLevel: resolvedParameterLevel,
      },
      testResults,
      interventions,
      ...rest,
    });

    this.masonryTypology = resolvedTypology;
    this.parameterLevel = resolvedParameterLevel;
    this.modifierSelections = selectedModifiers;
    this.availableModifiers = availableModifiers;
    this.originalMechanicalProperties = baseProperties;
    this.stateOfFactMultipliers = stateOfFactMultipliers;
    this.stateOfFactProperties = stateOfFactProperties;
    this.improvementMultipliers = improvementMultipliers;
    this.improvedMechanicalProperties = improvedProperties;
  }

  static mergeLegacySelections(
    surveyFactors: Record<string, unknown> = {},
    improvementFactors: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const mapLegacy = (
      source: Record<string, unknown>,
      dictionary: Record<string, string>,
    ): Record<string, unknown> => {
      const mapped: Record<string, unknown> = {};

      for (const [legacyKey, modifierKey] of Object.entries(dictionary)) {
        if (source[legacyKey] == null || source[legacyKey] === 1) {
          continue;
        }

        mapped[modifierKey] = {
          selected: true,
          value: source[legacyKey],
        };
      }

      return mapped;
    };

    return {
      ...mapLegacy(surveyFactors, {
        mortarQuality: "maltaBuona",
        geometry: "ricorsiOListature",
        connections: "connessioneTrasversale",
      }),
      ...mapLegacy(improvementFactors, {
        groutInjection: "iniezioniMisceleLeganti",
        reinforcedPlaster: "intonacoArmato",
        jacketing: "ristilaturaArmata",
        ties: "tirantiniAntiespulsivi",
      }),
    };
  }

  static buildAvailableModifiers(
    typology: Ntc2018ExistingMasonryTypology,
    selections: Record<string, unknown>,
  ): Ntc2018ExistingMasonryAvailableModifier[] {
    return NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS.map((definition) => {
      const baseKey = definition.usesTypologyValueKey ?? definition.key;
      const typologyValue = typology.multipliers[baseKey];
      const selected = selectionFlag(selections[definition.key]) ?? false;
      const enabled = typologyValue != null;

      return {
        ...definition,
        enabled,
        selected,
        value:
          definition.key === "maltaBuona"
            ? (selectionValue(selections[definition.key]) ?? typologyValue)
            : typologyValue,
      };
    });
  }

  static validateModifierSelections(
    selections: Record<string, unknown>,
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
  ): void {
    const byKey: Record<string, Ntc2018ExistingMasonryAvailableModifier> = Object.fromEntries(
      availableModifiers.map((item) => [item.key, item]),
    );
    const byId: Record<number, Ntc2018ExistingMasonryAvailableModifier> = Object.fromEntries(
      availableModifiers.map((item) => [item.id, item]),
    );

    for (const [key, selection] of Object.entries(selections)) {
      if (!isSelected(selection)) {
        continue;
      }

      const modifier = byKey[key];

      if (!modifier) {
        throw new Error(`Coefficiente murario sconosciuto: ${key}.`);
      }

      if (!modifier.enabled) {
        throw new Error(
          `Il coefficiente "${modifier.label}" non e disponibile per la tipologia muraria selezionata.`,
        );
      }
    }

    for (const modifier of availableModifiers) {
      if (!isSelected(selections[modifier.key])) {
        continue;
      }

      for (const incompatibleId of modifier.incompatibleWith ?? []) {
        const incompatible = byId[incompatibleId];

        if (incompatible && isSelected(selections[incompatible.key])) {
          throw new Error(
            `I coefficienti "${modifier.label}" e "${incompatible.label}" non possono essere usati insieme.`,
          );
        }
      }
    }
  }

  static computeStateOfFactMultipliers(
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
    selections: Record<string, unknown>,
  ): Ntc2018ExistingMasonryMultiplierSet {
    const selectedValues = availableModifiers
      .filter((modifier) => STATE_OF_FACT_MODIFIER_IDS.includes(modifier.id))
      .map((modifier) =>
        getModifierValue({
          selection: selections[modifier.key],
          availableModifier: modifier,
        }),
      )
      .sort((a, b) => b - a)
      .slice(0, 2);

    const topTwoProduct = selectedValues.reduce((accumulator, value) => accumulator * value, 1);
    const maltaBuona = availableModifiers.find((modifier) => modifier.key === "maltaBuona");
    const maltaBuonaValue = getModifierValue({
      selection: selections.maltaBuona,
      availableModifier: maltaBuona,
    });

    return {
      resistenzaCompressione: round(topTwoProduct),
      resistenzaTaglio: round(topTwoProduct),
      moduliElastici: round(maltaBuonaValue),
    };
  }

  static computeImprovementMultipliers(
    typology: Ntc2018ExistingMasonryTypology,
    availableModifiers: Ntc2018ExistingMasonryAvailableModifier[],
    selections: Record<string, unknown>,
  ): Ntc2018ExistingMasonryMultiplierSet {
    const getByKey = (key: string): Ntc2018ExistingMasonryAvailableModifier | undefined =>
      availableModifiers.find((modifier) => modifier.key === key);
    const maxOverall = typology.multipliers.coefficienteMassimoComplessivo ?? Number.NaN;

    let connessioneTrasversale = getModifierValue({
      selection: selections.connessioneTrasversale,
      availableModifier: getByKey("connessioneTrasversale"),
    });
    const ricorsiOListature = getModifierValue({
      selection: selections.ricorsiOListature,
      availableModifier: getByKey("ricorsiOListature"),
    });
    const maltaBuona = getModifierValue({
      selection: selections.maltaBuona,
      availableModifier: getByKey("maltaBuona"),
    });
    const iniezioniMisceleLeganti = getModifierValue({
      selection: selections.iniezioniMisceleLeganti,
      availableModifier: getByKey("iniezioniMisceleLeganti"),
    });
    const intonacoArmato = getModifierValue({
      selection: selections.intonacoArmato,
      availableModifier: getByKey("intonacoArmato"),
    });
    const ristilaturaArmata = getModifierValue({
      selection: selections.ristilaturaArmata,
      availableModifier: getByKey("ristilaturaArmata"),
    });
    const diatoniArtificiali = getModifierValue({
      selection: selections.diatoniArtificiali,
      availableModifier: getByKey("diatoniArtificiali"),
    });
    const tirantiniAntiespulsivi = getModifierValue({
      selection: selections.tirantiniAntiespulsivi,
      availableModifier: getByKey("tirantiniAntiespulsivi"),
    });

    const hasInterventionsNeedingConnectionReduction = [
      selections.intonacoArmato,
      selections.ristilaturaArmata,
      selections.diatoniArtificiali,
      selections.tirantiniAntiespulsivi,
    ].some(isSelected);

    if (
      isSelected(selections.connessioneTrasversale) &&
      (connessioneTrasversale > ricorsiOListature || connessioneTrasversale > maltaBuona) &&
      hasInterventionsNeedingConnectionReduction
    ) {
      connessioneTrasversale =
        selectionValue(selections.connessioneTrasversale) ?? connessioneTrasversale;
    } else {
      connessioneTrasversale = 1;
    }

    return {
      resistenzaCompressione: round(
        Math.min(
          (iniezioniMisceleLeganti *
            intonacoArmato *
            ristilaturaArmata *
            diatoniArtificiali *
            tirantiniAntiespulsivi) /
            connessioneTrasversale,
          maxOverall,
        ),
      ),
      resistenzaTaglio: round(
        Math.min(
          (iniezioniMisceleLeganti * intonacoArmato * ristilaturaArmata * diatoniArtificiali) /
            connessioneTrasversale,
          maxOverall,
        ),
      ),
      moduliElastici: round(
        Math.min(
          iniezioniMisceleLeganti * intonacoArmato * ((ristilaturaArmata - 1) * 0.5 + 1),
          maxOverall,
        ),
      ),
    };
  }

  override adjustedProperty(propertyName: string): number | null {
    return this.improvedMechanicalProperties[propertyName] ?? null;
  }

  override adjustedProperties(): Record<string, number | null | undefined> {
    return { ...this.improvedMechanicalProperties };
  }

  stateOfFactPropertiesJSON(): Ntc2018ExistingMasonryMechanicalProperties {
    return { ...this.stateOfFactProperties };
  }

  originalPropertiesJSON(): Ntc2018ExistingMasonryMechanicalProperties {
    return { ...this.originalMechanicalProperties };
  }

  override toJSON(): Ntc2018ExistingMasonryMaterialJson {
    return {
      ...super.toJSON(),
      masonryTypology: {
        id: this.masonryTypology.id,
        name: this.masonryTypology.name,
        notes: this.masonryTypology.notes,
      },
      parameterLevel: {
        ...NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS[this.parameterLevel],
      },
      modifierSelections: clone(this.modifierSelections),
      availableModifiers: cloneArray(this.availableModifiers),
      originalMechanicalProperties: this.originalPropertiesJSON(),
      stateOfFactMultipliers: { ...this.stateOfFactMultipliers },
      stateOfFactProperties: this.stateOfFactPropertiesJSON(),
      improvementMultipliers: { ...this.improvementMultipliers },
      improvedMechanicalProperties: this.adjustedProperties(),
    };
  }
}
