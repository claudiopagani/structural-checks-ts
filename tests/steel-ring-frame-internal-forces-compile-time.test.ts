import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelRingFrameInternalForces,
  type SteelRingFrameInternalForcesElementLike,
  type SteelRingFrameInternalForcesFrameLike,
  type SteelRingFrameInternalForcesOptions,
} from "../dist/applications/steel-frames/analysis/SteelRingFrameInternalForces.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelRingFrameInternalForcesIsStrict = AssertFalse<IsAny<typeof SteelRingFrameInternalForces>>;

function useSteelRingFrameInternalForcesDeclarations(
  options: SteelRingFrameInternalForcesOptions,
): number {
  return new SteelRingFrameInternalForces().evaluate(options).internalForceVector.length;
}

void test("SteelRingFrameInternalForces exposes strict typed consumers", () => {
  const strictTypeProof: SteelRingFrameInternalForcesIsStrict = false;
  assert.equal(strictTypeProof, false);

  const registry = {
    size: () => 2,
    getIndex: (dofId: string) => (dofId === "A.ux" ? 0 : 1),
  };
  const element: SteelRingFrameInternalForcesElementLike = {
    id: "element",
    metadata: { role: "column" },
    evaluate: ({ hingeState }) => ({
      hingeState,
      newActivations: [],
      localEndForces: [1, 2],
      globalEndForces: [1, 2],
      plasticRotations: [],
      tangentGlobalStiffness: [
        [3, 0],
        [0, 4],
      ],
    }),
    getDofIds: () => ["A.ux", "A.uy"],
    plasticMomentCapacity: () => 100,
  };
  const frame: SteelRingFrameInternalForcesFrameLike = {
    dofRegistry: registry,
    elements: [element],
  };
  const options: SteelRingFrameInternalForcesOptions = {
    frame,
    displacements: [0, 0],
  };
  const instance = new SteelRingFrameInternalForces();
  const result = instance.evaluate(options);
  const declarationConsumer = useSteelRingFrameInternalForcesDeclarations(options);

  assert.equal(result.internalForceVector.length, 2);
  assert.equal(declarationConsumer, 2);
});
