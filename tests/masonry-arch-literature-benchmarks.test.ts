import assert from "node:assert/strict";
import test from "node:test";

import { rectangularNoTensionCompressionDomain2D } from "structural-checks-ts-migration-workspace";
import {
  createMasonryArch,
  evaluateMasonryArchBondedSectionDomain,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function close(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}.`,
  );
}

void test("D'Ambrisi 2015 Eq. (6) finite-compression domain is reproduced exactly", () => {
  // D'Ambrisi et al., Composites Part B 75 (2015), Eq. (6),
  // DOI 10.1016/j.compositesb.2015.01.024. Paper half-width B = 2.75 m,
  // arch thickness t = 0.60 m, and design compression strength fd = 4.74 MPa.
  const input = {
    interfaceLength: 0.6,
    outOfPlaneWidth: 2.75,
    compressiveStrength: 4740,
  };
  const atOneMegaNewton = rectangularNoTensionCompressionDomain2D({
    ...input,
    normalForce: 1000,
  });
  close(atOneMegaNewton.normalCapacity, 7821);
  close(atOneMegaNewton.momentCapacity, 261.6417337936325, 1e-10);
  close(atOneMegaNewton.eccentricityLimit!, 0.2616417337936325, 1e-13);

  const atPeakMoment = rectangularNoTensionCompressionDomain2D({
    ...input,
    normalForce: 3910.5,
  });
  close(atPeakMoment.momentCapacity, 586.575, 1e-12);
  close(atPeakMoment.eccentricityLimit!, 0.15, 1e-15);

  const zero = rectangularNoTensionCompressionDomain2D({ ...input, normalForce: 0 });
  close(zero.momentCapacity, 0);
  assert.equal(zero.eccentricityLimit, null);

  const fullCompression = rectangularNoTensionCompressionDomain2D({
    ...input,
    normalForce: 7821,
  });
  close(fullCompression.momentCapacity, 0);
  close(fullCompression.eccentricityLimit!, 0);

  assert.throws(
    () => rectangularNoTensionCompressionDomain2D({ ...input, normalForce: 7821.01 }),
    /exceeds the compression-only capacity/,
  );
});

function bondedBenchmarkModel(side: "intrados" | "extrados", finiteCompression: boolean) {
  return createMasonryArch({
    id: `dambrisi-bonded-${side}-${finiteCompression}`,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 0.6,
      outOfPlaneWidth: 2.75,
      voussoirCount: 21,
    },
    interfaces: finiteCompression
      ? { model: "finite-compression", compressiveStrength: 4740, compressionFacetCount: 64 }
      : { model: "heyman" },
    bondedLayers: [
      {
        id: "FRCM",
        family: "frcm",
        side,
        area: 0.001,
        elasticModulus: 200_000_000,
        debondingStrain: 0.0066,
      },
    ],
  });
}

void test("D'Ambrisi 2015 infinite-compression strengthened boundary is reproduced", () => {
  const normalForce = 1000;
  const layerForce = 200_000_000 * 0.001 * 0.0066;
  const intrados = bondedBenchmarkModel("intrados", false);
  const domain = evaluateMasonryArchBondedSectionDomain(intrados, 10, normalForce);
  close(domain.maximumMoment, (normalForce * 0.6) / 2 + layerForce * 0.6, 1e-9);
  close(domain.minimumMoment, -(normalForce * 0.6) / 2, 1e-10);

  const extrados = evaluateMasonryArchBondedSectionDomain(
    bondedBenchmarkModel("extrados", false),
    10,
    normalForce,
  );
  close(extrados.minimumMoment, -((normalForce * 0.6) / 2 + layerForce * 0.6), 1e-9);
  close(extrados.maximumMoment, (normalForce * 0.6) / 2, 1e-10);
});

void test("finite masonry compression and a bonded membrane retain asymmetric M-N capacity", () => {
  const normalForce = 1000;
  const layerForce = 200_000_000 * 0.001 * 0.0066;
  const model = bondedBenchmarkModel("intrados", true);
  const domain = evaluateMasonryArchBondedSectionDomain(model, 10, normalForce);
  const masonry = rectangularNoTensionCompressionDomain2D({
    normalForce: normalForce + layerForce,
    interfaceLength: 0.6,
    outOfPlaneWidth: 2.75,
    compressiveStrength: 4740,
  });
  // The safe 64-facet domain converges from below to the translated exact boundary.
  const exact = masonry.momentCapacity + (layerForce * 0.6) / 2;
  assert.ok(domain.maximumMoment <= exact + 1e-9);
  assert.ok(exact - domain.maximumMoment < 0.5);
  assert.ok(domain.maximumMoment > Math.abs(domain.minimumMoment));
});

void test("unanchored bonded ends expose their explicit linear development ramp", () => {
  const base = bondedBenchmarkModel("intrados", false);
  const model = createMasonryArch({
    id: "bond-development",
    units: base.sourceUnits,
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 0.6,
      outOfPlaneWidth: 2.75,
      voussoirCount: 21,
    },
    bondedLayers: [
      {
        id: "FRCM-unanchored",
        family: "frcm",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        debondingStrain: 0.0066,
        terminations: {
          left: { type: "unanchored", developmentLength: base.geometry.totalReferenceArcLength },
          right: { type: "anchored" },
        },
      },
    ],
  });
  const left = evaluateMasonryArchBondedSectionDomain(model, 0, 1000);
  assert.equal(left.contributions.length, 0);
  const crownIndex = model.geometry.interfaces.reduce(
    (selected, item, index) =>
      Math.abs(item.normalizedStation - 0.5) <
      Math.abs(model.geometry.interfaces[selected]!.normalizedStation - 0.5)
        ? index
        : selected,
    0,
  );
  const crown = evaluateMasonryArchBondedSectionDomain(model, crownIndex, 1000);
  close(
    crown.contributions[0]!.developmentFactor,
    model.geometry.interfaces[crownIndex]!.normalizedStation,
    2e-12,
  );
});
