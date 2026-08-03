import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryEquivalentFramePushoverSolver2D,
  type MasonryEquivalentFramePushoverSolver2DOptions,
} from "../dist/applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverSolver2D.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SolverDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryEquivalentFramePushoverSolver2D>>,
  AssertFalse<IsAny<MasonryEquivalentFramePushoverSolver2DOptions>>,
  AssertFalse<IsAny<InstanceType<typeof MasonryEquivalentFramePushoverSolver2D>>>,
];

function useSolverDeclarations(value: SolverDeclarationsAreStrict | undefined): void {
  void value;
}

void test("equivalent-frame pushover solver exposes a strict typed contract", () => {
  useSolverDeclarations(undefined);
  const options: MasonryEquivalentFramePushoverSolver2DOptions = {};
  const solver = new MasonryEquivalentFramePushoverSolver2D(options);

  assert.ok(solver.linearSolver);
  assert.ok(solver.nonlinearSolver);
});
