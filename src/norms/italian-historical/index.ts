// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/norms/italian-historical/index.js.

export {
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES,
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS,
  getItalianHistoricalReinforcementSteelGrade,
  listItalianHistoricalReinforcementSteelGrades,
} from "./materials/historicalReinforcementSteelCatalogs.js";
export { createItalianHistoricalReinforcementSteelMaterial } from "./materials/createItalianHistoricalMaterial.js";
export type * from "./materials/historicalReinforcementSteelCatalogs.js";
export type * from "./materials/createItalianHistoricalMaterial.js";
