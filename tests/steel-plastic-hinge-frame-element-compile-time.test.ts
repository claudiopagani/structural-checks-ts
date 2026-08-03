import assert from "node:assert/strict";
import test from "node:test";

import {
  SteelPlasticHingeFrameElement2D,
  type SteelPlasticHingeFrameElement2DOptions,
} from "../dist/applications/steel-frames/analysis/SteelPlasticHingeFrameElement2D.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type SteelPlasticHingeFrameElementIsStrict = AssertFalse<
  IsAny<typeof SteelPlasticHingeFrameElement2D>
>;

function useSteelPlasticHingeFrameElementDeclarations(
  options: SteelPlasticHingeFrameElement2DOptions,
): SteelPlasticHingeFrameElement2D {
  return new SteelPlasticHingeFrameElement2D(options);
}

void test("SteelPlasticHingeFrameElement2D exposes strict typed consumers", () => {
  const strictTypeProof: SteelPlasticHingeFrameElementIsStrict = false;
  assert.equal(strictTypeProof, false);

  const element = useSteelPlasticHingeFrameElementDeclarations({
    id: "element",
    startNode: { id: "A", x: 0, y: 0, units: { force: "N", length: "mm" } },
    endNode: { id: "B", x: 1000, y: 0, units: { force: "N", length: "mm" } },
    section: {
      area: 2600,
      inertiaY: 1.94e7,
      plasticSectionModulusY: 221000,
    },
    material: { elasticModulus: 210000, fyd: 261.9 },
  });

  assert.equal(element.id, "element");
  assert.equal(element.sectionOrientation.axis, "y");
  assert.equal(element.plasticMomentStart, element.plasticMomentEnd);
  assert.equal(element.plasticMomentCapacity("start"), element.plasticMomentStart);
});
