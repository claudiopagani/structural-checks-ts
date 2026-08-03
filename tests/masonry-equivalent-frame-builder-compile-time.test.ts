import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryEquivalentFrameBuilder,
  MasonryWallOpeningsModel,
  type MasonryEquivalentFrameBuilderBuildInput,
  type MasonryEquivalentFrameBuilderResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type BuilderIsStrict = AssertFalse<IsAny<typeof MasonryEquivalentFrameBuilder>>;

const input: MasonryEquivalentFrameBuilderBuildInput = {
  alignment: new MasonryWallOpeningsModel({
    id: "allineamento-É",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-1",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: { E: 1.8e9, G: 6e8 },
      },
    ],
    openings: [{ id: "finestra-α", x: 2, y: 1, width: 1, height: 1 }],
  }),
  stage: "design",
  options: { includeDiaphragm: true, topRotation: "free" },
};

function build(): MasonryEquivalentFrameBuilderResult {
  return new MasonryEquivalentFrameBuilder().build(input);
}

void test("MasonryEquivalentFrameBuilder exposes strict typed consumers", () => {
  const strictTypeProof: BuilderIsStrict = false;
  const result = build();

  assert.equal(strictTypeProof, false);
  assert.equal(result.topRotation, "free");
  assert.ok(result.snapshot.metadata);
  assert.equal(result.model.nodes.length, 5);
  assert.equal(result.model.constraints.length, 2);
  assert.equal(result.createSolver().constructor.name, "LinearStaticSolver2D");
});
