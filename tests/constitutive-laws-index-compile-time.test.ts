import test from "node:test";

import {
  ConcreteNoTensionLaw,
  ConcreteParabolaRectangleLaw,
  ConcreteStressBlockLaw,
  ConcreteTriangularRectangleLaw,
  SteelElasticLaw,
  SteelElasticPlasticHardeningLaw,
  SteelElasticPerfectlyPlasticLaw,
} from "../dist/index.js";

const constructors = [
  ConcreteNoTensionLaw,
  ConcreteParabolaRectangleLaw,
  ConcreteStressBlockLaw,
  ConcreteTriangularRectangleLaw,
  SteelElasticLaw,
  SteelElasticPlasticHardeningLaw,
  SteelElasticPerfectlyPlasticLaw,
] as const;

void constructors;

void test("constitutive-law index exports strict typed consumer constructors", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
