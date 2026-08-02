import test from "node:test";

import {
  CyclicMasonryCompressionMaterial,
  CyclicMasonryShearMaterial,
  MohrCoulombModel,
  SlidingStrengthModel,
  TurnsekSheppardModel,
  createMasonryShearStrengthModel,
} from "../dist/index.js";
import type {
  CyclicMasonryCompressionConfiguration,
  CyclicMasonryCompressionMaterialJson,
  CyclicMasonryCompressionMaterialOptions,
  CyclicMasonryCompressionState,
  CyclicMasonryShearConfiguration,
  CyclicMasonryShearContext,
  CyclicMasonryShearDegradation,
  CyclicMasonryShearMaterialJson,
  CyclicMasonryShearMaterialOptions,
  CyclicMasonryShearPinching,
  CyclicMasonryShearState,
  MasonryShearStrengthContext,
  MasonryShearStrengthEvaluation,
  MasonryShearStrengthModel,
  MasonryShearStrengthModelInput,
  MohrCoulombModelInput,
  MohrCoulombModelJson,
  SlidingStrengthModelInput,
  SlidingStrengthModelJson,
  TurnsekSheppardModelInput,
  TurnsekSheppardModelJson,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof CyclicMasonryCompressionMaterial>>,
  AssertFalse<IsAny<typeof CyclicMasonryShearMaterial>>,
  AssertFalse<IsAny<typeof MohrCoulombModel>>,
  AssertFalse<IsAny<typeof SlidingStrengthModel>>,
  AssertFalse<IsAny<typeof TurnsekSheppardModel>>,
  AssertFalse<IsAny<typeof createMasonryShearStrengthModel>>,
];

type PublicContracts = [
  CyclicMasonryCompressionConfiguration,
  CyclicMasonryCompressionMaterialJson,
  CyclicMasonryCompressionMaterialOptions,
  CyclicMasonryCompressionState,
  CyclicMasonryShearConfiguration,
  CyclicMasonryShearContext,
  CyclicMasonryShearDegradation,
  CyclicMasonryShearMaterialJson,
  CyclicMasonryShearMaterialOptions,
  CyclicMasonryShearPinching,
  CyclicMasonryShearState,
  MasonryShearStrengthContext,
  MasonryShearStrengthEvaluation,
  MasonryShearStrengthModel,
  MasonryShearStrengthModelInput,
  MohrCoulombModelInput,
  MohrCoulombModelJson,
  SlidingStrengthModelInput,
  SlidingStrengthModelJson,
  TurnsekSheppardModelInput,
  TurnsekSheppardModelJson,
];

type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

const publicConstructors = [
  CyclicMasonryCompressionMaterial,
  CyclicMasonryShearMaterial,
  MohrCoulombModel,
  SlidingStrengthModel,
  TurnsekSheppardModel,
];

void test("masonry material indexes expose strict typed consumer contracts", () => {
  void publicConstructors;
  useConsumerContracts(undefined);
  void createMasonryShearStrengthModel;
});
