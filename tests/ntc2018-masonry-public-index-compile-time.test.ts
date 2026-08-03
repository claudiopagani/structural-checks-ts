import assert from "node:assert/strict";
import test from "node:test";

import {
  NTC2018_MASONRY_PIER_CAPACITY_REFERENCES,
  calculateNTC2018MasonryPierElasticStiffness,
  calculateNTC2018MasonryPierFlexuralCapacity,
  evaluateNTC2018MasonryPier,
} from "../dist/norms/ntc2018/masonry/index.js";
import type {
  CalculateNTC2018MasonryPierElasticStiffnessOptions,
  EvaluateNTC2018MasonryPierOptions,
  NTC2018MasonryPierCapacity,
} from "../dist/norms/ntc2018/masonry/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018_MASONRY_PIER_CAPACITY_REFERENCES>>,
  AssertFalse<IsAny<typeof calculateNTC2018MasonryPierElasticStiffness>>,
  AssertFalse<IsAny<typeof calculateNTC2018MasonryPierFlexuralCapacity>>,
  AssertFalse<IsAny<typeof evaluateNTC2018MasonryPier>>,
];
type PublicContracts = [
  CalculateNTC2018MasonryPierElasticStiffnessOptions,
  EvaluateNTC2018MasonryPierOptions,
  NTC2018MasonryPierCapacity,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 masonry public index exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const stiffnessOptions: CalculateNTC2018MasonryPierElasticStiffnessOptions = {
    elasticModulus: 1800,
    shearModulus: 600,
    length: 1.5,
    thickness: 0.3,
    deformableHeight: 3,
  };
  const evaluationOptions: EvaluateNTC2018MasonryPierOptions = {
    geometry: { length: 1.5, height: 3, thickness: 0.3 },
    material: {
      compressiveStrength: 4,
      cohesion: 0.1,
      shearStrengthLimit: 1,
      referenceShearStrength: 0.08,
      elasticModulus: 1800,
      shearModulus: 600,
    },
    actions: { axialCompression: 300, shearAxialCompression: 300 },
    options: { masonryTexture: "irregular" },
  };
  const capacity: NTC2018MasonryPierCapacity = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: 300,
    compressiveStrength: 4,
    length: 1.5,
    thickness: 0.3,
    shearSpan: 3,
  });

  assert.equal(
    calculateNTC2018MasonryPierElasticStiffness(stiffnessOptions).totalStiffness > 0,
    true,
  );
  assert.equal(evaluateNTC2018MasonryPier(evaluationOptions).complete, true);
  assert.equal(capacity.mechanism, "flexural");
  assert.equal(NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural.includes("§7.8.2.2.1"), true);
});
