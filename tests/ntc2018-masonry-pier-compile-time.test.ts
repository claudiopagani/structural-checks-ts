import assert from "node:assert/strict";
import test from "node:test";

import {
  NTC2018_MASONRY_PIER_CAPACITY_REFERENCES,
  calculateNTC2018MasonryPierElasticStiffness,
  calculateNTC2018MasonryPierFlexuralCapacity,
  calculateNTC2018MasonryPierIrregularDiagonalCapacity,
  calculateNTC2018MasonryPierRegularDiagonalCapacity,
  calculateNTC2018MasonryPierSlidingCapacity,
  calculateNTC2018MasonryPierUltimateDisplacement,
  evaluateNTC2018MasonryPier,
  selectNTC2018MasonryPierGoverningCapacity,
  type CalculateNTC2018MasonryPierElasticStiffnessOptions,
  type CalculateNTC2018MasonryPierUltimateDisplacementOptions,
  type EvaluateNTC2018MasonryPierOptions,
  type NTC2018MasonryPierCapacity,
  type NTC2018MasonryPierElasticStiffness,
  type NTC2018MasonryPierEvaluation,
  type NTC2018MasonryPierUltimateDisplacement,
} from "../dist/index.js";

void test("NTC 2018 masonry-pier APIs expose strict consumer types", () => {
  const flexural = calculateNTC2018MasonryPierFlexuralCapacity({
    axialCompression: 300,
    compressiveStrength: 4,
    length: 1.5,
    thickness: 0.3,
    shearSpan: 3,
  });
  const sliding = calculateNTC2018MasonryPierSlidingCapacity({
    axialCompression: 300,
    cohesion: 0.1,
    shearStrengthLimit: 1,
    length: 1.5,
    thickness: 0.3,
    shearSpan: 3,
  });
  const irregular = calculateNTC2018MasonryPierIrregularDiagonalCapacity({
    axialCompression: 300,
    referenceShearStrength: 0.08,
    length: 1.5,
    thickness: 0.3,
    height: 3,
  });
  const regular = calculateNTC2018MasonryPierRegularDiagonalCapacity({
    axialCompression: 300,
    cohesion: 0.1,
    interlockingCoefficient: 0.5,
    blockTensileStrength: 1,
    length: 1.5,
    thickness: 0.3,
    height: 3,
  });
  const capacities: NTC2018MasonryPierCapacity[] = [flexural, sliding, irregular, regular];
  const governing = selectNTC2018MasonryPierGoverningCapacity(capacities);
  const stiffnessOptions: CalculateNTC2018MasonryPierElasticStiffnessOptions = {
    elasticModulus: 1800,
    shearModulus: 600,
    length: 1.5,
    thickness: 0.3,
    deformableHeight: 3,
  };
  const stiffness: NTC2018MasonryPierElasticStiffness =
    calculateNTC2018MasonryPierElasticStiffness(stiffnessOptions);
  const displacementOptions: CalculateNTC2018MasonryPierUltimateDisplacementOptions = {
    height: 3,
    mechanism: "flexural",
  };
  const displacement: NTC2018MasonryPierUltimateDisplacement =
    calculateNTC2018MasonryPierUltimateDisplacement(displacementOptions);
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
    actions: { axialCompression: 300 },
  };
  const evaluation: NTC2018MasonryPierEvaluation = evaluateNTC2018MasonryPier(evaluationOptions);

  assert.equal(NTC2018_MASONRY_PIER_CAPACITY_REFERENCES.flexural.includes("§7.8.2.2.1"), true);
  assert.equal(governing?.available, true);
  assert.equal(stiffness.totalStiffness > 0, true);
  assert.equal(displacement.ultimateDisplacement, 0.03);
  assert.equal(evaluation.complete, true);
});
