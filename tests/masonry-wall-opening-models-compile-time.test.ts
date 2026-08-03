import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryWallOpeningsModel,
  MasonryWallPierModel,
  MasonryWallSpandrelModel,
  type MasonryWallOpeningsModelInput,
  type MasonryWallPierModelInput,
  type MasonryWallSpandrelModelInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryWallOpeningsModel>>,
  AssertFalse<IsAny<typeof MasonryWallPierModel>>,
  AssertFalse<IsAny<typeof MasonryWallSpandrelModel>>,
  AssertFalse<IsAny<MasonryWallOpeningsModelInput>>,
  AssertFalse<IsAny<MasonryWallPierModelInput>>,
  AssertFalse<IsAny<MasonryWallSpandrelModelInput>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

const openingsInput: MasonryWallOpeningsModelInput = {
  id: "allineamento-δ",
  units: { force: "kN", length: "cm" },
  walls: [{ id: "muro-α", length: 240, height: 300, thickness: 30 }],
};
const pierInput: MasonryWallPierModelInput = {
  id: "pila-μ",
  wallId: "muro-α",
  alignmentId: "allineamento-δ",
  x: 0.3,
  length: 1.2,
  height: 2.8,
  thickness: 0.3,
};
const spandrelInput: MasonryWallSpandrelModelInput = {
  id: "fascia-β",
  alignmentId: "allineamento-δ",
  xStart: 0.3,
  xEnd: 1.5,
  height: 0.6,
  thickness: 0.3,
};

void test("masonry wall opening models expose strict typed consumer contracts", () => {
  usePublicDeclarations(undefined);
  const openings = new MasonryWallOpeningsModel(openingsInput);
  const pier = new MasonryWallPierModel(pierInput);
  const spandrel = new MasonryWallSpandrelModel(spandrelInput);

  assert.equal(openings.id, openingsInput.id);
  assert.equal(pier.xEnd(), 1.5);
  assert.equal(spandrel.length(), 1.2);
});
