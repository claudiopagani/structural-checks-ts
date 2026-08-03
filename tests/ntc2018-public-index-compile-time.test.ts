import assert from "node:assert/strict";
import test from "node:test";

import {
  NTC2018_CONCRETE_CLASSES,
  NTC2018_TIMBER_KMOD,
  calculateNTC2018HorizontalElasticSpectrum,
  createNTC2018ConcreteMaterial,
  createNTC2018TimberMaterial,
  evaluateNTC2018MasonryPier,
} from "../dist/norms/ntc2018/index.js";
import type {
  CreateNTC2018ConcreteMaterialOptions,
  CreateNTC2018TimberMaterialOptions,
  NTC2018TimberStrengthClass,
} from "../dist/norms/ntc2018/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_CONCRETE_CLASSES>>,
  AssertFalse<IsAny<typeof NTC2018_TIMBER_KMOD>>,
  AssertFalse<IsAny<typeof calculateNTC2018HorizontalElasticSpectrum>>,
  AssertFalse<IsAny<typeof createNTC2018ConcreteMaterial>>,
  AssertFalse<IsAny<typeof createNTC2018TimberMaterial>>,
  AssertFalse<IsAny<typeof evaluateNTC2018MasonryPier>>,
];
type PublicContracts = [
  CreateNTC2018ConcreteMaterialOptions,
  CreateNTC2018TimberMaterialOptions,
  NTC2018TimberStrengthClass,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 public index exposes strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  const concreteOptions: CreateNTC2018ConcreteMaterialOptions = {
    strengthClass: "C25/30",
    units: { force: "N", length: "mm" },
  };
  const timberOptions: CreateNTC2018TimberMaterialOptions = {
    strengthClass: "GL24h",
    units: { force: "N", length: "mm" },
  };
  const strengthClass: NTC2018TimberStrengthClass = "C30";

  assert.equal(concreteOptions.strengthClass, "C25/30");
  assert.equal(timberOptions.strengthClass, "GL24h");
  assert.equal(strengthClass, "C30");
  void NTC2018_CONCRETE_CLASSES;
  void NTC2018_TIMBER_KMOD;
  void calculateNTC2018HorizontalElasticSpectrum;
  void createNTC2018ConcreteMaterial;
  void createNTC2018TimberMaterial;
  void evaluateNTC2018MasonryPier;
});
