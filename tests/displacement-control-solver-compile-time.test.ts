import test from "node:test";

import {
  DisplacementControlNonlinearStaticSolver2D,
  DofRegistry,
  type DisplacementControlEvaluation,
  type DisplacementControlEvaluator,
  type DisplacementControlModel2D,
  type DisplacementControlSolveResult,
} from "../dist/index.js";

const dofRegistry = new DofRegistry({ dofsPerNode: ["ux"] }).registerNode("spring-1");
const model: DisplacementControlModel2D = {
  dofRegistry,
  referenceLoadVector: [1],
  controlVector: [1],
  supports: [],
};

const evaluator: DisplacementControlEvaluator = ({
  displacements,
}): DisplacementControlEvaluation => ({
  internalForceVector: [10 * (displacements[0] ?? 0)],
  tangentStiffnessMatrix: [[10]],
  events: [],
});
const result: DisplacementControlSolveResult =
  new DisplacementControlNonlinearStaticSolver2D().solve({
    model,
    evaluator,
    controlDisplacementIncrement: 0.1,
    maxControlDisplacement: 0.1,
  });

void test("DisplacementControlNonlinearStaticSolver2D exposes a strict typed consumer contract", () => {
  void result;
});
