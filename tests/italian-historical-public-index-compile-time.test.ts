import test from "node:test";

import {
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES,
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES,
  ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS,
  createItalianHistoricalReinforcementSteelMaterial,
  getItalianHistoricalReinforcementSteelGrade,
  listItalianHistoricalReinforcementSteelGrades,
} from "../dist/norms/italian-historical/index.js";
import type {
  CreateItalianHistoricalReinforcementSteelMaterialOptions,
  ItalianHistoricalReinforcementSteelGrade,
  ItalianHistoricalReinforcementSteelGradeListing,
  ItalianHistoricalReinforcementSteelGradeName,
  ItalianHistoricalReinforcementSteelStandard,
} from "../dist/norms/italian-historical/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES>>,
  AssertFalse<IsAny<typeof ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES>>,
  AssertFalse<IsAny<typeof ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS>>,
  AssertFalse<IsAny<typeof createItalianHistoricalReinforcementSteelMaterial>>,
  AssertFalse<IsAny<typeof getItalianHistoricalReinforcementSteelGrade>>,
  AssertFalse<IsAny<typeof listItalianHistoricalReinforcementSteelGrades>>,
];
type PublicContracts = [
  CreateItalianHistoricalReinforcementSteelMaterialOptions,
  ItalianHistoricalReinforcementSteelGrade,
  ItalianHistoricalReinforcementSteelGradeListing,
  ItalianHistoricalReinforcementSteelGradeName,
  ItalianHistoricalReinforcementSteelStandard,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("Italian historical reinforcement exports expose strict typed contracts", () => {
  useConsumerContracts(undefined);
  void ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADE_NAMES;
  void ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_GRADES;
  void ITALIAN_HISTORICAL_REINFORCEMENT_STEEL_STANDARDS;
  void createItalianHistoricalReinforcementSteelMaterial;
  void getItalianHistoricalReinforcementSteelGrade;
  void listItalianHistoricalReinforcementSteelGrades;
});
