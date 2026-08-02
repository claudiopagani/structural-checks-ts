import test from "node:test";

import {
  ShallowFoundationActionState,
  ShallowFoundationModel,
  type ShallowFoundationActionStateJson,
  type ShallowFoundationActionStateOptions,
  type ShallowFoundationModelJson,
  type ShallowFoundationModelOptions,
} from "../dist/index.js";

const modelOptions: ShallowFoundationModelOptions = {
  id: "foundation-\u03B1",
  name: "Fondazione \u03B2",
  shape: "rectangular",
  geometry: { width: 2, length: 3 },
  placement: { x: 0.2, y: -0.1, baseElevation: -1.5 },
  units: { force: "kN", length: "m" },
  metadata: { label: "plinto \u03B3" },
};
const actionOptions: ShallowFoundationActionStateOptions = {
  id: "actions-\u03B4",
  basis: "total",
  resultantScope: "total-at-foundation-base",
  actions: { verticalForce: 1000, momentY: 200 },
  units: { force: "kN", length: "m" },
  metadata: { label: "azioni \u03B5" },
};

const foundation = new ShallowFoundationModel(modelOptions);
const actionState = new ShallowFoundationActionState(actionOptions);
const modelJson: ShallowFoundationModelJson = foundation.toJSON();
const actionJson: ShallowFoundationActionStateJson = actionState.toJSON();

void test("shallow-foundation model DTOs expose strict typed consumer contracts", () => {
  void modelJson;
  void actionJson;
});
