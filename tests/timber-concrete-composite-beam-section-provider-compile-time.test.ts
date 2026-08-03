import assert from "node:assert/strict";
import test from "node:test";

import {
  TimberConcreteCompositeBeamModel,
  TimberConcreteCompositeBeamSectionProvider,
  createTimberConcreteCompositeBeamSectionProvider,
  type TimberConcreteCompositeBeamSectionProviderOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const model = new TimberConcreteCompositeBeamModel({
  id: "composite-provider-compile-time",
  span: 4_250,
  slabSection: {
    area: 108_000,
    inertiaY: 324_000,
    inertiaZ: 29_160_000_000,
    height: 60,
    width: 1_800,
  },
  timberSection: {
    area: 60_000,
    inertiaY: 450_000_000,
    inertiaZ: 200_000_000,
    height: 300,
    width: 200,
  },
  timberMaterial: { elasticModulus: 11_000, shearModulus: 687.5 },
  concreteMaterial: { elasticModulus: 30_000, poissonRatio: 0.2 },
  connector: { kser: 20_000, ku: 30_000 },
  connectorSpacing: 150,
  units: { force: "N", length: "mm" },
});

const providerOptions: TimberConcreteCompositeBeamSectionProviderOptions = { model };

type ProviderIsStrict = AssertFalse<IsAny<typeof TimberConcreteCompositeBeamSectionProvider>>;
type FactoryIsStrict = AssertFalse<IsAny<typeof createTimberConcreteCompositeBeamSectionProvider>>;
type OptionsAreStrict = AssertFalse<IsAny<TimberConcreteCompositeBeamSectionProviderOptions>>;

void test("TimberConcreteCompositeBeamSectionProvider exposes strict typed consumers", () => {
  const providerStrictProof: ProviderIsStrict = false;
  const factoryStrictProof: FactoryIsStrict = false;
  const optionsStrictProof: OptionsAreStrict = false;
  const provider = new TimberConcreteCompositeBeamSectionProvider(providerOptions);
  const factoryProvider = createTimberConcreteCompositeBeamSectionProvider(providerOptions);
  const properties = provider.getElasticBeamProperties({ limitState: "ULS" });

  assert.equal(providerStrictProof, false);
  assert.equal(factoryStrictProof, false);
  assert.equal(optionsStrictProof, false);
  assert.equal(factoryProvider.constructor, TimberConcreteCompositeBeamSectionProvider);
  assert.ok(properties.flexuralRigidity > 0);
  assert.equal(properties.metadata.limitState, "ULS");
});
