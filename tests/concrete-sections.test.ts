import assert from "node:assert/strict";
import test from "node:test";

import {
  CircularSection,
  CompositeSection,
  CompositeSectionComponent,
  PolygonSection,
  RectangularSection,
  ReinforcedConcreteSection,
  ReinforcementBar,
  TSection,
  calculateSectionMassProperties,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
  rotateSecondMoments,
} from "../dist/index.js";

const units = { force: "N", length: "mm" } as const;

function approx(actual: number, expected: number, tolerance = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

void test("rectangular section computes geometric properties", () => {
  const section = new RectangularSection({
    width: 220,
    height: 250,
    units,
  });

  approx(section.area, 55_000);
  approx(section.inertiaY ?? Number.NaN, (220 * 250 ** 3) / 12);
  approx(section.elasticSectionModulusY ?? Number.NaN, (section.inertiaY ?? 0) / 125);
});

void test("circular section computes area and inertia", () => {
  const section = new CircularSection({
    diameter: 200,
    units,
  });

  approx(section.area, Math.PI * 100 ** 2);
  approx(section.inertiaY ?? Number.NaN, (Math.PI * 100 ** 4) / 4);
});

void test("T-section computes centroid and inertia", () => {
  const section = new TSection({
    flangeWidth: 300,
    flangeThickness: 80,
    webWidth: 120,
    webHeight: 220,
    units,
  });

  assert.ok((section.centroidY ?? 0) > 0);
  assert.ok((section.inertiaY ?? 0) > (section.inertiaZ ?? 0));
  assert.equal(section.metadata.shape, "t-section");
});

void test("polygon section computes the same properties as an equivalent rectangle", () => {
  const section = new PolygonSection({
    points: [
      { y: 0, z: 0 },
      { y: 0, z: 220 },
      { y: 250, z: 220 },
      { y: 250, z: 0 },
    ],
    units,
  });

  approx(section.area, 55_000);
  approx(section.centroidY ?? Number.NaN, 125);
  approx(section.centroidZ ?? Number.NaN, 110);
  approx(section.inertiaY ?? Number.NaN, (220 * 250 ** 3) / 12);
  approx(section.inertiaZ ?? Number.NaN, (250 * 220 ** 3) / 12);
  approx(section.productOfInertiaYZ ?? Number.NaN, 0);
});

void test("section mass properties resolve principal axes for an unsymmetric polygon", () => {
  const section = new PolygonSection({
    points: [
      { y: 0, z: 0 },
      { y: 0, z: 200 },
      { y: 80, z: 160 },
      { y: 220, z: 60 },
      { y: 180, z: 0 },
    ],
    units,
  });
  const properties = calculateSectionMassProperties(section);

  assert.ok(Math.abs(properties.productOfInertiaYZ) > 0);
  assert.ok(properties.principalInertiaMajor >= properties.principalInertiaMinor);

  const rotated = rotateSecondMoments({
    inertiaY: properties.inertiaY,
    inertiaZ: properties.inertiaZ,
    productOfInertiaYZ: properties.productOfInertiaYZ,
    alpha: properties.principalAxisAngle,
  });

  approx(rotated.productOfInertiaYZ, 0);
});

void test("composite section computes transformed properties", () => {
  const core = new RectangularSection({ width: 300, height: 500, units });
  const plate = new RectangularSection({ width: 300, height: 20, units });
  const section = new CompositeSection({
    name: "Transformed section",
    units,
    components: [
      new CompositeSectionComponent({
        name: "Core",
        section: core,
        centroidY: 250,
        modularRatio: 1,
        role: "core",
        units,
      }),
      new CompositeSectionComponent({
        name: "Plate",
        section: plate,
        centroidY: 510,
        modularRatio: 8,
        role: "plate",
        units,
      }),
    ],
  });

  assert.ok(section.area > core.area);
  assert.ok((section.inertiaY ?? 0) > (core.inertiaY ?? 0));
  assert.equal(section.getComponent("plate")?.name, "Plate");
});

void test("reinforced-concrete section aggregates concrete and positioned bars", () => {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC beam section",
    concreteSection: new RectangularSection({ width: 300, height: 500, units }),
    reinforcementBars: [
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 50,
        z: 60,
        units,
      }),
      new ReinforcementBar({
        diameter: 16,
        grade: "B450C",
        material: reinforcementMaterial,
        y: 450,
        z: 240,
        units,
      }),
    ],
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  approx(section.area, 150_000);
  assert.equal(section.reinforcementBars.length, 2);
  assert.ok(section.totalReinforcementArea() > 0);
  assert.ok((section.transformedSection.inertiaY ?? 0) > 0);
  assert.deepEqual(section.getBoundingBox(), {
    minY: 0,
    maxY: 500,
    minZ: 0,
    maxZ: 300,
  });
});
