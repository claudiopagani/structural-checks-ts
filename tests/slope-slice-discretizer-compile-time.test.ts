import test from "node:test";

import {
  SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION,
  SlopeSliceDiscretizer2D,
  type SlopeSliceDiscretizeOptions,
  type SlopeSliceDiscretizationJson,
} from "../dist/index.js";

const options: SlopeSliceDiscretizeOptions = {
  sectionId: null,
  porePressureFieldId: null,
  sliceCount: 30,
  surfaceSurcharges: [],
};

void test("SlopeSliceDiscretizer2D exposes a strict typed consumer contract", () => {
  const discretizer: SlopeSliceDiscretizer2D = new SlopeSliceDiscretizer2D();
  const resultType: SlopeSliceDiscretizationJson | undefined = undefined;
  if (SLOPE_SLICE_DISCRETIZATION_2D_SCHEMA_VERSION !== "slope-slice-discretization-2d/v1") {
    throw new Error("Unexpected slope-slice discretization schema version.");
  }
  void discretizer;
  void options;
  void resultType;
});
