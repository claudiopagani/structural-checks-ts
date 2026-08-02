import test from "node:test";

import {
  NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES,
  NTC2018_SOLID_TIMBER_STRENGTH_CLASSES,
  NTC2018_STRUCTURAL_STEEL_GRADES,
  NTC2018_TIMBER_STRENGTH_CLASSES,
} from "../dist/index.js";
import type {
  NTC2018GlulamTimberStrengthClass,
  NTC2018SolidTimberStrengthClass,
  NTC2018StructuralSteelGrade,
  NTC2018StructuralSteelGradePreset,
  NTC2018TimberStrengthClass,
  NTC2018TimberStrengthClassPreset,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES>>,
  AssertFalse<IsAny<typeof NTC2018_SOLID_TIMBER_STRENGTH_CLASSES>>,
  AssertFalse<IsAny<typeof NTC2018_STRUCTURAL_STEEL_GRADES>>,
  AssertFalse<IsAny<typeof NTC2018_TIMBER_STRENGTH_CLASSES>>,
];
type CatalogContracts = [
  NTC2018GlulamTimberStrengthClass,
  NTC2018SolidTimberStrengthClass,
  NTC2018StructuralSteelGrade,
  NTC2018StructuralSteelGradePreset,
  NTC2018TimberStrengthClass,
  NTC2018TimberStrengthClassPreset,
];
type ConsumerContracts = PublicDeclarationsAreUseful & CatalogContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 material catalogs expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const structuralGrade: NTC2018StructuralSteelGrade = "S355";
  const solidClass: NTC2018SolidTimberStrengthClass = "C24";
  const glulamClass: NTC2018GlulamTimberStrengthClass = "GL28h";
  const timberClass: NTC2018TimberStrengthClass = glulamClass;
  const structuralPreset: NTC2018StructuralSteelGradePreset =
    NTC2018_STRUCTURAL_STEEL_GRADES[structuralGrade];
  const timberPreset: NTC2018TimberStrengthClassPreset =
    NTC2018_TIMBER_STRENGTH_CLASSES[timberClass];

  void structuralPreset;
  void timberPreset;
  void NTC2018_SOLID_TIMBER_STRENGTH_CLASSES[solidClass];
  void NTC2018_GLULAM_TIMBER_STRENGTH_CLASSES[glulamClass];
});
