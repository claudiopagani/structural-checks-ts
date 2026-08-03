import test from "node:test";

import {
  createNTC2018PermanentAction,
  createNTC2018SLECombination,
  createNTC2018ULSFundamentalCombination,
  createNTC2018VariableAction,
} from "../dist/index.js";
import type {
  CreateNTC2018SLECombinationOptions,
  CreateNTC2018ULSFundamentalCombinationOptions,
  NTC2018CombinationAction,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof createNTC2018SLECombination>>,
  AssertFalse<IsAny<typeof createNTC2018ULSFundamentalCombination>>,
];
type ConsumerContracts = [
  ...PublicDeclarationsAreUseful,
  CreateNTC2018SLECombinationOptions,
  CreateNTC2018ULSFundamentalCombinationOptions,
  NTC2018CombinationAction,
];

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 load-combination factories expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const permanent = createNTC2018PermanentAction({
    id: "ACT-G1",
    permanentClass: "G1",
    loadCase: { id: "G1" },
  });
  const variable = createNTC2018VariableAction({
    id: "ACT-QB",
    category: "B",
    loadCase: { id: "QB" },
  });
  const action: NTC2018CombinationAction = variable;
  const ulsOptions: CreateNTC2018ULSFundamentalCombinationOptions = {
    id: "ULS-1",
    permanentActions: [permanent],
    variableActions: [variable],
    leadingVariableAction: variable,
  };
  const sleOptions: CreateNTC2018SLECombinationOptions = {
    id: "SLE-1",
    type: "FREQUENT",
    variableActions: [variable],
    leadingVariableAction: variable,
  };

  void createNTC2018ULSFundamentalCombination(ulsOptions);
  void createNTC2018SLECombination(sleOptions);
  void action;
});
