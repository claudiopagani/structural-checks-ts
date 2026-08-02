import test from "node:test";

import {
  NTC2018_SNOW_EXPOSURE_CLASSES,
  NTC2018_SNOW_GROUND_ZONES,
  NTC2018_SNOW_REFERENCES,
  calculateNTC2018GroundSnowLoad,
  calculateNTC2018PitchedRoofShapeCoefficient,
  calculateNTC2018RoofSnowLoad,
  calculateNTC2018SnowAreaLoad,
  getNTC2018SnowExposureClassDefinition,
  getNTC2018SnowGroundZoneDefinition,
} from "../dist/index.js";
import type {
  CalculateNTC2018GroundSnowLoadOptions,
  CalculateNTC2018PitchedRoofShapeCoefficientOptions,
  CalculateNTC2018RoofSnowLoadOptions,
  CalculateNTC2018SnowAreaLoadOptions,
  Ntc2018GroundSnowLoadResult,
  Ntc2018PitchedRoofShapeCoefficientResult,
  Ntc2018RoofSnowLoadResult,
  Ntc2018SnowExposureClassDefinition,
  Ntc2018SnowGroundZoneDefinition,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_SNOW_EXPOSURE_CLASSES>>,
  AssertFalse<IsAny<typeof NTC2018_SNOW_GROUND_ZONES>>,
  AssertFalse<IsAny<typeof NTC2018_SNOW_REFERENCES>>,
  AssertFalse<IsAny<typeof calculateNTC2018GroundSnowLoad>>,
  AssertFalse<IsAny<typeof calculateNTC2018PitchedRoofShapeCoefficient>>,
  AssertFalse<IsAny<typeof calculateNTC2018RoofSnowLoad>>,
  AssertFalse<IsAny<typeof calculateNTC2018SnowAreaLoad>>,
  AssertFalse<IsAny<typeof getNTC2018SnowExposureClassDefinition>>,
  AssertFalse<IsAny<typeof getNTC2018SnowGroundZoneDefinition>>,
];
type PublicContracts = [
  CalculateNTC2018GroundSnowLoadOptions,
  CalculateNTC2018PitchedRoofShapeCoefficientOptions,
  CalculateNTC2018RoofSnowLoadOptions,
  CalculateNTC2018SnowAreaLoadOptions,
  Ntc2018GroundSnowLoadResult,
  Ntc2018PitchedRoofShapeCoefficientResult,
  Ntc2018RoofSnowLoadResult,
  Ntc2018SnowExposureClassDefinition,
  Ntc2018SnowGroundZoneDefinition,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 snow-load exports expose strict typed contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_SNOW_EXPOSURE_CLASSES;
  void NTC2018_SNOW_GROUND_ZONES;
  void NTC2018_SNOW_REFERENCES;
  void calculateNTC2018GroundSnowLoad;
  void calculateNTC2018PitchedRoofShapeCoefficient;
  void calculateNTC2018RoofSnowLoad;
  void calculateNTC2018SnowAreaLoad;
  void getNTC2018SnowExposureClassDefinition;
  void getNTC2018SnowGroundZoneDefinition;
});
