import test from "node:test";
import type {
  ConcurrentFemLineActions,
  ConcurrentFemLineElementDemand,
  ConcurrentFemReferenceSelector,
  ResistanceAxisMatrix,
  ResistanceLineActionStateInput,
  ResistanceLineActions,
  ResistanceMappedMember,
  ResistanceSectionCutStateInput,
  ResistanceSectionCutResultants,
  ResistanceShellResultantStateInput,
  ResistanceSupportReactionStateInput,
} from "../dist/index.js";
import {
  collectConcurrentLineElementActionStates,
  filterConcurrentFemStates,
  projectLineActionStateToResistanceAxes,
  projectMemberActionStatesToResistanceAxes,
  projectSectionCutStateToResistanceAxes,
  projectShellResultantStateToResistanceAxes,
  projectSupportReactionStateToResistanceAxes,
  validateResistanceAxisTransformation,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<T extends U, U> = T;

type PublicFunctionsAreNotAny = [
  AssertFalse<IsAny<Parameters<typeof collectConcurrentLineElementActionStates>[0]>>,
  AssertFalse<IsAny<Parameters<typeof filterConcurrentFemStates>[0]>>,
  AssertFalse<IsAny<Parameters<typeof projectLineActionStateToResistanceAxes>[0]>>,
  AssertFalse<IsAny<Parameters<typeof projectMemberActionStatesToResistanceAxes>[0]>>,
  AssertFalse<IsAny<Parameters<typeof projectSectionCutStateToResistanceAxes>[0]>>,
  AssertFalse<IsAny<Parameters<typeof projectShellResultantStateToResistanceAxes>[0]>>,
  AssertFalse<IsAny<Parameters<typeof projectSupportReactionStateToResistanceAxes>[0]>>,
  AssertFalse<IsAny<Parameters<typeof validateResistanceAxisTransformation>[0]>>,
];

type PublicResultsAreUseful = [
  AssertExtends<
    ReturnType<typeof collectConcurrentLineElementActionStates>,
    readonly { readonly actions: ConcurrentFemLineActions }[]
  >,
  AssertExtends<
    ReturnType<typeof projectLineActionStateToResistanceAxes>,
    { readonly resistanceActions: ResistanceLineActions }
  >,
  AssertExtends<
    ReturnType<typeof projectSectionCutStateToResistanceAxes>,
    { readonly resistanceResultants: ResistanceSectionCutResultants }
  >,
];

const matrix: ResistanceAxisMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const actions: ConcurrentFemLineActions = {
  N: -10,
  Vy: 2,
  Vz: 3,
  T: 4,
  My: 5,
  Mz: 6,
};
const lineDemand: ConcurrentFemLineElementDemand = {
  lineElementId: "E1",
  actionStates: [
    {
      coordinateSystem: "element-local",
      reference: { combinationId: "ULS-1" },
      stations: [{ xi: 0.5, actions }],
    },
  ],
};
const lineState: ResistanceLineActionStateInput = {
  lineElementId: "E1",
  coordinateSystem: "element-local",
  actions,
};
const member: ResistanceMappedMember = {
  id: "M1",
  lineElementIds: ["E1"],
  lineActionMappings: [
    {
      lineElementId: "E1",
      sourceCoordinateSystem: "element-local",
      resistanceCoordinateSystemId: "R1",
      sourceToResistance: matrix,
    },
  ],
};
const sectionState: ResistanceSectionCutStateInput = {
  sectionCutId: "CUT-1",
  coordinateSystem: "section-cut-local",
  resultants: { Fx: 1, Fy: 2, Fz: 3, Mx: 4, My: 5, Mz: 6 },
};
const shellState: ResistanceShellResultantStateInput = {
  shellElementId: "S1",
  coordinateSystem: "element-local",
  components: { Nx: 1, Ny: 2, Nxy: 3, Mx: 4, My: 5, Mxy: 6, Vx: 7, Vy: 8 },
};
const supportState: ResistanceSupportReactionStateInput = {
  nodeId: "N1",
  coordinateSystem: "global",
  forces: { x: 1, y: 2, z: 3 },
  moments: { x: 4, y: 5, z: 6 },
};
const selector: ConcurrentFemReferenceSelector = { combinationId: "ULS-1" };

function consumerProof(): void {
  const collected = collectConcurrentLineElementActionStates(lineDemand);
  const filtered = filterConcurrentFemStates(collected, selector);
  const lineMapping = member.lineActionMappings?.[0];
  if (lineMapping === undefined) {
    throw new Error("The compile-time mapping fixture must contain one mapping.");
  }
  const line = projectLineActionStateToResistanceAxes({
    state: lineState,
    mapping: lineMapping,
  });
  const memberStates = projectMemberActionStatesToResistanceAxes({
    member,
    states: [lineState],
  });
  const section = projectSectionCutStateToResistanceAxes({
    state: sectionState,
    mapping: {
      sectionCutId: "CUT-1",
      sourceCoordinateSystem: "section-cut-local",
      resistanceCoordinateSystemId: "R1",
      sourceToResistance: matrix,
    },
  });
  const shell = projectShellResultantStateToResistanceAxes({
    state: shellState,
    mapping: {
      shellElementId: "S1",
      sourceCoordinateSystem: "element-local",
      resistanceCoordinateSystemId: "R1",
      sourceToResistance: matrix,
    },
  });
  const support = projectSupportReactionStateToResistanceAxes({
    state: supportState,
    mapping: {
      supportNodeId: "N1",
      sourceCoordinateSystem: "global",
      resistanceCoordinateSystemId: "R1",
      sourceToResistance: matrix,
    },
  });
  const validated = validateResistanceAxisTransformation(matrix);
  void filtered;
  void line;
  void memberStates;
  void section;
  void shell;
  void support;
  void validated;
}

void consumerProof;
void (null as unknown as PublicFunctionsAreNotAny);
void (null as unknown as PublicResultsAreUseful);
void test("FEM demand and resistance-axis declarations support typed consumers", () => {
  // Compile-time assertions above are the test.
});
