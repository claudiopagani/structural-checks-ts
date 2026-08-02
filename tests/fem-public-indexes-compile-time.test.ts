import test from "node:test";

import {
  BeamLinePreprocessor2D,
  CyclicMasonryPier2D,
  CyclicMasonryPierAnalysis2D,
  DisplacementControlNonlinearStaticSolver2D,
  DofRegistry,
  FemAssembler2D,
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
  FrameElement2DTimoshenkoRigidOffsets,
  KinematicConstraintReducer2D,
  LinearStaticSolver2D,
} from "../dist/index.js";
import type {
  BeamLinePreprocessor2DInput,
  CyclicMasonryPier2DOptions,
  DisplacementControlSolveOptions,
  DofRegistryInput,
  FrameElement2DEulerBernoulliInput,
  FrameElement2DTimoshenkoInput,
  FrameElement2DTimoshenkoRigidOffsetsInput,
  cyclicMasonryPierHistoryToCsv,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof BeamLinePreprocessor2D>>,
  AssertFalse<IsAny<typeof CyclicMasonryPier2D>>,
  AssertFalse<IsAny<typeof CyclicMasonryPierAnalysis2D>>,
  AssertFalse<IsAny<typeof DisplacementControlNonlinearStaticSolver2D>>,
  AssertFalse<IsAny<typeof DofRegistry>>,
  AssertFalse<IsAny<typeof FemAssembler2D>>,
  AssertFalse<IsAny<typeof FrameElement2DEulerBernoulli>>,
  AssertFalse<IsAny<typeof FrameElement2DTimoshenko>>,
  AssertFalse<IsAny<typeof FrameElement2DTimoshenkoRigidOffsets>>,
  AssertFalse<IsAny<typeof KinematicConstraintReducer2D>>,
  AssertFalse<IsAny<typeof LinearStaticSolver2D>>,
  AssertFalse<IsAny<typeof cyclicMasonryPierHistoryToCsv>>,
];

type OptionContracts = [
  BeamLinePreprocessor2DInput,
  CyclicMasonryPier2DOptions,
  DisplacementControlSolveOptions,
  DofRegistryInput,
  FrameElement2DEulerBernoulliInput,
  FrameElement2DTimoshenkoInput,
  FrameElement2DTimoshenkoRigidOffsetsInput,
];

const registry = new DofRegistry();
const registryType: DofRegistry = registry;
const constructors = [
  BeamLinePreprocessor2D,
  CyclicMasonryPier2D,
  CyclicMasonryPierAnalysis2D,
  DisplacementControlNonlinearStaticSolver2D,
  FemAssembler2D,
  FrameElement2DEulerBernoulli,
  FrameElement2DTimoshenko,
  FrameElement2DTimoshenkoRigidOffsets,
  KinematicConstraintReducer2D,
  LinearStaticSolver2D,
];

void test("FEM public indexes expose strict typed consumer contracts", () => {
  void (null as unknown as PublicDeclarationsAreUseful);
  void (null as unknown as OptionContracts);
  void registryType;
  void constructors;
});
