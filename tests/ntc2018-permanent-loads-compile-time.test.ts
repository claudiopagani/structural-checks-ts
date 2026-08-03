import assert from "node:assert/strict";
import test from "node:test";

import {
  CalculationResult,
  NTC2018_UNIT_WEIGHT_CATALOG,
  calculateNTC2018AreaSelfWeight,
  calculateNTC2018EquivalentPartitionAreaLoad,
  calculateNTC2018LineSelfWeight,
  calculateNTC2018PermanentAreaLoads,
  calculateNTC2018SelfWeight,
  getNTC2018UnitWeightDefinition,
  listNTC2018UnitWeightDefinitions,
  resolveNTC2018UnitWeight,
  type NTC2018EquivalentPartitionAreaLoadResult,
  type NTC2018LineSelfWeightResult,
  type NTC2018PermanentAreaLoadResult,
  type NTC2018SelfWeightCalculation,
  type NTC2018UnitWeightDefinition,
  type ResolvedNTC2018UnitWeight,
} from "../dist/index.js";

void test("NTC 2018 permanent-load APIs expose strict consumer types", () => {
  const definition: NTC2018UnitWeightDefinition = getNTC2018UnitWeightDefinition("steel");
  const definitions: NTC2018UnitWeightDefinition[] = listNTC2018UnitWeightDefinitions({
    category: "metals",
  });
  const resolved: ResolvedNTC2018UnitWeight = resolveNTC2018UnitWeight({
    materialId: "lightweight-concrete",
    value: 18,
  });
  const area: NTC2018SelfWeightCalculation = calculateNTC2018AreaSelfWeight({
    unitWeight: 25,
    thickness: 0.2,
    units: { force: "kN", length: "m" },
  });
  const line: NTC2018LineSelfWeightResult = calculateNTC2018LineSelfWeight({
    unitWeight: 78.5,
    crossSectionArea: 0.01,
    units: { force: "kN", length: "m" },
  });
  const volume: NTC2018SelfWeightCalculation = calculateNTC2018SelfWeight({
    unitWeight: 24,
    volume: 0.75,
    units: { force: "kN", length: "m" },
  });
  const partitions: NTC2018EquivalentPartitionAreaLoadResult =
    calculateNTC2018EquivalentPartitionAreaLoad({
      partitionLineLoad: 2,
      units: { force: "kN", length: "m" },
    });
  const permanent: NTC2018PermanentAreaLoadResult = calculateNTC2018PermanentAreaLoads({
    units: { force: "kN", length: "m" },
    items: [
      {
        id: "slab",
        model: "layer",
        permanentClass: "G1",
        unitWeight: 25,
        thickness: 0.2,
      },
    ],
  });

  assert.equal(NTC2018_UNIT_WEIGHT_CATALOG.length, 24);
  assert.equal(definition.id, "steel");
  assert.equal(definitions.length, 3);
  assert.equal(resolved.selection, "explicit-within-tabulated-range");
  assert.equal(area.quantity, "area-load");
  assert.equal(line.quantity, "line-load");
  assert.equal(volume.quantity, "force");
  assert.equal(partitions.areaLoad, 0.8);
  assert.equal(permanent instanceof CalculationResult, true);
});
