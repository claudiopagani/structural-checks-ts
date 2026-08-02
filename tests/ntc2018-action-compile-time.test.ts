import test from "node:test";

import {
  createNTC2018PermanentAction,
  createNTC2018SnowAction,
  createNTC2018VariableAction,
  getNTC2018ActionCombinationFactors,
  getNTC2018ActionPartialFactors,
  getNTC2018LoadDurationDefinition,
  getNTC2018TimberKmod,
  resolveNTC2018GoverningLoadDuration,
} from "../dist/index.js";
import type {
  CreateNTC2018PermanentActionOptions,
  CreateNTC2018SnowActionOptions,
  CreateNTC2018VariableActionOptions,
  GetNTC2018ActionPartialFactorsOptions,
  GetNTC2018TimberKmodOptions,
  NTC2018ActionCombinationFactorDefinition,
  NTC2018ActionDurationLike,
  NTC2018LoadDurationDefinition,
} from "../dist/index.js";

type AssertExtends<TValue extends TExpected, TExpected> = TValue;

const permanentOptions: CreateNTC2018PermanentActionOptions = {
  id: "G1",
  name: "Permanent action",
  permanentClass: "G1",
};
const variableOptions: CreateNTC2018VariableActionOptions = {
  id: "Q-B",
  category: "B",
  family: "imposed",
};
const snowOptions: CreateNTC2018SnowActionOptions = {
  id: "SNOW-HIGH",
  highAltitude: true,
};
const partialOptions: GetNTC2018ActionPartialFactorsOptions = {
  nature: "variable",
  family: "wind",
};
const timberOptions: GetNTC2018TimberKmodOptions = {
  materialType: "solid_timber",
  serviceClass: 2,
  loadDurationClass: "medium",
};
const durationAction: NTC2018ActionDurationLike = { loadDurationClass: "short" };

const permanentAction = createNTC2018PermanentAction(permanentOptions);
const variableAction = createNTC2018VariableAction(variableOptions);
const snowAction = createNTC2018SnowAction(snowOptions);
const factorDefinition: NTC2018ActionCombinationFactorDefinition =
  getNTC2018ActionCombinationFactors("E");
const partialFactors = getNTC2018ActionPartialFactors(partialOptions);
const durationDefinition: NTC2018LoadDurationDefinition & { key: string } =
  getNTC2018LoadDurationDefinition("short");
const timberKmod: number = getNTC2018TimberKmod(timberOptions);
const governingDuration: NTC2018LoadDurationDefinition & { key: string } =
  resolveNTC2018GoverningLoadDuration([durationAction]);

type PublicDeclarationsAreTyped = [
  AssertExtends<typeof permanentAction, ReturnType<typeof createNTC2018PermanentAction>>,
  AssertExtends<typeof variableAction, ReturnType<typeof createNTC2018VariableAction>>,
  AssertExtends<typeof snowAction, ReturnType<typeof createNTC2018SnowAction>>,
  AssertExtends<typeof factorDefinition, NTC2018ActionCombinationFactorDefinition>,
  AssertExtends<typeof partialFactors, Record<string, Record<string, number | null | undefined>>>,
  AssertExtends<typeof durationDefinition, NTC2018LoadDurationDefinition & { key: string }>,
  AssertExtends<typeof timberKmod, number>,
  AssertExtends<typeof governingDuration, NTC2018LoadDurationDefinition & { key: string }>,
];

void permanentAction;
void variableAction;
void snowAction;
void factorDefinition;
void partialFactors;
void durationDefinition;
void timberKmod;
void governingDuration;
const compileTimeAssertions = (_publicDeclarationsAreTyped: PublicDeclarationsAreTyped): void => {
  void _publicDeclarationsAreTyped;
};
void compileTimeAssertions;

void test("NTC 2018 action factories expose typed consumer contracts", () => {
  // Compile-time assertions above are the test.
});
