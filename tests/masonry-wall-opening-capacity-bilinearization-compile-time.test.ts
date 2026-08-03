import assert from "node:assert/strict";
import test from "node:test";

import {
  bilinearizeCapacityCurve,
  type BilinearizedCapacityCurve,
  type BilinearizeCapacityCurveInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof bilinearizeCapacityCurve>>,
  AssertFalse<IsAny<BilinearizedCapacityCurve>>,
  AssertFalse<IsAny<BilinearizeCapacityCurveInput>>,
  AssertFalse<IsAny<ReturnType<typeof bilinearizeCapacityCurve>>>,
];

function usePublicDeclarations(value: PublicDeclarationsAreStrict | undefined): void {
  void value;
}

void test("capacity-curve bilinearization exposes a strict typed consumer contract", () => {
  usePublicDeclarations(undefined);
  const input: BilinearizeCapacityCurveInput = {
    points: [
      { id: "origin", displacement: 0, baseShear: 0 },
      { id: "yield", displacement: 0.01, baseShear: 100 },
      { id: "peak", displacement: 0.02, baseShear: 150 },
      { id: "ultimate", displacement: 0.04, baseShear: 100 },
    ],
  };
  const result = bilinearizeCapacityCurve(input);

  assert.equal(result.status, "ok");
  assert.equal(result.peakPoint?.id, "peak");
  assert.ok(result.ks > 0);
});
