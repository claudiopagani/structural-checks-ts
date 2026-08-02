import test from "node:test";

import {
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES,
  classifyNTC2018Topography,
} from "../dist/index.js";
import type {
  Ntc2018TopographicClassificationMethod,
  Ntc2018TopographicClassificationOptions,
  Ntc2018TopographicClassificationOutputs,
  Ntc2018TopographicClassificationReferences,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD>>,
  AssertFalse<IsAny<typeof NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES>>,
  AssertFalse<IsAny<typeof classifyNTC2018Topography>>,
];
type PublicContracts = [
  Ntc2018TopographicClassificationMethod,
  Ntc2018TopographicClassificationOptions,
  Ntc2018TopographicClassificationOutputs,
  Ntc2018TopographicClassificationReferences,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 topographic classification exports expose strict contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD;
  void NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES;
  void classifyNTC2018Topography;
});
