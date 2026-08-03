import test from "node:test";

import {
  createNTC2018ExistingMasonryModifierState,
  createNTC2018ExistingMasonryWorkflowState,
  evaluateNTC2018ExistingMasonryWorkflow,
  type Ntc2018ExistingMasonryModifierSelection,
  type Ntc2018ExistingMasonryModifierSelections,
  type Ntc2018ExistingMasonryModifierState,
  type Ntc2018ExistingMasonryWorkflowData,
  type Ntc2018ExistingMasonryWorkflowRequest,
  type Ntc2018ExistingMasonryWorkflowResponse,
  type Ntc2018ExistingMasonryWorkflowState,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof createNTC2018ExistingMasonryModifierState>>,
  AssertFalse<IsAny<typeof createNTC2018ExistingMasonryWorkflowState>>,
  AssertFalse<IsAny<typeof evaluateNTC2018ExistingMasonryWorkflow>>,
];
type PublicContracts = [
  Ntc2018ExistingMasonryModifierSelection,
  Ntc2018ExistingMasonryModifierSelections,
  Ntc2018ExistingMasonryModifierState,
  Ntc2018ExistingMasonryWorkflowData,
  Ntc2018ExistingMasonryWorkflowRequest,
  Ntc2018ExistingMasonryWorkflowResponse,
  Ntc2018ExistingMasonryWorkflowState,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 existing-masonry workflow exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const state = createNTC2018ExistingMasonryWorkflowState();
  const modifiers = createNTC2018ExistingMasonryModifierState(1);
  const request: Ntc2018ExistingMasonryWorkflowRequest = {
    tipologiaIndex: state.tipologiaIndex,
    livelloDiConfidenza: state.livelloDiConfidenza,
    coefficienti: modifiers,
    units: { force: "N", length: "mm" },
  };

  void evaluateNTC2018ExistingMasonryWorkflow(request);
});
