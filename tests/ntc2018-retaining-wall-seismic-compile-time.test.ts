import test from "node:test";

import {
  calculateNTC2018RetainingWallSeismicCoefficients,
  createNTC2018MononobeOkabeSeismicInput,
} from "../dist/index.js";
import type {
  CalculateNTC2018RetainingWallSeismicCoefficientsOptions,
  CreateNTC2018MononobeOkabeSeismicInputOptions,
  NTC2018MononobeOkabeSeismicInput,
  NTC2018RetainingWallSeismicCoefficients,
  NTC2018_RETAINING_WALL_SEISMIC_REFERENCE,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof calculateNTC2018RetainingWallSeismicCoefficients>>,
  AssertFalse<IsAny<typeof createNTC2018MononobeOkabeSeismicInput>>,
  AssertFalse<IsAny<typeof NTC2018_RETAINING_WALL_SEISMIC_REFERENCE>>,
];
type ConsumerContracts = [
  ...PublicDeclarationsAreUseful,
  CalculateNTC2018RetainingWallSeismicCoefficientsOptions,
  CreateNTC2018MononobeOkabeSeismicInputOptions,
  NTC2018MononobeOkabeSeismicInput,
  NTC2018RetainingWallSeismicCoefficients,
];

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 retaining-wall seismic adapters expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const coefficientsOptions: CalculateNTC2018RetainingWallSeismicCoefficientsOptions = {
    maximumSiteAccelerationRatio: 0.25,
    betaM: 0.38,
  };
  const inputOptions: CreateNTC2018MononobeOkabeSeismicInputOptions = {
    ...coefficientsOptions,
    verticalCase: "reduced-effective-gravity",
  };
  const coefficients: NTC2018RetainingWallSeismicCoefficients =
    calculateNTC2018RetainingWallSeismicCoefficients(coefficientsOptions);
  const input: NTC2018MononobeOkabeSeismicInput =
    createNTC2018MononobeOkabeSeismicInput(inputOptions);

  void coefficients;
  void input;
});
