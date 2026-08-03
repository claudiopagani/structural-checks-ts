import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveMasonryStageMaterial,
  type MasonryStageMaterialResolution,
  type ResolveMasonryStageMaterialInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof resolveMasonryStageMaterial>>,
  AssertFalse<IsAny<MasonryStageMaterialResolution>>,
  AssertFalse<IsAny<ResolveMasonryStageMaterialInput>>,
  AssertFalse<IsAny<ReturnType<typeof resolveMasonryStageMaterial>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("masonry stage material resolution exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const input: ResolveMasonryStageMaterialInput = {
    material: {
      id: "muratura-typed",
      originalMechanicalProperties: { fm: 4_000_000 },
      improvedMechanicalProperties: { fm: 6_000_000 },
    },
    stage: "design",
    settings: { useCorrectiveModifiers: true },
  };
  const result = resolveMasonryStageMaterial(input);

  assert.equal(result.material?.fm, 6_000_000);
  assert.equal(result.metadata.propertySource, "improvedMechanicalProperties");
});
