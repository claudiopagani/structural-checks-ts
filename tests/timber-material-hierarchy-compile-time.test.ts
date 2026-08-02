import test from "node:test";

import {
  GlulamTimberMaterial,
  SolidTimberMaterial,
  TimberMaterial,
  XlamMaterial,
  type GlulamTimberMaterialJson,
  type GlulamTimberMaterialOptions,
  type SolidTimberMaterialJson,
  type SolidTimberMaterialOptions,
  type TimberMaterialJson,
  type TimberMaterialOptions,
  type XlamMaterialJson,
  type XlamMaterialOptions,
} from "../dist/index.js";

const timberOptions: TimberMaterialOptions = {
  name: "Timber",
  strengthClass: "C24",
  fmK: 24,
  fvK: 4,
  units: { force: "N", length: "mm" },
};
const solidOptions: SolidTimberMaterialOptions = { ...timberOptions, gradingMethod: "visual" };
const glulamOptions: GlulamTimberMaterialOptions = {
  ...timberOptions,
  strengthClass: "GL24h",
  glulamType: "homogeneous",
};
const xlamOptions: XlamMaterialOptions = {
  ...timberOptions,
  strengthClass: "custom-clt",
  e0Mean: 11000,
  rollingShearStrength: 1.2,
};
const timber: TimberMaterial = new TimberMaterial(timberOptions);
const solid: SolidTimberMaterial = new SolidTimberMaterial(solidOptions);
const glulam: GlulamTimberMaterial = new GlulamTimberMaterial(glulamOptions);
const xlam: XlamMaterial = new XlamMaterial(xlamOptions);
const timberJson: TimberMaterialJson = timber.toJSON();
const solidJson: SolidTimberMaterialJson = solid.toJSON();
const glulamJson: GlulamTimberMaterialJson = glulam.toJSON();
const xlamJson: XlamMaterialJson = xlam.toJSON();

void test("timber material hierarchy exposes strict typed consumer contracts", () => {
  void timberJson;
  void solidJson;
  void glulamJson;
  void xlamJson;
});
