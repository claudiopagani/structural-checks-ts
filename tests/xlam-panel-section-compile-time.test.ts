import test from "node:test";

import {
  XlamPanelSection,
  createXlamPanelSection,
  Node,
  type CreateXlamPanelSectionOptions,
  type XlamPanelMaterialLike,
  type XlamPanelSectionJson,
  type XlamPanelSectionOptions,
  type XlamPanelShearStiffness,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const material: XlamPanelMaterialLike = {
  e0Mean: 11_000,
  e90Mean: 400,
  g0Mean: 700,
  g90Mean: 40,
};
const sectionOptions: XlamPanelSectionOptions = {
  id: "xlam-α",
  name: "XLAM δ",
  effectiveWidth: 1,
  layerThicknesses: [0.03, 0.03, 0.04, 0.03, 0.03],
  activeLayerIndexes: [0, 2, 4],
  units,
  metadata: { label: "pannello Γ" },
};
const section = new XlamPanelSection(sectionOptions);
const productSection = createXlamPanelSection({
  productId: "generic-5s-30-30-30",
  units,
} satisfies CreateXlamPanelSectionOptions);
const json: XlamPanelSectionJson = section.toJSON();
const stiffness: number = section.calculateBendingStiffness(material, {
  includeCrossLayerBending: true,
});
const shear: XlamPanelShearStiffness = section.calculateShearStiffness(material);
const activeThickness: number = productSection.activeThickness();
const node = new Node({ id: "typed-node", units });

void test("XlamPanelSection exposes a strict typed consumer contract", () => {
  void json;
  void stiffness;
  void shear;
  void activeThickness;
  void node;
});
