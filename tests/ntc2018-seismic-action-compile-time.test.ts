import test from "node:test";

import {
  NTC2018_SEISMIC_LIMIT_STATES,
  NTC2018_SEISMIC_REFERENCES,
  NTC2018_SITE_HAZARD_SOURCE_KINDS,
  NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS,
  NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA,
  calculateNTC2018HorizontalElasticSpectrum,
  calculateNTC2018HorizontalSpectrumParameters,
  calculateNTC2018StratigraphicSpectrumCoefficients,
  getNTC2018SeismicLimitStateDefinition,
  getNTC2018SubsoilSpectrumCoefficientDefinition,
  getNTC2018TopographicAmplificationDefinition,
  normalizeNTC2018SiteHazardParameters,
  resolveNTC2018TopographicAmplification,
} from "../dist/index.js";
import type {
  Ntc2018HorizontalElasticSpectrumOptions,
  Ntc2018HorizontalSpectrumParametersOptions,
  Ntc2018SiteHazardParameters,
  Ntc2018SiteHazardParametersInput,
  Ntc2018StratigraphicSpectrumOptions,
  Ntc2018TopographicAmplificationOptions,
} from "../dist/norms/ntc2018/actions/ntc2018SeismicAction.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_SEISMIC_LIMIT_STATES>>,
  AssertFalse<IsAny<typeof NTC2018_SEISMIC_REFERENCES>>,
  AssertFalse<IsAny<typeof NTC2018_SITE_HAZARD_SOURCE_KINDS>>,
  AssertFalse<IsAny<typeof NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS>>,
  AssertFalse<IsAny<typeof NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA>>,
  AssertFalse<IsAny<typeof calculateNTC2018HorizontalElasticSpectrum>>,
  AssertFalse<IsAny<typeof calculateNTC2018HorizontalSpectrumParameters>>,
  AssertFalse<IsAny<typeof calculateNTC2018StratigraphicSpectrumCoefficients>>,
  AssertFalse<IsAny<typeof getNTC2018SeismicLimitStateDefinition>>,
  AssertFalse<IsAny<typeof getNTC2018SubsoilSpectrumCoefficientDefinition>>,
  AssertFalse<IsAny<typeof getNTC2018TopographicAmplificationDefinition>>,
  AssertFalse<IsAny<typeof normalizeNTC2018SiteHazardParameters>>,
  AssertFalse<IsAny<typeof resolveNTC2018TopographicAmplification>>,
];
type PublicContracts = [
  Ntc2018HorizontalElasticSpectrumOptions,
  Ntc2018HorizontalSpectrumParametersOptions,
  Ntc2018SiteHazardParameters,
  Ntc2018SiteHazardParametersInput,
  Ntc2018StratigraphicSpectrumOptions,
  Ntc2018TopographicAmplificationOptions,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 seismic action exports expose strict typed contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_SEISMIC_LIMIT_STATES;
  void NTC2018_SEISMIC_REFERENCES;
  void NTC2018_SITE_HAZARD_SOURCE_KINDS;
  void NTC2018_SUBSOIL_SPECTRUM_COEFFICIENTS;
  void NTC2018_TOPOGRAPHIC_AMPLIFICATION_MAXIMA;
  void calculateNTC2018HorizontalElasticSpectrum;
  void calculateNTC2018HorizontalSpectrumParameters;
  void calculateNTC2018StratigraphicSpectrumCoefficients;
  void getNTC2018SeismicLimitStateDefinition;
  void getNTC2018SubsoilSpectrumCoefficientDefinition;
  void getNTC2018TopographicAmplificationDefinition;
  void normalizeNTC2018SiteHazardParameters;
  void resolveNTC2018TopographicAmplification;
});
