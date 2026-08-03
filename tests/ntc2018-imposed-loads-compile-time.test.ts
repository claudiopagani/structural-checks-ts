import assert from "node:assert/strict";
import test from "node:test";

import {
  NTC2018_IMPOSED_LOAD_CATALOG,
  calculateNTC2018ImposedLoadAreaReduction,
  calculateNTC2018ImposedLoadMultiStoreyReduction,
  getNTC2018ImposedLoadDefinition,
  listNTC2018ImposedLoadDefinitions,
  resolveNTC2018ImposedLoadDefinition,
  type NTC2018ImposedLoadDefinition,
  type ResolvedNTC2018ImposedLoadDefinition,
} from "../dist/index.js";

void test("NTC 2018 imposed-load APIs expose strict consumer types", () => {
  const definition: NTC2018ImposedLoadDefinition =
    getNTC2018ImposedLoadDefinition("B2-public-offices");
  const definitions: NTC2018ImposedLoadDefinition[] = listNTC2018ImposedLoadDefinitions({
    category: "B",
  });
  const resolved: ResolvedNTC2018ImposedLoadDefinition = resolveNTC2018ImposedLoadDefinition({
    definitionId: definition.id,
    units: { force: "kN", length: "m" },
  });
  const area = calculateNTC2018ImposedLoadAreaReduction({
    category: definition.category,
    influenceArea: 50,
    units: { force: "kN", length: "m" },
  });
  const storeys = calculateNTC2018ImposedLoadMultiStoreyReduction({
    category: "B",
    loadedStoreys: 5,
  });

  assert.equal(NTC2018_IMPOSED_LOAD_CATALOG.length, 21);
  assert.equal(definitions.length, 3);
  assert.equal(resolved.status, "ok");
  assert.equal(area.status, "ok");
  assert.equal(storeys.status, "ok");
});
