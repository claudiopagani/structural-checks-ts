import test from "node:test";

import {
  NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS,
  NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS,
  NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS,
  NTC2018_EXISTING_MASONRY_TYPOLOGIES,
  getNTC2018TabulatedMasonryProperties,
  resolveNTC2018MasonryTypology,
} from "../dist/index.js";
import type {
  Ntc2018ExistingMasonryMechanicalProperties,
  Ntc2018ExistingMasonryModifierDefinition,
  Ntc2018ExistingMasonryParameterLevel,
  Ntc2018ExistingMasonryParameterLevels,
  Ntc2018ExistingMasonryTypology,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS>>,
  AssertFalse<IsAny<typeof NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS>>,
  AssertFalse<IsAny<typeof NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS>>,
  AssertFalse<IsAny<typeof NTC2018_EXISTING_MASONRY_TYPOLOGIES>>,
  AssertFalse<IsAny<typeof getNTC2018TabulatedMasonryProperties>>,
  AssertFalse<IsAny<typeof resolveNTC2018MasonryTypology>>,
];
type PublicContracts = [
  Ntc2018ExistingMasonryMechanicalProperties,
  Ntc2018ExistingMasonryModifierDefinition,
  Ntc2018ExistingMasonryParameterLevel,
  Ntc2018ExistingMasonryParameterLevels,
  Ntc2018ExistingMasonryTypology,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 existing-masonry catalogs expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_EXISTING_MASONRY_KNOWLEDGE_LEVELS;
  void NTC2018_EXISTING_MASONRY_MODIFIER_DEFINITIONS;
  void NTC2018_EXISTING_MASONRY_PARAMETER_LEVELS;
  void NTC2018_EXISTING_MASONRY_TYPOLOGIES;
  void getNTC2018TabulatedMasonryProperties;
  void resolveNTC2018MasonryTypology;
});
