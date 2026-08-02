import test from "node:test";

import {
  EN1992_RC_EXTERNAL_REFERENCES,
  EN1992_STRUT_AND_TIE_NODE_TYPES,
  EN1992_STRUT_STRENGTH_MODELS,
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
  calculateEn1992LocalBearingResistance,
  calculateEn1992NodalDesignStrength,
  calculateEn1992Punching2004WithShearReinforcement,
  calculateEn1992Punching2004WithoutShearReinforcement,
  calculateEn1992Punching2023WithShearReinforcement,
  calculateEn1992Punching2023WithoutShearReinforcement,
  calculateEn1992PunchingBeta2004,
  calculateEn1992PunchingBetaE2023,
  calculateEn1992ShrinkageCurvature,
  calculateEn1992StrutAndTieNuPrime,
  calculateEn1992StrutDesignStrength,
  calculateEn1992TieResistance,
  generateEn1992PunchingPerimeterAtOffset,
  generateEn1992PunchingPerimeters,
} from "../dist/norms/en1992/index.js";
import type {
  En1992AnchorageLength,
  En1992AnchorageLengthOptions,
  En1992DesignBondStrength,
  En1992DesignBondStrengthOptions,
  En1992LocalBearingResistance,
  En1992LocalBearingResistanceOptions,
  En1992Punching2004WithReinforcementInput,
  En1992Punching2004WithoutReinforcementInput,
  En1992Punching2023WithReinforcementInput,
  En1992Punching2023WithoutReinforcementInput,
  En1992PunchingBeta2004Input,
  En1992PunchingBetaE2023Input,
  En1992ShrinkageCurvature,
  En1992ShrinkageCurvatureOptions,
  GenerateEn1992PunchingPerimeterAtOffsetOptions,
  GenerateEn1992PunchingPerimetersOptions,
} from "../dist/norms/en1992/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof EN1992_RC_EXTERNAL_REFERENCES>>,
  AssertFalse<IsAny<typeof EN1992_STRUT_AND_TIE_NODE_TYPES>>,
  AssertFalse<IsAny<typeof EN1992_STRUT_STRENGTH_MODELS>>,
  AssertFalse<IsAny<typeof calculateEn1992AnchorageLength>>,
  AssertFalse<IsAny<typeof calculateEn1992DesignBondStrength>>,
  AssertFalse<IsAny<typeof calculateEn1992LocalBearingResistance>>,
  AssertFalse<IsAny<typeof calculateEn1992NodalDesignStrength>>,
  AssertFalse<IsAny<typeof calculateEn1992Punching2004WithShearReinforcement>>,
  AssertFalse<IsAny<typeof calculateEn1992Punching2004WithoutShearReinforcement>>,
  AssertFalse<IsAny<typeof calculateEn1992Punching2023WithShearReinforcement>>,
  AssertFalse<IsAny<typeof calculateEn1992Punching2023WithoutShearReinforcement>>,
  AssertFalse<IsAny<typeof calculateEn1992PunchingBeta2004>>,
  AssertFalse<IsAny<typeof calculateEn1992PunchingBetaE2023>>,
  AssertFalse<IsAny<typeof calculateEn1992ShrinkageCurvature>>,
  AssertFalse<IsAny<typeof calculateEn1992StrutAndTieNuPrime>>,
  AssertFalse<IsAny<typeof calculateEn1992StrutDesignStrength>>,
  AssertFalse<IsAny<typeof calculateEn1992TieResistance>>,
  AssertFalse<IsAny<typeof generateEn1992PunchingPerimeterAtOffset>>,
  AssertFalse<IsAny<typeof generateEn1992PunchingPerimeters>>,
];
type PublicContracts = [
  En1992AnchorageLength,
  En1992AnchorageLengthOptions,
  En1992DesignBondStrength,
  En1992DesignBondStrengthOptions,
  En1992LocalBearingResistance,
  En1992LocalBearingResistanceOptions,
  En1992Punching2004WithReinforcementInput,
  En1992Punching2004WithoutReinforcementInput,
  En1992Punching2023WithReinforcementInput,
  En1992Punching2023WithoutReinforcementInput,
  En1992PunchingBeta2004Input,
  En1992PunchingBetaE2023Input,
  En1992ShrinkageCurvature,
  En1992ShrinkageCurvatureOptions,
  GenerateEn1992PunchingPerimeterAtOffsetOptions,
  GenerateEn1992PunchingPerimetersOptions,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("EN 1992 public index exposes strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  void EN1992_RC_EXTERNAL_REFERENCES;
  void EN1992_STRUT_AND_TIE_NODE_TYPES;
  void EN1992_STRUT_STRENGTH_MODELS;
  void calculateEn1992AnchorageLength;
  void calculateEn1992DesignBondStrength;
  void calculateEn1992LocalBearingResistance;
  void calculateEn1992NodalDesignStrength;
  void calculateEn1992Punching2004WithShearReinforcement;
  void calculateEn1992Punching2004WithoutShearReinforcement;
  void calculateEn1992Punching2023WithShearReinforcement;
  void calculateEn1992Punching2023WithoutShearReinforcement;
  void calculateEn1992PunchingBeta2004;
  void calculateEn1992PunchingBetaE2023;
  void calculateEn1992ShrinkageCurvature;
  void calculateEn1992StrutAndTieNuPrime;
  void calculateEn1992StrutDesignStrength;
  void calculateEn1992TieResistance;
  void generateEn1992PunchingPerimeterAtOffset;
  void generateEn1992PunchingPerimeters;
});
