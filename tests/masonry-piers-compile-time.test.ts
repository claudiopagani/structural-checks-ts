import test from "node:test";

import {
  MasonryPierApplication,
  MasonryPierEquivalentFrameBuilder,
  MasonryPierModel,
  MasonryPierVerticalVerification,
  NTC2018MasonryPierAnalysis,
  NTC2018MasonryPierModel,
  type MasonryPierApplicationInput,
  type MasonryPierEquivalentFrameBuildResult,
  type MasonryPierModelOptions,
  type NTC2018MasonryPierModelOptions,
} from "../dist/index.js";

const units = { force: "N" as const, length: "mm" as const };

const modelOptions: MasonryPierModelOptions = {
  id: "compile-time-pier",
  units,
  geometry: { height: 3000, length: 1000, thickness: 300 },
  material: { units, fm: 6, E: 1800, G: 600, w: 0.000018 },
  actions: { axialForce: 200000 },
  design: { gammaM: 2, confidenceFactor: 1.2 },
};

const normativeOptions: NTC2018MasonryPierModelOptions = {
  ...modelOptions,
  id: "compile-time-ntc-pier",
  normative: {
    scope: "existing",
    masonryTexture: "irregular",
    blockCompressiveStrength: 12,
  },
};

void test("masonry-pier APIs expose a strict typed consumer contract", () => {
  const model = new MasonryPierModel(modelOptions);
  const normativeModel = new NTC2018MasonryPierModel(normativeOptions);
  const applicationInput: MasonryPierApplicationInput = {
    ...modelOptions,
    model,
  };
  const application = new MasonryPierApplication();
  const vertical = new MasonryPierVerticalVerification({ code: "NTC2018" });
  const builder = new MasonryPierEquivalentFrameBuilder();
  const idealization: MasonryPierEquivalentFrameBuildResult = builder.build({ model });
  const analysis = new NTC2018MasonryPierAnalysis();

  void application.run(applicationInput);
  void vertical.verify({ model });
  void analysis.analyze({ model: normativeModel });
  void idealization.snapshot.metadata.sourceModelId;
  void model.toJSON();
  void normativeModel.toJSON();
});
