import test from "node:test";

import {
  AccidentalAction,
  ClimaticAction,
  ImposedAction,
  PermanentAction,
  SeismicAction,
  SnowAction,
  ThermalAction,
  TrafficAction,
  VariableAction,
  WindAction,
} from "../dist/index.js";
import type {
  ActionJson,
  ActionLoadCaseReference,
  ActionOptions,
  ActionPartialFactorValue,
  ClimaticActionOptions,
  PermanentActionJson,
  VariableActionJson,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<T extends U, U> = T;

type PublicActionDeclarationsAreTyped = [
  AssertFalse<IsAny<typeof PermanentAction>>,
  AssertFalse<IsAny<typeof VariableAction>>,
  AssertFalse<IsAny<typeof WindAction>>,
  AssertFalse<IsAny<ReturnType<VariableAction["toJSON"]>>>,
];

const commonOptions: ActionOptions = {
  id: "action-compile-Δ",
  name: "Compile-time action § Δ",
  combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
  partialFactors: {
    A1: { favourable: 0.8, unfavourable: 1.5 },
  },
  metadata: { source: "compile-time fixture" },
};
const variableOptions = {
  ...commonOptions,
  category: "B",
  leadingEligible: false,
};
const variable = new VariableAction(variableOptions);
const permanent = new PermanentAction({ ...commonOptions, permanentClass: "G2" });
const imposed = new ImposedAction(variableOptions);
const climaticOptions: ClimaticActionOptions = { ...commonOptions };
const climatic = new ClimaticAction(climaticOptions);
const traffic = new TrafficAction(variableOptions);
const snow = new SnowAction(climaticOptions);
const wind = new WindAction(climaticOptions);
const thermal = new ThermalAction(climaticOptions);
const accidental = new AccidentalAction(commonOptions);
const seismic = new SeismicAction(commonOptions);

const actionJson: ActionJson = variable.toJSON();
const variableJson: VariableActionJson = variable.toJSON();
const permanentJson: PermanentActionJson = permanent.toJSON();
const factor: number = variable.getCombinationFactor();
const partialFactor: ActionPartialFactorValue = variable.getPartialFactor();
const assigned: VariableAction = variable.assignTo({ id: "LC-compile-time" });
const loadCase: ActionLoadCaseReference | null = assigned.loadCase;

type PublicResultsAreUseful = [
  AssertExtends<typeof actionJson, ActionJson>,
  AssertExtends<typeof variableJson, VariableActionJson>,
  AssertExtends<typeof permanentJson, PermanentActionJson>,
  AssertExtends<typeof factor, number>,
  AssertExtends<typeof partialFactor, ActionPartialFactorValue>,
  AssertExtends<typeof loadCase, ActionLoadCaseReference | null>,
];

void imposed;
void climatic;
void traffic;
void snow;
void wind;
void thermal;
void accidental;
void seismic;
void actionJson;
void variableJson;
void permanentJson;
void factor;
void partialFactor;
void loadCase;
const compileTimeAssertions = (
  _publicActionDeclarationsAreTyped: PublicActionDeclarationsAreTyped,
  _publicResultsAreUseful: PublicResultsAreUseful,
): void => {
  void _publicActionDeclarationsAreTyped;
  void _publicResultsAreUseful;
};
void compileTimeAssertions;

void test("domain action hierarchy declarations support typed consumers", () => {
  // Compile-time assertions above are the test.
});
