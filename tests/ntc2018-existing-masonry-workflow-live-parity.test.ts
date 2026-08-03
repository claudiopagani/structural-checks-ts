import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  applyNTC2018ExistingMasonryMaltaBuonaUpdate,
  applyNTC2018ExistingMasonryModifierToggle,
  createNTC2018ExistingMasonryModifierState,
  createNTC2018ExistingMasonryWorkflowState,
  createNTC2018ExistingMasonryMaterial,
  evaluateNTC2018ExistingMasonryWorkflow,
  getNTC2018ExistingMasonryModifierDefinition,
  modifierSelectionsFromState,
  selectNTC2018ExistingMasonryParameterLevel,
  selectNTC2018ExistingMasonryTypology,
  toggleNTC2018ExistingMasonryModifier,
  updateNTC2018ExistingMasonryMaltaBuona,
  NTC2018ExistingMasonryMaterial,
} from "../dist/index.js";
import type {
  Ntc2018ExistingMasonryModifierState,
  Ntc2018ExistingMasonryWorkflowRequest,
} from "../dist/index.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceWorkflowPath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "materials",
  "ntc2018ExistingMasonryWorkflow.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceWorkflow = (await import(pathToFileURL(sourceWorkflowPath).href)) as unknown as {
  applyNTC2018ExistingMasonryMaltaBuonaUpdate: typeof applyNTC2018ExistingMasonryMaltaBuonaUpdate;
  applyNTC2018ExistingMasonryModifierToggle: typeof applyNTC2018ExistingMasonryModifierToggle;
  createNTC2018ExistingMasonryModifierState: typeof createNTC2018ExistingMasonryModifierState;
  createNTC2018ExistingMasonryWorkflowState: typeof createNTC2018ExistingMasonryWorkflowState;
  evaluateNTC2018ExistingMasonryWorkflow: typeof evaluateNTC2018ExistingMasonryWorkflow;
  getNTC2018ExistingMasonryModifierDefinition: typeof getNTC2018ExistingMasonryModifierDefinition;
  modifierSelectionsFromState: typeof modifierSelectionsFromState;
  selectNTC2018ExistingMasonryParameterLevel: typeof selectNTC2018ExistingMasonryParameterLevel;
  selectNTC2018ExistingMasonryTypology: typeof selectNTC2018ExistingMasonryTypology;
  toggleNTC2018ExistingMasonryModifier: typeof toggleNTC2018ExistingMasonryModifier;
  updateNTC2018ExistingMasonryMaltaBuona: typeof updateNTC2018ExistingMasonryMaltaBuona;
};
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as unknown as {
  createNTC2018ExistingMasonryMaterial: typeof createNTC2018ExistingMasonryMaterial;
  NTC2018ExistingMasonryMaterial: typeof NTC2018ExistingMasonryMaterial;
};

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function codePoints(value: string): number[] {
  return [...value].map((character) => character.codePointAt(0) ?? -1);
}

function assertExactParity(target: unknown, source: unknown): void {
  assert.deepEqual(target, source);
  assert.equal(JSON.stringify(target), JSON.stringify(source));
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }

  throw new Error("Expected the callback to throw.");
}

function workflowRequest(
  coefficienti: Ntc2018ExistingMasonryModifierState[],
): Ntc2018ExistingMasonryWorkflowRequest {
  return {
    tipologiaIndex: 1,
    livelloDiConfidenza: 2,
    coefficienti,
    units: { force: "N", length: "mm" },
  };
}

function assertModifierStateParity(
  targetState: Ntc2018ExistingMasonryModifierState[],
  sourceState: Ntc2018ExistingMasonryModifierState[],
): void {
  assertExactParity(targetState, sourceState);
  assert.deepEqual(codePoints(targetState[0]?.text ?? ""), codePoints(sourceState[0]?.text ?? ""));
}

void test("NTC 2018 existing-masonry workflow matches the pinned live implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const targetModule = {
    applyNTC2018ExistingMasonryMaltaBuonaUpdate,
    applyNTC2018ExistingMasonryModifierToggle,
    createNTC2018ExistingMasonryModifierState,
    createNTC2018ExistingMasonryWorkflowState,
    evaluateNTC2018ExistingMasonryWorkflow,
    getNTC2018ExistingMasonryModifierDefinition,
    modifierSelectionsFromState,
    selectNTC2018ExistingMasonryParameterLevel,
    selectNTC2018ExistingMasonryTypology,
    toggleNTC2018ExistingMasonryModifier,
    updateNTC2018ExistingMasonryMaltaBuona,
  };
  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceWorkflow).sort());

  for (const typologyId of [1, 2, 8]) {
    const targetState = createNTC2018ExistingMasonryModifierState(typologyId, {
      maltaBuona: { selected: true, value: 1.5 },
      iniezioniMisceleLeganti: { selected: true, value: 2 },
    });
    const sourceState = sourceWorkflow.createNTC2018ExistingMasonryModifierState(typologyId, {
      maltaBuona: { selected: true, value: 1.5 },
      iniezioniMisceleLeganti: { selected: true, value: 2 },
    });
    assertModifierStateParity(targetState, sourceState);
  }

  const targetInitial = createNTC2018ExistingMasonryWorkflowState();
  const sourceInitial = sourceWorkflow.createNTC2018ExistingMasonryWorkflowState();
  assertExactParity(targetInitial, sourceInitial);

  const targetToggled = applyNTC2018ExistingMasonryModifierToggle(targetInitial, 5);
  const sourceToggled = sourceWorkflow.applyNTC2018ExistingMasonryModifierToggle(sourceInitial, 5);
  assertExactParity(targetToggled, sourceToggled);
  assertExactParity(
    applyNTC2018ExistingMasonryModifierToggle(targetToggled, 5),
    sourceWorkflow.applyNTC2018ExistingMasonryModifierToggle(sourceToggled, 5),
  );
  assertExactParity(
    toggleNTC2018ExistingMasonryModifier(targetInitial.coefficienti, 99),
    sourceWorkflow.toggleNTC2018ExistingMasonryModifier(sourceInitial.coefficienti, 99),
  );

  assertExactParity(
    updateNTC2018ExistingMasonryMaltaBuona(targetInitial.coefficienti, 5),
    sourceWorkflow.updateNTC2018ExistingMasonryMaltaBuona(sourceInitial.coefficienti, 5),
  );
  assertExactParity(
    applyNTC2018ExistingMasonryMaltaBuonaUpdate(targetInitial, 5),
    sourceWorkflow.applyNTC2018ExistingMasonryMaltaBuonaUpdate(sourceInitial, 5),
  );
  assertExactParity(
    selectNTC2018ExistingMasonryTypology(targetInitial, 3),
    sourceWorkflow.selectNTC2018ExistingMasonryTypology(sourceInitial, 3),
  );
  assertExactParity(
    selectNTC2018ExistingMasonryParameterLevel(targetInitial, 2),
    sourceWorkflow.selectNTC2018ExistingMasonryParameterLevel(sourceInitial, 2),
  );
  assertExactParity(
    modifierSelectionsFromState(targetToggled.coefficienti),
    sourceWorkflow.modifierSelectionsFromState(sourceToggled.coefficienti),
  );
  assertExactParity(
    getNTC2018ExistingMasonryModifierDefinition(1),
    sourceWorkflow.getNTC2018ExistingMasonryModifierDefinition(1),
  );
  assert.equal(
    getNTC2018ExistingMasonryModifierDefinition(99),
    sourceWorkflow.getNTC2018ExistingMasonryModifierDefinition(99),
  );

  const targetResponse = await evaluateNTC2018ExistingMasonryWorkflow(
    workflowRequest([
      {
        id: 1,
        key: "maltaBuona",
        text: "",
        type: "",
        enabled: true,
        checked: true,
        value: 1.5,
        toDisable: [],
        toUncheck: [],
      },
      {
        id: 4,
        key: "iniezioniMisceleLeganti",
        text: "",
        type: "",
        enabled: true,
        checked: true,
        value: 2,
        toDisable: [],
        toUncheck: [],
      },
    ]),
  );
  const sourceResponse = await sourceWorkflow.evaluateNTC2018ExistingMasonryWorkflow(
    workflowRequest([
      {
        id: 1,
        key: "maltaBuona",
        text: "",
        type: "",
        enabled: true,
        checked: true,
        value: 1.5,
        toDisable: [],
        toUncheck: [],
      },
      {
        id: 4,
        key: "iniezioniMisceleLeganti",
        text: "",
        type: "",
        enabled: true,
        checked: true,
        value: 2,
        toDisable: [],
        toUncheck: [],
      },
    ]),
  );
  assertExactParity(targetResponse, sourceResponse);

  const targetFactoryMaterial = createNTC2018ExistingMasonryMaterial({
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    parameterLevel: 2,
    units: { force: "N", length: "mm" },
    modifierSelections: { maltaBuona: { selected: true, value: 1.5 } },
  });
  const sourceFactoryMaterial = sourceIndex.createNTC2018ExistingMasonryMaterial({
    masonryTypologyId: 1,
    knowledgeLevel: "LC2",
    parameterLevel: 2,
    units: { force: "N", length: "mm" },
    modifierSelections: { maltaBuona: { selected: true, value: 1.5 } },
  });
  assertExactParity(targetFactoryMaterial.toJSON(), sourceFactoryMaterial.toJSON());
  assert.equal(targetFactoryMaterial.constructor.name, sourceFactoryMaterial.constructor.name);
  assert.equal(targetFactoryMaterial instanceof NTC2018ExistingMasonryMaterial, true);
  assert.equal(typeof sourceIndex.NTC2018ExistingMasonryMaterial, "function");

  const errorCases = [
    () => createNTC2018ExistingMasonryModifierState(99),
    () =>
      createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 1,
        units: null,
      }),
    () =>
      createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 1,
        knowledgeLevel: "LC9",
        units: { force: "N", length: "mm" },
      }),
  ];
  const sourceErrorCases = [
    () => sourceWorkflow.createNTC2018ExistingMasonryModifierState(99),
    () =>
      sourceIndex.createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 1,
        units: null,
      }),
    () =>
      sourceIndex.createNTC2018ExistingMasonryMaterial({
        masonryTypologyId: 1,
        knowledgeLevel: "LC9",
        units: { force: "N", length: "mm" },
      }),
  ];
  for (let index = 0; index < errorCases.length; index += 1) {
    const targetErrorCase = errorCases[index];
    const sourceErrorCase = sourceErrorCases[index];
    assert.ok(targetErrorCase);
    assert.ok(sourceErrorCase);
    assert.deepEqual(errorSignature(targetErrorCase), errorSignature(sourceErrorCase));
  }
});
