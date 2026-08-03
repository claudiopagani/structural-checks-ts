import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelDisplacementControlPushoverSolver2D,
  type SteelDisplacementControlPushoverSolveOptions,
  type SteelDisplacementControlPushoverSolveResult,
} from "../dist/applications/steel-frames/analysis/SteelDisplacementControlPushoverSolver2D.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelDisplacementControlSolverIsStrict = AssertFalse<
  IsAny<typeof SteelDisplacementControlPushoverSolver2D>
>;

function useSteelDisplacementControlDeclarations(
  solver: SteelDisplacementControlPushoverSolver2D,
  options: SteelDisplacementControlPushoverSolveOptions,
): SteelDisplacementControlPushoverSolveResult {
  return solver.solve(options);
}

void test("SteelDisplacementControlPushoverSolver2D exposes strict typed consumers", () => {
  const strictTypeProof: SteelDisplacementControlSolverIsStrict = false;
  assert.equal(strictTypeProof, false);

  const solver = new SteelDisplacementControlPushoverSolver2D();
  const options: SteelDisplacementControlPushoverSolveOptions = {
    controlDisplacementIncrement: 0.002,
    maxControlDisplacement: 0.03,
    tolerance: 1e-6,
    maxIterations: 60,
    maxSteps: 60,
    yieldTolerance: 1e-9,
  };

  assert.equal(solver instanceof SteelDisplacementControlPushoverSolver2D, true);
  assert.equal(typeof useSteelDisplacementControlDeclarations, "function");
  assert.equal(options.maxSteps, 60);
});
