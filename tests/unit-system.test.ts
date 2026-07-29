import assert from "node:assert/strict";
import test from "node:test";

import {
  FORCE_UNIT_FACTORS,
  LENGTH_UNIT_FACTORS,
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  normalizeUnitSystem,
  type UnitSystemInput,
} from "../dist/index.js";

function assertApproximatelyEqual(actual: number, expected: number): void {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= 1e-12 * scale, `${actual} != ${expected}`);
}

void test("unit catalogs and normalization preserve the JavaScript baseline", () => {
  assert.deepEqual(FORCE_UNIT_FACTORS, { N: 1, kN: 1_000, MN: 1_000_000 });
  assert.deepEqual(LENGTH_UNIT_FACTORS, { m: 1, dm: 0.1, cm: 0.01, mm: 0.001 });
  assert.equal(Object.isFrozen(FORCE_UNIT_FACTORS), true);
  assert.equal(Object.isFrozen(LENGTH_UNIT_FACTORS), true);
  assert.deepEqual(normalizeUnitSystem({ force: "kN" }), {
    force: "kN",
    length: "m",
  });
  assert.equal(normalizeUnitSystem(null), null);
  assert.throws(
    () =>
      normalizeUnitSystem({
        force: "kip",
        length: "m",
      } as unknown as UnitSystemInput),
    /Unsupported force unit: kip/u,
  );
});

void test("explicit unit assertion preserves context and default error text", () => {
  assert.deepEqual(assertExplicitUnitSystem({ force: "N", length: "mm" }), {
    force: "N",
    length: "mm",
  });
  assert.throws(
    () => assertExplicitUnitSystem(null, "ExampleModel"),
    /ExampleModel requires explicit units: \{ force, length \}\./u,
  );
});

void test("resolver converts every baseline dimension without changing assumptions", () => {
  const resolver = createUnitResolver({ force: "kN", length: "m" }, { force: "N", length: "mm" });

  assert.deepEqual(resolver.sourceUnitSystem, { force: "kN", length: "m" });
  assert.deepEqual(resolver.targetUnitSystem, { force: "N", length: "mm" });
  assertApproximatelyEqual(resolver.length(1), 1_000);
  assertApproximatelyEqual(resolver.area(1), 1_000_000);
  assertApproximatelyEqual(resolver.volume(1), 1_000_000_000);
  assertApproximatelyEqual(resolver.force(1), 1_000);
  assertApproximatelyEqual(resolver.moment(1), 1_000_000);
  assertApproximatelyEqual(resolver.lineLoad(1), 1);
  assertApproximatelyEqual(resolver.areaLoad(1), 0.001);
  assertApproximatelyEqual(resolver.volumeLoad(1), 0.000001);
  assertApproximatelyEqual(resolver.stress(1), 0.001);
  assertApproximatelyEqual(resolver.translationalStiffness(1), 1);
  assertApproximatelyEqual(resolver.rotationalStiffness(1), 1_000_000);
  assertApproximatelyEqual(resolver.inertia(1), 1_000_000_000_000);
  assertApproximatelyEqual(resolver.sectionModulus(1), 1_000_000_000);
  assert.equal(resolver.convert(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
});

void test("missing source units preserve the baseline identity resolver", () => {
  const resolver = createUnitResolver(null, { force: "kN", length: "m" });

  assert.deepEqual(resolver.unitSystem, { force: "kN", length: "m" });
  assert.equal(resolver.sourceUnitSystem, null);
  assert.deepEqual(resolver.targetUnitSystem, { force: "kN", length: "m" });
  assert.equal(resolver.moment(12), 12);
});

void test("property conversion preserves unconverted metadata", () => {
  assert.deepEqual(
    convertUnitProperties(
      { length: 2, label: "kept" },
      {
        length: (value) => (value as number) * 1_000,
      },
    ),
    {
      length: 2_000,
      label: "kept",
    },
  );
});
