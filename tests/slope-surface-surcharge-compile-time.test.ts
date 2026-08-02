import test from "node:test";

import {
  SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION,
  SlopeSurfaceSurcharge2D,
  type SlopeSurfaceSurcharge2DJson,
  type SlopeSurfaceSurcharge2DOptions,
} from "../dist/index.js";

const options: SlopeSurfaceSurcharge2DOptions = {
  id: "surcharge-α",
  intensity: 0.02,
  minimumX: 0,
  maximumX: 5000,
  units: { force: "N", length: "mm" },
  metadata: { label: "carico β" },
};

void test("SlopeSurfaceSurcharge2D exposes a strict typed consumer contract", () => {
  const surcharge: SlopeSurfaceSurcharge2D = new SlopeSurfaceSurcharge2D(options);
  const serialized: SlopeSurfaceSurcharge2DJson = surcharge.toJSON();
  const force = surcharge.forcePerUnitWidthBetween(0, 10);
  if (serialized.schemaVersion !== SLOPE_SURFACE_SURCHARGE_2D_SCHEMA_VERSION) {
    throw new Error("Unexpected surcharge schema version.");
  }
  void force;
});
