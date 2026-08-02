import test from "node:test";

import { NTC2018ExistingMasonryMaterial } from "../dist/index.js";
import type {
  Ntc2018ExistingMasonryAvailableModifier,
  Ntc2018ExistingMasonryMaterialJson,
  Ntc2018ExistingMasonryMaterialOptions,
  Ntc2018ExistingMasonryMultiplierSet,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [AssertFalse<IsAny<typeof NTC2018ExistingMasonryMaterial>>];
type PublicContracts = [
  Ntc2018ExistingMasonryAvailableModifier,
  Ntc2018ExistingMasonryMaterialJson,
  Ntc2018ExistingMasonryMaterialOptions,
  Ntc2018ExistingMasonryMultiplierSet,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 existing-masonry material exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018ExistingMasonryMaterial;
});
