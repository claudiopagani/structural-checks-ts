import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPositiveCheckValue,
  governingCheck,
  isFinitePositive,
  round,
  uniqueStrings,
  utilizationCheck,
} from "../dist/index.js";

void test("generic check utilities preserve baseline rounding and validation", () => {
  assert.equal(round(1.23456789), 1.234568);
  assert.equal(round(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  assert.equal(round(null), null);
  assert.equal(isFinitePositive(1), true);
  assert.equal(isFinitePositive(0), false);
  assert.doesNotThrow(() => assertPositiveCheckValue(1, "value"));
  assert.throws(() => assertPositiveCheckValue(0, "value"), /positive number/u);
});

void test("utilization check preserves demand sign handling and serialized fields", () => {
  assert.deepEqual(
    utilizationCheck({
      id: "resistance",
      description: "Resistance",
      demand: -15,
      capacity: 20,
      metadata: { source: "assigned" },
    }),
    {
      id: "resistance",
      description: "Resistance",
      demand: 15,
      capacity: 20,
      utilizationRatio: 0.75,
      ok: true,
      metadata: { source: "assigned" },
    },
  );

  assert.deepEqual(
    utilizationCheck({
      id: "unavailable",
      description: "Unavailable capacity",
      demand: 10,
      capacity: 0,
      strictCapacity: false,
    }),
    {
      id: "unavailable",
      description: "Unavailable capacity",
      demand: 10,
      capacity: 0,
      utilizationRatio: null,
      ok: false,
      metadata: {},
    },
  );
});

void test("governing and unique-value helpers preserve baseline selection rules", () => {
  const first = { id: "first", utilizationRatio: 0.4 };
  const second = { id: "second", utilizationRatio: 0.9 };
  const unavailable = { id: "unavailable", utilizationRatio: null };

  assert.equal(governingCheck([first, unavailable, second]), second);
  assert.equal(governingCheck([unavailable]), null);
  assert.deepEqual(uniqueStrings(["a", "", "a", null, "b", undefined]), ["a", "b"]);
});
