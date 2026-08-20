import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSimplifiedMasonryArchGeometry,
  evaluateMasonryArchCurveAtStation,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function ellipticalMinimumRadius(input: {
  readonly span: number;
  readonly rise: number;
  readonly springingAngleDegrees: number;
}): number {
  const springingAngle = (input.springingAngleDegrees * Math.PI) / 180;
  const ratio = (input.span * Math.tan(springingAngle)) / (2 * input.rise);
  const cosine = 1 / (ratio - 1);
  const halfParameter = Math.acos(cosine);
  const semiAxisX = input.span / (2 * Math.sin(halfParameter));
  const semiAxisY = input.rise / (1 - cosine);
  const parameter = semiAxisY >= semiAxisX ? 0 : halfParameter;
  const speedSquared =
    semiAxisX ** 2 * Math.cos(parameter) ** 2 + semiAxisY ** 2 * Math.sin(parameter) ** 2;
  return speedSquared ** 1.5 / (semiAxisX * semiAxisY);
}

function ellipseGeometry(
  rise: number,
  springingAngle: number,
  thickness: number,
  referenceCurve: "intrados" | "centerline" | "extrados" = "extrados",
) {
  return buildSimplifiedMasonryArchGeometry({
    kind: "simplified-symmetric",
    referenceCurve,
    profile: { type: "elliptical", springingAngle, angleUnits: "deg" },
    span: 10,
    rise,
    thickness,
    outOfPlaneWidth: 1,
    voussoirCount: 21,
  });
}

void test("elliptical inward offsets reject a high arch whose intrados develops a cusp", () => {
  const minimumRadius = ellipticalMinimumRadius({
    span: 10,
    rise: 15,
    springingAngleDegrees: 85,
  });
  assert.ok(minimumRadius > 1.2 && minimumRadius < 1.3);
  assert.throws(() => ellipseGeometry(15, 85, 1.5), /minimum radius of curvature/);
});

void test("flat elliptical extrados offsets use the springing minimum radius", () => {
  const minimumRadius = ellipticalMinimumRadius({
    span: 10,
    rise: 2,
    springingAngleDegrees: 60,
  });
  assert.ok(Math.abs(minimumRadius - 2.082465265) <= 1e-9);

  const geometry = ellipseGeometry(2, 60, 1.8);
  const springing = evaluateMasonryArchCurveAtStation(geometry, 0);
  assert.ok(springing.arcLengthJacobian.intrados > 0);
  assert.ok(Math.abs(springing.arcLengthJacobian.intrados - (1 - 1.8 / minimumRadius)) <= 1e-10);
});

void test("thin high and flat elliptical offsets retain positive Jacobians throughout", () => {
  for (const geometry of [ellipseGeometry(15, 85, 1.1), ellipseGeometry(2, 60, 1.8)]) {
    for (let index = 0; index <= 200; index += 1) {
      const station = (geometry.totalReferenceArcLength * index) / 200;
      const sample = evaluateMasonryArchCurveAtStation(geometry, station);
      assert.ok(sample.arcLengthJacobian.intrados > 0);
      assert.ok(sample.arcLengthJacobian.centerline > 0);
      assert.ok(sample.arcLengthJacobian.extrados > 0);
    }
  }
});

void test("elliptical inward offsets are accepted immediately below and rejected above the cusp", () => {
  const minimumRadius = ellipticalMinimumRadius({
    span: 10,
    rise: 15,
    springingAngleDegrees: 85,
  });
  assert.doesNotThrow(() => ellipseGeometry(15, 85, minimumRadius * (1 - 1e-6)));
  assert.throws(
    () => ellipseGeometry(15, 85, minimumRadius * (1 + 1e-6)),
    /minimum radius of curvature/,
  );
});

void test("circular reference profiles retain their established offset limit", () => {
  const input = {
    kind: "simplified-symmetric" as const,
    referenceCurve: "extrados" as const,
    profile: { type: "circular" as const },
    span: 10,
    rise: 5,
    outOfPlaneWidth: 1,
    voussoirCount: 21,
  };
  assert.doesNotThrow(() => buildSimplifiedMasonryArchGeometry({ ...input, thickness: 4.999 }));
  assert.throws(
    () => buildSimplifiedMasonryArchGeometry({ ...input, thickness: 5 }),
    /minimum radius of curvature/,
  );
});
