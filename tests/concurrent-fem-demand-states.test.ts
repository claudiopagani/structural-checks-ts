// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";

import {
  collectConcurrentJointActionStates,
  collectConcurrentLineElementActionStates,
  collectConcurrentMemberActionStates,
  collectConcurrentSectionCutStates,
  collectConcurrentSupportReactionStates,
  collectConcurrentSurfaceResultantStates,
  filterConcurrentFemStates,
} from "../dist/index.js";
import type {
  ConcurrentFemGlobalResponses,
  ConcurrentFemJointDemand,
  ConcurrentFemLineActions,
  ConcurrentFemLineElementDemand,
  ConcurrentFemMemberDemand,
  ConcurrentFemSurfaceDemand,
} from "../dist/index.js";

interface TestDemandSet {
  readonly memberDemands: readonly ConcurrentFemMemberDemand[];
  readonly jointDemands: readonly ConcurrentFemJointDemand[];
  readonly surfaceDemands: readonly ConcurrentFemSurfaceDemand[];
  readonly globalResponses: ConcurrentFemGlobalResponses;
}

function actions(values: Partial<ConcurrentFemLineActions>): ConcurrentFemLineActions {
  return {
    N: values.N ?? -120,
    Vy: values.Vy ?? 15,
    Vz: values.Vz ?? 8,
    T: values.T ?? 2,
    My: values.My ?? 25,
    Mz: values.Mz ?? 40,
  };
}

function lineElementDemand(lineElementId: string): ConcurrentFemLineElementDemand {
  return {
    lineElementId,
    actionStates: [
      {
        reference: { procedureId: "PROC-STATIC", combinationId: "ULS-1" },
        coordinateSystem: "element-local",
        stations: [
          { xi: 0, actions: actions({}) },
          { xi: 1, actions: actions({ N: -110, Vy: 12, Vz: 7, T: 1, My: 20, Mz: 35 }) },
        ],
      },
      {
        reference: { procedureId: "PROC-STATIC", combinationId: "SLS-1" },
        coordinateSystem: "element-local",
        stations: [
          { xi: 0, actions: actions({ N: -80, Vy: 8, Vz: 4, T: 1, My: 12, Mz: 20 }) },
          { xi: 1, actions: actions({ N: -75, Vy: 7, Vz: 3, T: 1, My: 10, Mz: 18 }) },
        ],
      },
    ],
  };
}

function createDemandSet(): TestDemandSet {
  const memberDemands: readonly ConcurrentFemMemberDemand[] = [
    {
      id: "MEMBER-COL-A-1",
      classification: { role: "column", status: "confirmed" },
      elementDemands: [lineElementDemand("COL-A-1")],
    },
    {
      id: "MEMBER-COL-A-2",
      classification: { role: "column", status: "confirmed" },
      elementDemands: [lineElementDemand("COL-A-2")],
    },
  ];
  const jointElementEnds = ["E1", "E2", "E3", "E4"].map((lineElementId) => ({
    lineElementId,
    end: "start",
    coordinateSystem: "element-local",
    atElementEnd: true,
    station: { xi: 0, actions: actions({}) },
  }));
  const jointDemands: readonly ConcurrentFemJointDemand[] = [
    {
      jointId: "JOINT-A1",
      nodeId: "A1",
      demandStates: [
        {
          reference: { procedureId: "PROC-STATIC", combinationId: "ULS-1" },
          complete: true,
          missingElementEnds: [],
          elementEnds: jointElementEnds,
        },
        {
          reference: { procedureId: "PROC-STATIC", combinationId: "SLS-1" },
          complete: true,
          missingElementEnds: [],
          elementEnds: jointElementEnds,
        },
      ],
    },
  ];
  const surfaceDemands: readonly ConcurrentFemSurfaceDemand[] = [
    {
      id: "WALL-W1",
      classification: { role: "wall", status: "confirmed" },
      elementDemands: [
        {
          shellElementId: "WALL-S1",
          resultantStates: [
            {
              coordinateSystem: "element-local",
              reference: { combinationId: "ULS-1" },
              components: { Nx: 1, Ny: 2, Nxy: 3, Mx: 4, My: 5, Mxy: 6, Vx: 7, Vy: 8 },
            },
            {
              coordinateSystem: "element-local",
              reference: { combinationId: "SLS-1" },
              components: { Nx: 2, Ny: 3, Nxy: 4, Mx: 5, My: 6, Mxy: 7, Vx: 8, Vy: 9 },
            },
          ],
        },
        {
          shellElementId: "WALL-S2",
          resultantStates: [
            {
              coordinateSystem: "element-local",
              reference: { combinationId: "ULS-1" },
              components: { Nx: 1, Ny: 2, Nxy: 3, Mx: 4, My: 5, Mxy: 6, Vx: 7, Vy: 8 },
            },
            {
              coordinateSystem: "element-local",
              reference: { combinationId: "SLS-1" },
              components: { Nx: 2, Ny: 3, Nxy: 4, Mx: 5, My: 6, Mxy: 7, Vx: 8, Vy: 9 },
            },
          ],
        },
      ],
    },
  ];
  const globalResponses: ConcurrentFemGlobalResponses = {
    sectionCuts: ["CUT-WALL-BASE", "CUT-WALL-L1"].flatMap((sectionCutId) => [
      {
        sectionCutId,
        coordinateSystem: "section-cut-local",
        combinationId: "ULS-1",
        resultants: { Fx: 180, Fy: 620, Fz: 35, Mx: 90, My: 140, Mz: 25 },
      },
      {
        sectionCutId,
        coordinateSystem: "section-cut-local",
        combinationId: "SLS-1",
        resultants: { Fx: 80, Fy: 300, Fz: 15, Mx: 40, My: 60, Mz: 10 },
      },
    ]),
    reactions: [
      {
        nodeId: "A0",
        coordinateSystem: "global",
        combinationId: "ULS-1",
        forces: { x: -25, y: -8, z: 250 },
        moments: { x: 1, y: 2, z: 3 },
      },
      {
        nodeId: "A0",
        coordinateSystem: "global",
        combinationId: "SLS-1",
        forces: { x: -10, y: -4, z: 100 },
        moments: { x: 1, y: 2, z: 3 },
      },
    ],
  };
  return { memberDemands, jointDemands, surfaceDemands, globalResponses };
}

void test("member action projection preserves every element, station and concurrent component", () => {
  const demandSet = createDemandSet();
  const first = demandSet.memberDemands.find((item) => item.id === "MEMBER-COL-A-1");
  const second = demandSet.memberDemands.find((item) => item.id === "MEMBER-COL-A-2");
  assert.ok(first);
  assert.ok(second);
  assert.ok(first.elementDemands);
  assert.ok(second.elementDemands);
  const multiElementMember = {
    id: "MEMBER-COL-A",
    classification: { role: "column", status: "confirmed" },
    lineElementIds: ["COL-A-1", "COL-A-2"],
    elementDemands: [...first.elementDemands, ...second.elementDemands],
  };

  const states = collectConcurrentMemberActionStates(multiElementMember);
  assert.deepEqual([...new Set(states.map((state) => state.lineElementId))].sort(), [
    "COL-A-1",
    "COL-A-2",
  ]);
  assert.equal(states.length, 8);

  const ulsStart = states.find(
    (state) =>
      state.lineElementId === "COL-A-1" &&
      state.reference.combinationId === "ULS-1" &&
      state.station.xi === 0,
  );
  assert.ok(ulsStart);
  assert.deepEqual(ulsStart.actions, {
    N: -120,
    Vy: 15,
    Vz: 8,
    T: 2,
    My: 25,
    Mz: 40,
  });

  const slsStates = filterConcurrentFemStates(states, {
    procedureId: "PROC-STATIC",
    combinationId: "SLS-1",
  });
  assert.equal(slsStates.length, 4);
  assert.ok(slsStates.every((state) => state.reference.combinationId === "SLS-1"));
});

void test("line action projection rejects missing components instead of inventing zeroes", () => {
  assert.throws(
    () =>
      collectConcurrentLineElementActionStates({
        lineElementId: "E1",
        actionStates: [
          {
            reference: { combinationId: "ULS" },
            coordinateSystem: "element-local",
            stations: [
              {
                xi: 0,
                actions: { N: -10, Vy: 2, Vz: 3, My: 4, Mz: 5 },
              },
            ],
          },
        ],
      }),
    /actions\.T must be finite/,
  );
});

void test("joint and support projections retain concurrent result references", () => {
  const demandSet = createDemandSet();
  const joint = demandSet.jointDemands.find((item) => item.jointId === "JOINT-A1");
  assert.ok(joint);
  const jointStates = collectConcurrentJointActionStates(joint);

  assert.equal(jointStates.length, 2);
  assert.ok(jointStates.every((state) => state.complete));
  assert.ok(jointStates.every((state) => state.elementEnds.length === 4));
  const ulsJointState = jointStates.find((state) => state.reference.combinationId === "ULS-1");
  assert.ok(ulsJointState);
  const firstJointEnd = ulsJointState.elementEnds[0];
  assert.ok(firstJointEnd);
  assert.ok(firstJointEnd.station);
  assert.equal(firstJointEnd.station.actions.N, -120);

  const reactions = collectConcurrentSupportReactionStates({
    nodeId: "A0",
    globalResponses: demandSet.globalResponses,
  });
  assert.equal(reactions.length, 2);
  assert.deepEqual(reactions.map((state) => state.reference.combinationId).sort(), [
    "SLS-1",
    "ULS-1",
  ]);
  const ulsReaction = reactions.find((state) => state.reference.combinationId === "ULS-1");
  assert.ok(ulsReaction);
  assert.deepEqual(ulsReaction.forces, {
    x: -25,
    y: -8,
    z: 250,
  });
});

void test("surface and section-cut projections preserve axes and concurrent references", () => {
  const demandSet = createDemandSet();
  const wall = demandSet.surfaceDemands.find((item) => item.id === "WALL-W1");
  assert.ok(wall);
  const shellStates = collectConcurrentSurfaceResultantStates(wall);
  const cutStates = collectConcurrentSectionCutStates({
    sectionCutIds: ["CUT-WALL-BASE", "CUT-WALL-L1"],
    globalResponses: demandSet.globalResponses,
  });

  assert.equal(shellStates.length, 4);
  assert.ok(shellStates.every((state) => state.coordinateSystem === "element-local"));
  assert.deepEqual([...new Set(shellStates.map((state) => state.shellElementId))].sort(), [
    "WALL-S1",
    "WALL-S2",
  ]);
  assert.equal(cutStates.length, 4);
  const ulsCut = cutStates.find(
    (state) => state.sectionCutId === "CUT-WALL-BASE" && state.reference.combinationId === "ULS-1",
  );
  assert.ok(ulsCut);
  assert.deepEqual(ulsCut.resultants, { Fx: 180, Fy: 620, Fz: 35, Mx: 90, My: 140, Mz: 25 });
});
