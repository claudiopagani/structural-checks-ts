import assert from "node:assert/strict";
import test from "node:test";

import {
  createNTC2018TimberMaterial,
  GlulamTimberMaterial,
  SolidTimberMaterial,
  TimberMaterial,
} from "../dist/index.js";
import type {
  CreateNTC2018TimberMaterialOptions,
  NTC2018TimberStrengthClass,
  TimberMaterialJson,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [AssertFalse<IsAny<typeof createNTC2018TimberMaterial>>];
type PublicContracts = [
  CreateNTC2018TimberMaterialOptions,
  NTC2018TimberStrengthClass,
  TimberMaterialJson,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 timber factory exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const options: CreateNTC2018TimberMaterialOptions = {
    strengthClass: "GL24h",
    gammaM: 1.5,
    serviceClass: 2,
    kmod: 0.8,
    units: { force: "N", length: "mm" },
  };
  const material = createNTC2018TimberMaterial(options);

  assert.equal(material instanceof TimberMaterial, true);
  assert.equal(material instanceof GlulamTimberMaterial, true);
  assert.equal(material instanceof SolidTimberMaterial, false);
  assert.equal(material.toJSON().strengthClass, "GL24h");
});
