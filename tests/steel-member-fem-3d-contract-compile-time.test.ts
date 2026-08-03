import assert from "node:assert/strict";
import test from "node:test";

import {
  createSteelMemberFem3DResult,
  steelMemberFem3DToLegacyAnalysisResult,
  validateSteelMemberFem3DResult,
  type SteelMemberFem3DResult,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelFem3DDeclarationsAreStrict = AssertFalse<
  IsAny<
    | typeof createSteelMemberFem3DResult
    | typeof steelMemberFem3DToLegacyAnalysisResult
    | typeof validateSteelMemberFem3DResult
    | SteelMemberFem3DResult
  >
>;

function strictSteelFem3DConsumer(input: Record<string, unknown>): SteelMemberFem3DResult {
  return createSteelMemberFem3DResult(input, { strict: false });
}

void test("steel FEM 3D contract exposes strict typed consumers", () => {
  const strictTypeProof: SteelFem3DDeclarationsAreStrict = false;
  assert.equal(strictTypeProof, false);

  const result = strictSteelFem3DConsumer({
    units: { force: "N", length: "mm" },
    fem3d: {
      member: { id: "M1", length: 6000 },
      combinations: [
        {
          id: "ULS-1",
          limitState: "ULS",
          stations: [
            {
              station: 0,
              N: 100,
              Vy: 10,
              Vz: 5,
              My: 20,
              Mz: 2,
              T: 0,
              B: 0,
              coordinates: { x: 0, y: 0, z: 0 },
              u: 0,
              v: 0,
              w: 0,
              rotationX: 0,
              rotationY: 0,
              rotationZ: 0,
            },
          ],
        },
      ],
    },
  });
  assert.equal(result.schema, "strutture-js/steel-member-fem-3d");
  assert.equal(validateSteelMemberFem3DResult(result).ok, true);
  assert.equal(typeof steelMemberFem3DToLegacyAnalysisResult(result), "object");
});
