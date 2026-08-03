import test from "node:test";

import {
  createNTC2018StructuralSteelMaterial,
  type CreateNTC2018StructuralSteelMaterialOptions,
  type SteelMaterialJson,
  type NTC2018StructuralSteelGrade,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof createNTC2018StructuralSteelMaterial>>,
];
type PublicContracts = [
  CreateNTC2018StructuralSteelMaterialOptions,
  SteelMaterialJson,
  NTC2018StructuralSteelGrade,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 structural-steel factory exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const options: CreateNTC2018StructuralSteelMaterialOptions = {
    grade: "S355",
    gammaM0: 1.05,
    units: { force: "N", length: "mm" },
  };
  const material = createNTC2018StructuralSteelMaterial(options);

  assertSteelGrade(material.toJSON().grade);
});

function assertSteelGrade(value: string): asserts value is NTC2018StructuralSteelGrade {
  if (value !== "S235" && value !== "S275" && value !== "S355") {
    throw new Error(`Unexpected structural-steel grade: ${value}.`);
  }
}
