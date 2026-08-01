import assert from "node:assert/strict";
import test from "node:test";

import {
  EXISTING_MATERIAL_CONFIDENCE_LEVELS,
  NTC2018_CONCRETE_CLASSES,
  NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS,
  NTC2018_REINFORCEMENT_STEEL_GRADES,
  SteelMaterial,
  characteristicValueFromExistingMean,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  normalizeExistingMaterialKnowledgeLevel,
  resolveExistingMaterialState,
} from "../dist/index.js";

const units = { force: "N", length: "mm" } as const;

function approx(actual: number | null, expected: number, tolerance = 1e-6): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(Number(actual) - expected) <= tolerance, `${actual} != ${expected}`);
}

void test("existing-material confidence data preserves Italian NTC descriptions", () => {
  assert.equal(EXISTING_MATERIAL_CONFIDENCE_LEVELS.LC1.description, "conoscenza limitata");
  assert.equal(EXISTING_MATERIAL_CONFIDENCE_LEVELS.LC2.description, "conoscenza adeguata");
  assert.equal(EXISTING_MATERIAL_CONFIDENCE_LEVELS.LC3.description, "conoscenza accurata");
  assert.equal(normalizeExistingMaterialKnowledgeLevel(2), "LC2");
  assert.equal(NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS.LC2.description, "conoscenza adeguata");
  assert.deepEqual(resolveExistingMaterialState({ existing: true, knowledgeLevel: "lc3" }), {
    existing: true,
    knowledgeLevel: "LC3",
    confidenceFactor: 1,
    knowledgeLevelDescription: "conoscenza accurata",
  });
  assert.equal(characteristicValueFromExistingMean(30, 1.2), 25);
});

void test("NTC concrete factory computes and traces fresh concrete design properties", () => {
  const material = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });

  assert.equal(material.name, "Calcestruzzo C25/30");
  assert.equal(material.category, "concrete");
  assert.equal(material.fck, 25);
  assert.equal(material.fcm, 33);
  assert.equal(material.fcd, 14.17);
  assert.equal(material.density, 2500);
  assert.equal(material.metadata.concreteType, "normal-weight");
  assert.equal(
    (material.metadata.normativeReferences as { resolutionStatus: string }[])[0]?.resolutionStatus,
    "resolved",
  );
  assert.equal(
    (material.metadata.normativeReferences as { resolutionStatus: string }[])[1]?.resolutionStatus,
    "outside-corpus",
  );
  assert.equal(NTC2018_CONCRETE_CLASSES["C25/30"].rck, 30);
});

void test("existing concrete derives characteristic strength from the assigned mean and FC", () => {
  const material = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    existing: true,
    knowledgeLevel: "LC1",
    meanCompressiveStrength: 30,
    units,
  });

  assert.equal(material.isExistingMaterial(), true);
  assert.equal(material.knowledgeLevel, "LC1");
  assert.equal(material.knowledgeLevelDescription, "conoscenza limitata");
  approx(material.confidenceFactor, 1.35);
  approx(material.fcm, 30);
  approx(material.fck, 22.22, 1e-2);
  approx(material.fcd, 12.59, 1e-2);
});

void test("NTC reinforcement presets expose design strength and deformation properties", () => {
  const b450c = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const b450a = createNTC2018ReinforcementSteelMaterial({
    grade: "B450A",
    units,
  });

  assert.equal(b450c.name, "Acciaio per c.a. B450C");
  assert.equal(b450c.fyk, 450);
  assert.equal(b450c.fyd, 391.3);
  approx(b450c.elongationCharacteristic, 0.075);
  approx(b450c.ultimateStrain, 0.0675);
  approx(b450a.elongationCharacteristic, 0.025);
  approx(b450a.ultimateStrain, 0.0225);
  assert.equal(b450c.metadata.elongationCharacteristicPermille, 75);
  assert.equal(NTC2018_REINFORCEMENT_STEEL_GRADES.B450A.ductilityClass, "A");
});

void test("material classes convert units and preserve source units through cloning", () => {
  const sourceUnits = { force: "kN", length: "m" } as const;
  const material = new SteelMaterial({
    name: "S355",
    grade: "S355",
    elasticModulus: 210_000_000,
    fyk: 355_000,
    units: sourceUnits,
  });
  const cloned = material.clone();

  assert.equal(material.elasticModulus, 210_000);
  assert.equal(material.fyk, 355);
  assert.deepEqual(material.toJSON().units, units);
  assert.deepEqual(material.metadata.sourceUnitSystem, sourceUnits);
  assert.deepEqual(cloned.toJSON(), material.toJSON());
});
