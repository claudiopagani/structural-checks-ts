/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises */
// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";

import {
  GLOBAL_FEM_CONTRACT_VERSION,
  createFemCapabilitiesContract,
  validateFemCapabilitiesContract,
  validateGlobalFemModelContract,
} from "../dist/index.js";
import { createGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixture.ts";

test("slice 0028 validates the shared FEM capability and model contracts", () => {
  const fixture = createGlobalFemBuildingFixture();
  const capabilities = validateFemCapabilitiesContract(fixture.capabilities);
  const model = validateGlobalFemModelContract(fixture.model);

  assert.equal(capabilities.ok, true, JSON.stringify(capabilities.errors));
  assert.equal(model.ok, true, JSON.stringify(model.errors));
  assert.equal(capabilities.value.version, GLOBAL_FEM_CONTRACT_VERSION);
  assert.equal(
    createFemCapabilitiesContract(fixture.capabilities).schema,
    "strutture-js/fem-capabilities",
  );
});

test("slice 0028 rejects incomplete units and duplicate model identifiers", () => {
  const fixture = createGlobalFemBuildingFixture();
  delete fixture.model.units.mass;
  const missingUnit = validateGlobalFemModelContract(fixture.model);
  assert.equal(missingUnit.ok, false);
  assert.ok(missingUnit.errors.some((item) => item.code === "FEM_UNIT_MISSING_OR_AMBIGUOUS"));

  const duplicate = createGlobalFemBuildingFixture();
  duplicate.model.nodes.push(JSON.parse(JSON.stringify(duplicate.model.nodes[0])));
  const duplicateValidation = validateGlobalFemModelContract(duplicate.model);
  assert.equal(duplicateValidation.ok, false);
  assert.ok(duplicateValidation.errors.some((item) => item.code === "FEM_DUPLICATE_ID"));
});
