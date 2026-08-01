import assert from "node:assert/strict";
import test from "node:test";

import {
  RectangularSection,
  ReinforcementBar,
  TSection,
  createLongitudinalReinforcementLayout,
  createNTC2018ReinforcementSteelMaterial,
  type ReinforcementGrade,
} from "../dist/index.js";

const units = { force: "N", length: "mm" } as const;

void test("reinforcement bar resolves area and distributed area", () => {
  const bar = new ReinforcementBar({
    diameter: 6,
    grade: "B450C",
    material: { id: "steel" },
    units,
  });

  assert.ok(Math.abs(bar.area - (Math.PI * 6 ** 2) / 4) <= 1e-6);
  assert.ok(Math.abs(bar.distributedArea(1800, 100) - 508.93800988154646) <= 1e-6);
});

void test("longitudinal layout creates top and bottom groups for rectangular sections", () => {
  const section = new RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const material = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const layout = createLongitudinalReinforcementLayout({
    section,
    material,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 20,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 3,
      cover: 35,
    },
  });

  assert.equal(layout.reinforcementBars.length, 5);
  assert.deepEqual(
    layout.longitudinalReinforcementGroups.map((group) => group.id),
    ["bottom-main", "top-main"],
  );
  assert.equal(layout.longitudinalReinforcementGroups[0]?.face, "bottom");
  assert.equal(layout.longitudinalReinforcementGroups[1]?.face, "top");
  assert.equal(layout.reinforcementBars[0]?.y, 50);
  assert.equal(layout.reinforcementBars[1]?.z, 250);
  assert.equal(layout.reinforcementBars[2]?.y, 457);
});

void test("longitudinal layout places bottom bars in the web of T-sections", () => {
  const section = new TSection({
    flangeWidth: 800,
    flangeThickness: 120,
    webWidth: 300,
    webHeight: 500,
    units,
  });
  const layout = createLongitudinalReinforcementLayout({
    section,
    units,
    bottom: {
      id: "bottom-main",
      diameter: 20,
      count: 2,
      cover: 40,
    },
    top: {
      id: "top-main",
      diameter: 16,
      count: 2,
      cover: 35,
    },
  });
  const bottomBars = layout.reinforcementBars.filter((bar) => bar.id?.startsWith("bottom-main"));
  const topBars = layout.reinforcementBars.filter((bar) => bar.id?.startsWith("top-main"));

  assert.equal(bottomBars[0]?.z, 300);
  assert.equal(bottomBars[1]?.z, 500);
  assert.equal(topBars[0]?.z, 43);
  assert.equal(topBars[1]?.z, 757);
});

void test("reinforcement models reject unsupported or incomplete input", () => {
  assert.throws(
    () =>
      new ReinforcementBar({
        diameter: 16,
        grade: "B500B" as ReinforcementGrade,
        units,
      }),
    /Unsupported reinforcement grade/u,
  );
  assert.throws(
    () =>
      createLongitudinalReinforcementLayout({
        section: new RectangularSection({ width: 300, height: 500, units }),
        bottom: { count: 2, diameter: 16, cover: 0 },
      }),
    /positive cover/u,
  );
});
