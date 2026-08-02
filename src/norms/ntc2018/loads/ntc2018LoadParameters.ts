// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/norms/ntc2018/loads/ntc2018LoadParameters.js.

import {
  NTC2018_ACTION_COMBINATION_FACTORS,
  NTC2018_ACTION_PARTIAL_FACTORS,
} from "../actions/ntc2018ActionParameters.js";

export const NTC2018_VARIABLE_ACTION_CATEGORIES = NTC2018_ACTION_COMBINATION_FACTORS;

const permanentPartialFactors = NTC2018_ACTION_PARTIAL_FACTORS.permanent;
const permanentG1PartialFactors = permanentPartialFactors?.G1;
const permanentG2PartialFactors = permanentPartialFactors?.G2;
const permanentG1A1PartialFactors = permanentG1PartialFactors?.A1;
const permanentG2A1PartialFactors = permanentG2PartialFactors?.A1;
const variablePartialFactors = NTC2018_ACTION_PARTIAL_FACTORS.variable;
const imposedPartialFactors = variablePartialFactors?.imposed;
const imposedA1PartialFactors = imposedPartialFactors?.A1;

if (
  permanentG1A1PartialFactors === undefined ||
  permanentG2A1PartialFactors === undefined ||
  imposedA1PartialFactors === undefined
) {
  throw new Error("NTC 2018 action partial factors are incomplete.");
}

export interface NTC2018UlsPartialFactors {
  G1_UNFAVOURABLE: number;
  G1_FAVOURABLE: number;
  G2_UNFAVOURABLE: number;
  G2_FAVOURABLE: number;
  Q_UNFAVOURABLE: number;
  Q_FAVOURABLE: number;
}

export const NTC2018_ULS_PARTIAL_FACTORS = {
  G1_UNFAVOURABLE: permanentG1A1PartialFactors.unfavourable,
  G1_FAVOURABLE: permanentG1A1PartialFactors.favourable,
  G2_UNFAVOURABLE: permanentG2A1PartialFactors.unfavourable,
  G2_FAVOURABLE: permanentG2A1PartialFactors.favourable,
  Q_UNFAVOURABLE: imposedA1PartialFactors.unfavourable,
  Q_FAVOURABLE: imposedA1PartialFactors.favourable,
} satisfies NTC2018UlsPartialFactors;

export type NTC2018VariableActionCategory = keyof typeof NTC2018_VARIABLE_ACTION_CATEGORIES;
