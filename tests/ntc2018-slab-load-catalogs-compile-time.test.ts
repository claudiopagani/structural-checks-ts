import assert from "node:assert/strict";
import test from "node:test";

import {
  NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE,
  NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE,
  SLAB_MATERIAL_WEIGHT_PRESET_DATABASE,
  SLAB_MATERIAL_WEIGHT_PRESET_METADATA,
  createNTC2018SlabVariableLoad,
  getNTC2018SlabVariableAction,
  getNTC2018SlabWeightValue,
  getSlabMaterialWeightPresetValue,
  listNTC2018SlabWeightCategories,
  listNTC2018SlabWeightEntries,
  listSlabMaterialWeightPresetCategories,
  listSlabMaterialWeightPresetEntries,
  type CreateNTC2018SlabVariableLoadOptions,
  type GetSlabMaterialWeightPresetValueOptions,
  type NTC2018SlabVariableAction,
  type SlabMaterialWeightPresetDatabase,
  type SlabMaterialWeightPresetEntry,
  type VariableLoadDocumentation,
} from "../dist/index.js";

void test("NTC 2018 slab catalog APIs expose strict consumer types", () => {
  const database: SlabMaterialWeightPresetDatabase = SLAB_MATERIAL_WEIGHT_PRESET_DATABASE;
  const categories: string[] = listSlabMaterialWeightPresetCategories("surfaceWeights");
  const entries: SlabMaterialWeightPresetEntry[] = listSlabMaterialWeightPresetEntries(
    "lineWeights",
    "IPE",
  );
  const valueOptions: GetSlabMaterialWeightPresetValueOptions = {
    weightType: "lineWeights",
    category: "IPE",
    description: "IPE 300",
  };
  const documentation: VariableLoadDocumentation = { reference: "legacy catalog" };
  const factoryOptions: CreateNTC2018SlabVariableLoadOptions = {
    actionId: 4,
    documentation,
    units: { force: "kN", length: "m" },
  };
  const action: NTC2018SlabVariableAction = getNTC2018SlabVariableAction(4);
  const load = createNTC2018SlabVariableLoad(factoryOptions);

  assert.equal(database, NTC2018_SLAB_MATERIAL_WEIGHT_DATABASE);
  assert.equal(database.volumeWeights.length > 0, true);
  assert.equal(categories.includes("Roofing"), true);
  assert.equal(entries[10]?.value, 0.415);
  assert.equal(getSlabMaterialWeightPresetValue(valueOptions), 0.415);
  assert.equal(getNTC2018SlabWeightValue(valueOptions), 0.415);
  assert.equal(listSlabMaterialWeightPresetCategories("surfaceWeights").includes("Roofing"), true);
  assert.equal(listNTC2018SlabWeightCategories("surfaceWeights").includes("Roofing"), true);
  assert.equal(listNTC2018SlabWeightEntries("lineWeights", "IPE").length, 14);
  assert.equal(NTC2018_SLAB_VARIABLE_ACTIONS_DATABASE.length, 18);
  assert.equal(action.category, "B");
  assert.equal(load.value, 3);
  assert.equal(SLAB_MATERIAL_WEIGHT_PRESET_METADATA.normative, false);
});
