import test from "node:test";

import { LoadCase, LoadCombination } from "../dist/index.js";
import type {
  CombinationJson,
  CombinationOptions,
  LoadCaseJson,
  LoadCaseOptions,
  LoadCombinationJson,
  LoadCombinationOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<TValue extends TExpected, TExpected> = TValue;

const load: {
  id: string;
  assignTo: (loadCase: { readonly id?: string | null }) => unknown;
} = {
  id: "load-Δ",
  assignTo: (loadCase) => loadCase,
};
const loadCaseOptions: LoadCaseOptions = {
  id: "case-😀",
  name: "Caso Unicode",
  category: "variable",
  loads: [load],
  metadata: { source: "typed-consumer" },
};
const loadCase = new LoadCase(loadCaseOptions);
const combinationOptions: CombinationOptions = {
  id: "combination-1",
  metadata: { source: "typed-consumer" },
};
const loadCombinationOptions: LoadCombinationOptions = {
  ...combinationOptions,
  factors: [{ loadCase, factor: 1.3 }],
};
const loadCaseJson: LoadCaseJson = loadCase.toJSON();
const loadCombination = new LoadCombination(loadCombinationOptions);
const loadCombinationJson: LoadCombinationJson = loadCombination.toJSON();

type PublicDeclarationsAreTyped = [
  AssertFalse<IsAny<typeof LoadCase>>,
  AssertFalse<IsAny<typeof LoadCombination>>,
  AssertExtends<LoadCombinationJson, CombinationJson>,
  AssertExtends<typeof loadCaseJson, LoadCaseJson>,
  AssertExtends<typeof loadCombinationJson, LoadCombinationJson>,
];

void loadCaseJson;
void loadCombinationJson;
void (null as unknown as PublicDeclarationsAreTyped);

void test("domain analysis declarations support typed consumers", () => {
  // The assertions above are the test; this runtime body keeps the file in the test campaign.
});
