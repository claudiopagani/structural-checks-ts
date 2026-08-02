// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  projectLineActionStateToResistanceAxes,
  projectMemberActionStatesToResistanceAxes,
  projectSectionCutStateToResistanceAxes,
  projectShellResultantStateToResistanceAxes,
  projectSupportReactionStateToResistanceAxes,
  validateFemEntityMappingContract,
  validateGlobalFemModelContract,
  validateResistanceAxisTransformation,
  validateSurfaceResistanceAxisTransformation,
} from "../dist/index.js";
import type { FemEntityMappingContract, GlobalFemModelContract } from "../dist/index.js";

interface ValidatedFixture {
  readonly mapping: FemEntityMappingContract;
  readonly model: GlobalFemModelContract;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFixtureFactory(value: unknown): value is () => unknown {
  return typeof value === "function";
}

function loadValidatedFixture(): ValidatedFixture {
  const fixtureModuleUnknown: unknown = fixtureModule;
  assert.ok(isRecord(fixtureModuleUnknown));
  const createFixture = fixtureModuleUnknown.createGlobalFemBuildingFixture;
  if (!isFixtureFactory(createFixture)) {
    throw new Error("The fixture module must export createGlobalFemBuildingFixture.");
  }
  const fixture = createFixture();
  assert.ok(isRecord(fixture));
  const modelValidation = validateGlobalFemModelContract(fixture.model);
  assert.equal(modelValidation.ok, true);
  assert.ok(modelValidation.value);
  const mappingValidation = validateFemEntityMappingContract(fixture.mapping, {
    model: modelValidation.value,
  });
  assert.equal(mappingValidation.ok, true);
  assert.ok(mappingValidation.value);
  return { model: modelValidation.value, mapping: mappingValidation.value };
}

const fixtureModule: unknown = await import(
  pathToFileURL(path.join(import.meta.dirname, "fixtures", "globalFemBuildingFixture.ts")).href
);

const quarterTurnAboutLongitudinalAxis = [
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
];

void test("line forces and moments use one declared proper-axis transformation", () => {
  const result = projectLineActionStateToResistanceAxes({
    state: {
      lineElementId: "E1",
      coordinateSystem: "element-local",
      localAxes: {
        x: { x: 1, y: 0, z: 0 },
        y: { x: 0, y: 1, z: 0 },
        z: { x: 0, y: 0, z: 1 },
      },
      reference: { combinationId: "ULS-1" },
      station: { xi: 0.5 },
      actions: { N: -10, Vy: 20, Vz: 30, T: 4, My: 5, Mz: 6 },
    },
    mapping: {
      lineElementId: "E1",
      sourceCoordinateSystem: "element-local",
      resistanceCoordinateSystemId: "SECTION-1",
      sourceToResistance: quarterTurnAboutLongitudinalAxis,
    },
  });

  assert.deepEqual(result.resistanceActions, {
    axialForce: -10,
    shearY: 30,
    shearZ: -20,
    torsion: 4,
    momentY: 6,
    momentZ: -5,
  });
  assert.deepEqual(result.reference, { combinationId: "ULS-1" });
  assert.deepEqual(result.resistanceCoordinateSystem.axes, {
    x: { x: 1, y: 0, z: 0 },
    y: { x: 0, y: 0, z: 1 },
    z: { x: 0, y: -1, z: 0 },
  });
});

void test("axis mapping rejects scaling, skew and left-handed reflections", () => {
  assert.throws(
    () =>
      validateResistanceAxisTransformation([
        [2, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]),
    /orthonormal/,
  );
  assert.throws(
    () =>
      validateResistanceAxisTransformation([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, -1],
      ]),
    /right-handed/,
  );
});

void test("member projection requires one mapping for every assigned element", () => {
  assert.throws(
    () =>
      projectMemberActionStatesToResistanceAxes({
        member: {
          id: "M1",
          lineElementIds: ["E1", "E2"],
          lineActionMappings: [
            {
              lineElementId: "E1",
              sourceCoordinateSystem: "element-local",
              resistanceCoordinateSystemId: "SECTION-1",
              sourceToResistance: quarterTurnAboutLongitudinalAxis,
            },
          ],
        },
        states: [],
      }),
    /no resistance-axis mapping for E2/,
  );
});

void test("section-cut mapping resolves axial force along the declared wall axis", () => {
  const result = projectSectionCutStateToResistanceAxes({
    state: {
      sectionCutId: "CUT-1",
      coordinateSystem: "section-cut-local",
      reference: { combinationId: "ULS-1" },
      resultants: { Fx: 10, Fy: 100, Fz: 20, Mx: 30, My: 40, Mz: 50 },
    },
    mapping: {
      sectionCutId: "CUT-1",
      sourceCoordinateSystem: "section-cut-local",
      resistanceCoordinateSystemId: "WALL-SECTION",
      sourceToResistance: [
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      ],
    },
  });

  assert.deepEqual(result.resistanceResultants, {
    forceX: 10,
    forceY: -20,
    axialForce: 100,
    momentX: 30,
    momentY: -50,
    torsion: 40,
  });
});

void test("mapping contract rejects an incomplete declared axis mapping", () => {
  const fixture = loadValidatedFixture();
  const firstMember = fixture.mapping.members[0];
  assert.ok(firstMember);
  const mapping = {
    ...fixture.mapping,
    members: fixture.mapping.members.map((member, index) =>
      index === 0 ? { ...member, lineElementIds: [...member.lineElementIds, "COL-B-1"] } : member,
    ),
  };

  const validation = validateFemEntityMappingContract(mapping, {
    model: fixture.model,
  });

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "FEM_MAPPING_INCOMPLETE" && error.message.includes("COL-B-1"),
    ),
  );
});

void test("shell tensors and transverse shear rotate into declared slab axes", () => {
  const result = projectShellResultantStateToResistanceAxes({
    state: {
      shellElementId: "S1",
      coordinateSystem: "element-local",
      localAxes: {
        x: { x: 1, y: 0, z: 0 },
        y: { x: 0, y: 1, z: 0 },
        z: { x: 0, y: 0, z: 1 },
      },
      components: {
        Nx: 10,
        Ny: 20,
        Nxy: 3,
        Mx: 30,
        My: 40,
        Mxy: 4,
        Vx: 5,
        Vy: 6,
      },
    },
    mapping: {
      shellElementId: "S1",
      sourceCoordinateSystem: "element-local",
      resistanceCoordinateSystemId: "SLAB-AXES",
      sourceToResistance: [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
      ],
    },
  });

  assert.deepEqual(result.resistanceResultants, {
    Nx: 20,
    Ny: 10,
    Nxy: -3,
    Mx: 40,
    My: 30,
    Mxy: -4,
    Vx: 6,
    Vy: -5,
  });
});

void test("shell-resultant mapping must preserve the positive surface normal", () => {
  assert.throws(
    () =>
      validateSurfaceResistanceAxisTransformation([
        [1, 0, 0],
        [0, -1, 0],
        [0, 0, -1],
      ]),
    /positive surface normal/,
  );
});

void test("slab mapping contract rejects missing shell resistance axes", () => {
  const fixture = loadValidatedFixture();
  const firstSlab = fixture.mapping.slabs[0];
  assert.ok(firstSlab);
  const mapping = {
    ...fixture.mapping,
    slabs: fixture.mapping.slabs.map((slab, index) =>
      index === 0 ? { ...slab, shellElementIds: [...slab.shellElementIds, "SLAB-S2"] } : slab,
    ),
  };

  const validation = validateFemEntityMappingContract(mapping, {
    model: fixture.model,
  });

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "FEM_MAPPING_INCOMPLETE" && error.message.includes("SLAB-S2"),
    ),
  );
});

void test("support reactions rotate explicitly into foundation axes", () => {
  const result = projectSupportReactionStateToResistanceAxes({
    state: {
      nodeId: "A0",
      coordinateSystem: "global",
      forces: { x: 1, y: 2, z: 3 },
      moments: { x: 4, y: 5, z: 6 },
    },
    mapping: {
      supportNodeId: "A0",
      sourceCoordinateSystem: "global",
      resistanceCoordinateSystemId: "FOUNDATION-AXES",
      sourceToResistance: [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1],
      ],
    },
  });

  assert.deepEqual(result.resistanceReaction, {
    forceX: 2,
    forceY: -1,
    forceZ: 3,
    momentX: 5,
    momentY: -4,
    momentZ: 6,
  });
});

void test("foundation mapping requires reaction axes for every support", () => {
  const fixture = loadValidatedFixture();
  const foundations = fixture.mapping.foundations ?? [];
  const firstFoundation = foundations[0];
  assert.ok(firstFoundation);
  const mapping = {
    ...fixture.mapping,
    foundations: foundations.map((foundation, index) =>
      index === 0 ? { ...foundation, supportReactionMappings: [] } : foundation,
    ),
  };

  const validation = validateFemEntityMappingContract(mapping, {
    model: fixture.model,
  });

  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some(
      (error) => error.code === "FEM_MAPPING_INCOMPLETE" && error.message.includes("A0"),
    ),
  );
});
