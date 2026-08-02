import test from "node:test";

import { NTC2018_ULS_PARTIAL_FACTORS, NTC2018_VARIABLE_ACTION_CATEGORIES } from "../dist/index.js";
import type { NTC2018UlsPartialFactors, NTC2018VariableActionCategory } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_ULS_PARTIAL_FACTORS>>,
  AssertFalse<IsAny<typeof NTC2018_VARIABLE_ACTION_CATEGORIES>>,
];
type ConsumerContracts = [
  ...PublicDeclarationsAreUseful,
  NTC2018UlsPartialFactors,
  NTC2018VariableActionCategory,
];

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 load parameters expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const category: NTC2018VariableActionCategory = "SNOW_HIGH";
  const partialFactors: NTC2018UlsPartialFactors = NTC2018_ULS_PARTIAL_FACTORS;

  void NTC2018_VARIABLE_ACTION_CATEGORIES[category];
  void partialFactors.Q_UNFAVOURABLE;
});
