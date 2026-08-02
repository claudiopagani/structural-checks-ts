import test from "node:test";

import {
  NTC2018_WIND_EXPOSURE_CATEGORIES,
  NTC2018_WIND_REFERENCES,
  NTC2018_WIND_ZONES,
  calculateNTC2018BaseWindSpeed,
  calculateNTC2018ReferenceWindPressure,
  calculateNTC2018ReferenceWindSpeed,
  calculateNTC2018WindAreaLoad,
  calculateNTC2018WindExposureCoefficient,
  calculateNTC2018WindPressure,
  calculateNTC2018WindReturnCoefficient,
  getNTC2018WindExposureCategoryDefinition,
  getNTC2018WindZoneDefinition,
} from "../dist/index.js";
import type {
  CalculateNTC2018BaseWindSpeedOptions,
  CalculateNTC2018ReferenceWindPressureOptions,
  CalculateNTC2018ReferenceWindSpeedOptions,
  CalculateNTC2018WindAreaLoadOptions,
  CalculateNTC2018WindExposureCoefficientOptions,
  CalculateNTC2018WindPressureOptions,
  CalculateNTC2018WindReturnCoefficientOptions,
  Ntc2018BaseWindSpeedResult,
  Ntc2018ReferenceWindPressureResult,
  Ntc2018ReferenceWindSpeedResult,
  Ntc2018WindExposureCategoryDefinition,
  Ntc2018WindExposureCoefficientResult,
  Ntc2018WindPressureResult,
  Ntc2018WindReturnCoefficientResult,
  Ntc2018WindZoneDefinition,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_WIND_EXPOSURE_CATEGORIES>>,
  AssertFalse<IsAny<typeof NTC2018_WIND_REFERENCES>>,
  AssertFalse<IsAny<typeof NTC2018_WIND_ZONES>>,
  AssertFalse<IsAny<typeof calculateNTC2018BaseWindSpeed>>,
  AssertFalse<IsAny<typeof calculateNTC2018ReferenceWindPressure>>,
  AssertFalse<IsAny<typeof calculateNTC2018ReferenceWindSpeed>>,
  AssertFalse<IsAny<typeof calculateNTC2018WindAreaLoad>>,
  AssertFalse<IsAny<typeof calculateNTC2018WindExposureCoefficient>>,
  AssertFalse<IsAny<typeof calculateNTC2018WindPressure>>,
  AssertFalse<IsAny<typeof calculateNTC2018WindReturnCoefficient>>,
  AssertFalse<IsAny<typeof getNTC2018WindExposureCategoryDefinition>>,
  AssertFalse<IsAny<typeof getNTC2018WindZoneDefinition>>,
];
type PublicContracts = [
  CalculateNTC2018BaseWindSpeedOptions,
  CalculateNTC2018ReferenceWindPressureOptions,
  CalculateNTC2018ReferenceWindSpeedOptions,
  CalculateNTC2018WindAreaLoadOptions,
  CalculateNTC2018WindExposureCoefficientOptions,
  CalculateNTC2018WindPressureOptions,
  CalculateNTC2018WindReturnCoefficientOptions,
  Ntc2018BaseWindSpeedResult,
  Ntc2018ReferenceWindPressureResult,
  Ntc2018ReferenceWindSpeedResult,
  Ntc2018WindExposureCategoryDefinition,
  Ntc2018WindExposureCoefficientResult,
  Ntc2018WindPressureResult,
  Ntc2018WindReturnCoefficientResult,
  Ntc2018WindZoneDefinition,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 wind-load exports expose strict typed contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_WIND_EXPOSURE_CATEGORIES;
  void NTC2018_WIND_REFERENCES;
  void NTC2018_WIND_ZONES;
  void calculateNTC2018BaseWindSpeed;
  void calculateNTC2018ReferenceWindPressure;
  void calculateNTC2018ReferenceWindSpeed;
  void calculateNTC2018WindAreaLoad;
  void calculateNTC2018WindExposureCoefficient;
  void calculateNTC2018WindPressure;
  void calculateNTC2018WindReturnCoefficient;
  void getNTC2018WindExposureCategoryDefinition;
  void getNTC2018WindZoneDefinition;
});
