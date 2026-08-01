/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises */
// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
// @ts-nocheck
import test from "node:test";
import assert from "node:assert/strict";
import {
  collectConcurrentLineElementActionStates,
  filterConcurrentFemStates,
} from "../dist/index.js";

test("slice 0030 preserves complete concurrent line states and rejects missing components", () => {
  const demand = {
    lineElementId: "E1",
    actionStates: [
      {
        reference: { procedureId: "P", combinationId: "ULS" },
        coordinateSystem: "element-local",
        localAxes: { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } },
        stations: [
          { xi: 0, position: 0, actions: { N: -10, Vy: 2, Vz: 3, T: 4, My: 5, Mz: 6 } },
          { xi: 1, position: 2, actions: { N: -8, Vy: 1, Vz: 2, T: 3, My: 4, Mz: 5 } },
        ],
      },
    ],
  };
  const states = collectConcurrentLineElementActionStates(demand);
  assert.equal(states.length, 2);
  assert.deepEqual(filterConcurrentFemStates(states, { combinationId: "ULS" }), states);
  assert.throws(
    () =>
      collectConcurrentLineElementActionStates({
        ...demand,
        actionStates: [
          {
            ...demand.actionStates[0],
            stations: [
              {
                ...demand.actionStates[0].stations[0],
                actions: { N: -10, Vy: 2, Vz: 3, My: 5, Mz: 6 },
              },
            ],
          },
        ],
      }),
    /actions\.T must be finite/,
  );
});
