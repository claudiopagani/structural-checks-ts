import test from "node:test";

import {
  GroundAnchorStabilityAction2D,
  GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION,
  type GroundAnchorStabilityAction2DJson,
  type GroundAnchorStabilityAction2DOptions,
} from "../dist/index.js";

const options: GroundAnchorStabilityAction2DOptions = {
  id: "anchor-α",
  head: { x: 8, z: 2 },
  bondStart: { x: 5, z: 2 },
  bondEnd: { x: 3, z: 2 },
  designTendonForce: 10,
  horizontalSpacing: 1,
  sourceVerificationStatus: "ok",
  forceModel: "fhwa-uniform-bond-proportional",
  units: { force: "kN", length: "m" },
  provenance: { source: "compile-time-β" },
};

void test("GroundAnchorStabilityAction2D exposes a strict typed consumer contract", () => {
  const action: GroundAnchorStabilityAction2D = new GroundAnchorStabilityAction2D(options);
  const serialized: GroundAnchorStabilityAction2DJson = action.toJSON();
  const evaluate: GroundAnchorStabilityAction2D["evaluateForSlipSurface"] = (candidate) =>
    action.evaluateForSlipSurface(candidate);
  if (serialized.schemaVersion !== GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION) {
    throw new Error("Unexpected ground-anchor stability action schema version.");
  }
  void evaluate;
});
