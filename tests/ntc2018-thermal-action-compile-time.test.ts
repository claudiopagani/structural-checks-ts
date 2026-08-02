import test from "node:test";

import {
  NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES,
  NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES,
  NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS,
  NTC2018_THERMAL_EXPANSION_COEFFICIENTS,
  NTC2018_THERMAL_REFERENCES,
  calculateNTC2018BuildingThermalActions,
  calculateNTC2018ExternalAirTemperatures,
  calculateNTC2018FreeThermalStrain,
  calculateNTC2018MeanElementTemperature,
  calculateNTC2018UniformTemperatureChange,
  getNTC2018ExternalAirTemperatureZoneDefinition,
  getNTC2018SimplifiedBuildingTemperatureChange,
  getNTC2018SolarTemperatureIncrement,
  getNTC2018ThermalExpansionCoefficientDefinition,
  resolveNTC2018InitialTemperature,
  resolveNTC2018InternalAirTemperature,
  resolveNTC2018ThermalExpansionCoefficient,
} from "../dist/index.js";
import type {
  CalculateNTC2018BuildingThermalActionsOptions,
  CalculateNTC2018ExternalAirTemperaturesOptions,
  CalculateNTC2018FreeThermalStrainOptions,
  CalculateNTC2018MeanElementTemperatureOptions,
  CalculateNTC2018UniformTemperatureChangeOptions,
  GetNTC2018SolarTemperatureIncrementOptions,
  Ntc2018ExternalAirTemperatureZoneDefinition,
  Ntc2018ExternalAirTemperaturesResult,
  Ntc2018FreeThermalStrainResult,
  Ntc2018MeanElementTemperatureResult,
  Ntc2018SimplifiedBuildingTemperatureChangeDefinition,
  Ntc2018SolarTemperatureIncrementResult,
  Ntc2018TemperatureResolution,
  Ntc2018ThermalExpansionCoefficientDefinition,
  Ntc2018UniformTemperatureChangeResult,
  ResolveNTC2018InitialTemperatureOptions,
  ResolveNTC2018InternalAirTemperatureOptions,
  ResolveNTC2018ThermalExpansionCoefficientOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES>>,
  AssertFalse<IsAny<typeof NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES>>,
  AssertFalse<IsAny<typeof NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS>>,
  AssertFalse<IsAny<typeof NTC2018_THERMAL_EXPANSION_COEFFICIENTS>>,
  AssertFalse<IsAny<typeof NTC2018_THERMAL_REFERENCES>>,
  AssertFalse<IsAny<typeof calculateNTC2018BuildingThermalActions>>,
  AssertFalse<IsAny<typeof calculateNTC2018ExternalAirTemperatures>>,
  AssertFalse<IsAny<typeof calculateNTC2018FreeThermalStrain>>,
  AssertFalse<IsAny<typeof calculateNTC2018MeanElementTemperature>>,
  AssertFalse<IsAny<typeof calculateNTC2018UniformTemperatureChange>>,
  AssertFalse<IsAny<typeof getNTC2018ExternalAirTemperatureZoneDefinition>>,
  AssertFalse<IsAny<typeof getNTC2018SimplifiedBuildingTemperatureChange>>,
  AssertFalse<IsAny<typeof getNTC2018SolarTemperatureIncrement>>,
  AssertFalse<IsAny<typeof getNTC2018ThermalExpansionCoefficientDefinition>>,
  AssertFalse<IsAny<typeof resolveNTC2018InitialTemperature>>,
  AssertFalse<IsAny<typeof resolveNTC2018InternalAirTemperature>>,
  AssertFalse<IsAny<typeof resolveNTC2018ThermalExpansionCoefficient>>,
];
type PublicContracts = [
  CalculateNTC2018BuildingThermalActionsOptions,
  CalculateNTC2018ExternalAirTemperaturesOptions,
  CalculateNTC2018FreeThermalStrainOptions,
  CalculateNTC2018MeanElementTemperatureOptions,
  CalculateNTC2018UniformTemperatureChangeOptions,
  GetNTC2018SolarTemperatureIncrementOptions,
  Ntc2018ExternalAirTemperatureZoneDefinition,
  Ntc2018ExternalAirTemperaturesResult,
  Ntc2018FreeThermalStrainResult,
  Ntc2018MeanElementTemperatureResult,
  Ntc2018SimplifiedBuildingTemperatureChangeDefinition,
  Ntc2018SolarTemperatureIncrementResult,
  Ntc2018TemperatureResolution,
  Ntc2018ThermalExpansionCoefficientDefinition,
  Ntc2018UniformTemperatureChangeResult,
  ResolveNTC2018InitialTemperatureOptions,
  ResolveNTC2018InternalAirTemperatureOptions,
  ResolveNTC2018ThermalExpansionCoefficientOptions,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 thermal-action exports expose strict typed contracts", () => {
  useConsumerContracts(undefined);
  void NTC2018_EXTERNAL_AIR_TEMPERATURE_ZONES;
  void NTC2018_SIMPLIFIED_BUILDING_TEMPERATURE_CHANGES;
  void NTC2018_SUMMER_SOLAR_TEMPERATURE_INCREMENTS;
  void NTC2018_THERMAL_EXPANSION_COEFFICIENTS;
  void NTC2018_THERMAL_REFERENCES;
  void calculateNTC2018BuildingThermalActions;
  void calculateNTC2018ExternalAirTemperatures;
  void calculateNTC2018FreeThermalStrain;
  void calculateNTC2018MeanElementTemperature;
  void calculateNTC2018UniformTemperatureChange;
  void getNTC2018ExternalAirTemperatureZoneDefinition;
  void getNTC2018SimplifiedBuildingTemperatureChange;
  void getNTC2018SolarTemperatureIncrement;
  void getNTC2018ThermalExpansionCoefficientDefinition;
  void resolveNTC2018InitialTemperature;
  void resolveNTC2018InternalAirTemperature;
  void resolveNTC2018ThermalExpansionCoefficient;
});
