import test from "node:test";

import {
  SteelBeamSectionProvider,
  createSteelBeamSectionProvider,
  createTimberBeamSectionProvider,
  createXlamBeamSectionProvider,
} from "../dist/index.js";
import type { TimberBeamSectionProvider, XlamBeamSectionProvider } from "../dist/index.js";
import type {
  ElasticBeamSectionProperties,
  SteelBeamMaterialLike,
  SteelBeamSectionLike,
  SteelBeamSectionProviderOptions,
  TimberBeamMaterialLike,
  TimberBeamSectionLike,
  TimberBeamSectionProviderOptions,
  XlamBeamMaterialLike,
  XlamBeamSectionLike,
  XlamBeamSectionProviderOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<TValue extends TExpected, TExpected> = TValue;

const steelSection: SteelBeamSectionLike = {
  area: 10_000,
  inertiaY: 80_000_000,
  inertiaZ: 30_000_000,
  shearAreaY: 5_000,
  shearAreaZ: 3_000,
  convertedCatalogProperties: { Wel_y: 300_000, Wpl_y: 350_000 },
  profileName: "IPE-typed",
  family: "I",
};
const steelMaterial: SteelBeamMaterialLike = {
  elasticModulus: 210_000,
  shearModulus: 80_000,
  fyk: 275,
  grade: "S275",
};
const steelOptions: SteelBeamSectionProviderOptions = {
  section: steelSection,
  material: steelMaterial,
  metadata: { label: "steel-typed" },
};

const timberSection: TimberBeamSectionLike = {
  area: 28_800,
  inertiaY: 138_240_000,
  inertiaZ: 41_472_000,
  shearAreaY: 24_000,
  shearAreaZ: 18_000,
  units: { force: "N", length: "mm" },
};
const timberMaterial: TimberBeamMaterialLike = {
  elasticModulus: 11_000,
  gMean: 690,
  fmK: 24,
  fvK: 2.7,
  fc0K: 21,
  ft0K: 14,
  serviceClass: 1,
  timberType: "solid",
};
const timberOptions: TimberBeamSectionProviderOptions = {
  section: timberSection,
  material: timberMaterial,
  kmodByDuration: { medium: 0.8 },
};

const xlamSection: XlamBeamSectionLike = {
  area: 100_000,
  effectiveWidth: 1_000,
  layerThicknesses: [30, 20, 30],
  activeLayerIndexes: [0, 2],
  inertiaZ: 10_000_000,
  crossLayers: () => [{ thickness: 20 }],
  activeThickness: () => 60,
  totalThickness: () => 80,
  calculateBendingStiffness: () => 1_000_000_000,
  calculateShearStiffness: () => ({ shearStiffness: 0, shearCorrectionCoefficient: 1 }),
};
const xlamMaterial: XlamBeamMaterialLike = {
  e0Mean: 11_000,
  g0Mean: 690,
  g90Mean: 70,
  kdef: 0.8,
};
const xlamOptions: XlamBeamSectionProviderOptions = {
  section: xlamSection,
  material: xlamMaterial,
  metadata: { label: "xlam-typed" },
};

const steelProperties: ElasticBeamSectionProperties = new SteelBeamSectionProvider(
  steelOptions,
).getElasticBeamProperties();
const timberProperties: ElasticBeamSectionProperties =
  createTimberBeamSectionProvider(timberOptions).getElasticBeamProperties();
const xlamProperties: ElasticBeamSectionProperties =
  createXlamBeamSectionProvider(xlamOptions).getElasticBeamProperties();

type PublicDeclarationsAreTyped = [
  AssertFalse<IsAny<typeof SteelBeamSectionProvider>>,
  AssertFalse<IsAny<typeof TimberBeamSectionProvider>>,
  AssertFalse<IsAny<typeof XlamBeamSectionProvider>>,
  AssertExtends<typeof steelProperties, ElasticBeamSectionProperties>,
  AssertExtends<typeof timberProperties, ElasticBeamSectionProperties>,
  AssertExtends<typeof xlamProperties, ElasticBeamSectionProperties>,
];

function assertPublicDeclarations<T extends PublicDeclarationsAreTyped>(): T | undefined {
  return undefined;
}

void steelProperties;
void timberProperties;
void xlamProperties;
void createSteelBeamSectionProvider;
void assertPublicDeclarations;

void test("beam section providers expose strict typed consumer contracts", () => {
  // The assertions above are the test; this runtime body keeps the file in the test campaign.
});
