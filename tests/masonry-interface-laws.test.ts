import assert from "node:assert/strict";
import test from "node:test";

import {
  createUnitResolver,
  normalizeMasonryInterfaceLaw,
} from "structural-checks-ts-migration-workspace";

const resolver = createUnitResolver({ force: "kN", length: "m" }, { force: "N", length: "m" });

void test("general masonry law normalizes Coulomb friction independently from an arch", () => {
  const law = normalizeMasonryInterfaceLaw(
    {
      response: "rigid-plastic",
      normal: { type: "no-tension", compressiveStrength: 2_000 },
      tangential: {
        type: "coulomb",
        frictionCoefficient: 0.6,
        cohesion: 10,
        flowRule: { type: "non-associated", dilationAngle: 0 },
      },
    },
    resolver,
    "wall.interfaceLaw",
  );
  assert.equal(law.response, "rigid-plastic");
  assert.equal(law.compressiveStrength, 2_000_000);
  assert.equal(law.friction?.cohesion, 10_000);
  assert.equal(law.friction?.flowRule.dilationAngle, 0);
});

void test("general masonry law validates perfectly-plastic compression", () => {
  assert.throws(
    () =>
      normalizeMasonryInterfaceLaw(
        {
          response: "deformable",
          normal: {
            type: "elastic-no-tension",
            elasticModulus: 1_000,
            characteristicLength: 0.2,
            postCrushingBehavior: "perfectly-plastic",
          },
          tangential: {
            type: "elastic-coulomb",
            shearModulus: 500,
            characteristicLength: 0.2,
            frictionCoefficient: 0.5,
          },
        },
        resolver,
        "wall.interfaceLaw",
      ),
    /requires compressiveStrength/,
  );
});
