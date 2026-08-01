import { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  characteristicValueFromExistingMean,
  resolveExistingMaterialState,
  type ExistingMaterialKnowledgeLevelInput,
} from "../../../domain/materials/existingMaterialConfidence.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { withNormativeReferences } from "../../normativeReference.js";
import {
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../normativeReferences.js";
import {
  NTC2018_CONCRETE_CLASSES,
  NTC2018_REINFORCEMENT_STEEL_GRADES,
  type NTC2018ConcreteClassPreset,
  type NTC2018ConcreteStrengthClass,
  type NTC2018ReinforcementSteelGrade,
  type NTC2018ReinforcementSteelPreset,
} from "./ntc2018MaterialCatalogs.js";

const NTC2018_REFERENCE = "DM 17/01/2018 - NTC 2018";
const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

function round(value: number, decimals = 2): number {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : value;
}

function assertCatalogEntry<TEntry>(
  catalog: Readonly<Record<string, TEntry>>,
  key: string,
  message: string,
): TEntry {
  const entry = catalog[key];

  if (!entry) {
    throw new Error(message);
  }

  return entry;
}

export interface CreateNTC2018ConcreteMaterialOptions {
  strengthClass: NTC2018ConcreteStrengthClass;
  id?: string;
  name?: string;
  density?: number | null;
  gammaC?: number;
  alphaCc?: number;
  existing?: boolean;
  knowledgeLevel?: ExistingMaterialKnowledgeLevelInput;
  confidenceFactor?: number | null;
  meanCompressiveStrength?: number | null;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export function createNTC2018ConcreteMaterial({
  strengthClass,
  id = strengthClass,
  name = `Calcestruzzo ${strengthClass}`,
  density = null,
  gammaC = 1.5,
  alphaCc = 0.85,
  existing = false,
  knowledgeLevel = "LC1",
  confidenceFactor = null,
  meanCompressiveStrength = null,
  units = null,
  metadata = {},
}: CreateNTC2018ConcreteMaterialOptions): ConcreteMaterial {
  assertExplicitUnitSystem(units, "createNTC2018ConcreteMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry<NTC2018ConcreteClassPreset>(
    NTC2018_CONCRETE_CLASSES,
    strengthClass,
    `Unsupported NTC 2018 concrete class: ${strengthClass}.`,
  );
  const existingState = resolveExistingMaterialState({
    existing,
    knowledgeLevel,
    confidenceFactor,
  });
  const fcm =
    meanCompressiveStrength == null ? preset.fck + 8 : unitResolver.stress(meanCompressiveStrength);
  const fck = existingState.existing
    ? characteristicValueFromExistingMean(fcm, existingState.confidenceFactor)
    : preset.fck;
  // Mean strength, modulus, tension laws, and class data come from NTC chapter 11,
  // which is explicitly outside the currently imported corpus.
  const ecm = 22_000 * (fcm / 10) ** 0.3;
  const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + fcm / 10);

  return new ConcreteMaterial({
    id,
    name,
    strengthClass,
    density:
      density == null
        ? preset.concreteType === "lightweight"
          ? 2000
          : 2500
        : unitResolver.volumeLoad(density),
    elasticModulus: round(ecm, 0),
    fcm: round(fcm, 2),
    fck: round(fck, 2),
    fcd: round((alphaCc * fck) / gammaC, 2),
    fctm: round(fctm, 2),
    existing: existingState.existing,
    knowledgeLevel: existingState.knowledgeLevel ?? knowledgeLevel,
    confidenceFactor: existingState.confidenceFactor,
    meanProperties: existingState.existing
      ? {
          fcm: round(fcm, 2),
          elasticModulus: round(ecm, 0),
        }
      : {},
    units: INTERNAL_UNITS,
    metadata: withNormativeReferences(
      {
        ...metadata,
        normativePreset: "NTC2018",
        ntcReference: NTC2018_REFERENCE,
        gammaC,
        alphaCc,
        concreteType: preset.concreteType ?? "normal-weight",
        rck: preset.rck,
        fcm: round(fcm, 2),
        existingMaterial: existingState.existing,
        knowledgeLevel: existingState.knowledgeLevel,
        knowledgeLevelDescription: existingState.knowledgeLevelDescription,
        confidenceFactor: existingState.confidenceFactor,
        characteristicStrengthSource: existingState.existing
          ? "mean-divided-by-confidence-factor"
          : "catalog-characteristic",
      },
      [
        NTC2018_RC_CHAPTER_4_REFERENCES.concreteDesignCompression,
        NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.materialQualification,
      ],
    ),
  });
}

export interface CreateNTC2018ReinforcementSteelMaterialOptions {
  grade?: NTC2018ReinforcementSteelGrade;
  id?: string;
  name?: string;
  gammaS?: number;
  density?: number;
  elasticModulus?: number | null;
  existing?: boolean;
  knowledgeLevel?: ExistingMaterialKnowledgeLevelInput;
  confidenceFactor?: number | null;
  yieldMeanStrength?: number | null;
  ultimateMeanStrength?: number | null;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export function createNTC2018ReinforcementSteelMaterial({
  grade = "B450C",
  id = grade,
  name = `Acciaio per c.a. ${grade}`,
  gammaS = 1.15,
  density = 7850,
  elasticModulus = null,
  existing = false,
  knowledgeLevel = "LC1",
  confidenceFactor = null,
  yieldMeanStrength = null,
  ultimateMeanStrength = null,
  units = null,
  metadata = {},
}: CreateNTC2018ReinforcementSteelMaterialOptions): SteelMaterial {
  assertExplicitUnitSystem(units, "createNTC2018ReinforcementSteelMaterial");
  const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
  const preset = assertCatalogEntry<NTC2018ReinforcementSteelPreset>(
    NTC2018_REINFORCEMENT_STEEL_GRADES,
    grade,
    `Unsupported NTC 2018 reinforcement steel grade: ${grade}.`,
  );
  const existingState = resolveExistingMaterialState({
    existing,
    knowledgeLevel,
    confidenceFactor,
  });
  const fyMean = yieldMeanStrength == null ? preset.fyk : unitResolver.stress(yieldMeanStrength);
  const ftMean =
    ultimateMeanStrength == null ? preset.ftk : unitResolver.stress(ultimateMeanStrength);
  const fyk = existingState.existing
    ? characteristicValueFromExistingMean(fyMean, existingState.confidenceFactor)
    : preset.fyk;
  const ftk = existingState.existing
    ? characteristicValueFromExistingMean(ftMean, existingState.confidenceFactor)
    : preset.ftk;

  return new SteelMaterial({
    id,
    name,
    grade,
    density: unitResolver.volumeLoad(density),
    elasticModulus: elasticModulus == null ? 210_000 : unitResolver.stress(elasticModulus),
    fyMean: existingState.existing ? round(fyMean, 2) : null,
    ftMean: existingState.existing ? round(ftMean, 2) : null,
    fyk: round(fyk, 2),
    fyd: round(fyk / gammaS, 2),
    ftk: round(ftk, 2),
    ductilityClass: preset.ductilityClass,
    elongationCharacteristic: preset.elongationCharacteristic,
    existing: existingState.existing,
    knowledgeLevel: existingState.knowledgeLevel ?? knowledgeLevel,
    confidenceFactor: existingState.confidenceFactor,
    units: INTERNAL_UNITS,
    metadata: withNormativeReferences(
      {
        ...metadata,
        normativePreset: "NTC2018",
        ntcReference: NTC2018_REFERENCE,
        steelUse: "reinforcement",
        gammaS,
        elongationCharacteristic: preset.elongationCharacteristic,
        elongationCharacteristicPermille: round(preset.elongationCharacteristic * 1000, 2),
        ultimateStrain: round(0.9 * preset.elongationCharacteristic, 6),
        existingMaterial: existingState.existing,
        knowledgeLevel: existingState.knowledgeLevel,
        knowledgeLevelDescription: existingState.knowledgeLevelDescription,
        confidenceFactor: existingState.confidenceFactor,
        characteristicStrengthSource: existingState.existing
          ? "mean-divided-by-confidence-factor"
          : "catalog-characteristic",
      },
      [
        NTC2018_RC_CHAPTER_4_REFERENCES.reinforcementDesignYield,
        NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.materialQualification,
      ],
    ),
  });
}
