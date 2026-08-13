import assert from "node:assert/strict";
import test from "node:test";

import { rectangularNoTensionCompressionDomain2D } from "structural-checks-ts-migration-workspace";
import {
  createMasonryArch,
  evaluateMasonryArchBondedSectionDomain,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function close(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}.`);
}

void test("D'Ambrisi 2015 finite-compression domain is reproduced", () => {
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
});

void test("bonded-layer section domain remains available through the arch assembly", () => {
  const model = createMasonryArch({
    id: "bonded-domain",
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
    interfaceLaw: {
      response: "rigid-plastic",
      normal: { type: "no-tension", compressiveStrength: 4740 },
      tangential: { type: "frictionless" },
    },
    bondedLayers: [
      {
        id: "FRCM",
        family: "frcm",
        side: "intrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        debondingStrain: 0.0066,
      },
    ],
  });
  const domain = evaluateMasonryArchBondedSectionDomain(model, 10, 1000);
  assert.ok(domain.facets.length > 4);
  assert.ok(domain.contributions[0]!.capacity > 0);
});
