import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimePorePressureField {
  waterElevationAt(x: number): number | null;
  porePressureAt(point: Record<string, unknown>): number;
  breakpointsAtX(x: number): number[];
  toJSON(): Record<string, unknown>;
}

interface RuntimeGroundProfile {
  toJSON(): Record<string, unknown>;
}

interface RuntimePorePressureModule {
  PorePressureField2D: {
    new (options: Record<string, unknown>): RuntimePorePressureField;
    fromGroundProfile(options: Record<string, unknown>): RuntimePorePressureField;
  };
  GroundProfile: new (options: Record<string, unknown>) => RuntimeGroundProfile;
}

function isRuntimeModule(value: unknown): value is RuntimePorePressureModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "PorePressureField2D") === "function" &&
    typeof Reflect.get(value, "GroundProfile") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

void test("PorePressureField2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("PorePressureField2D exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.PorePressureField2D, typescriptModuleValue.PorePressureField2D);
  const units = { force: "kN", length: "m" };
  const hydrostaticOptions: Record<string, unknown> = {
    id: "hydro-α",
    name: "Hydrostatic β",
    model: "hydrostatic-horizontal",
    waterTableElevation: 5,
    waterUnitWeight: 9.81,
    units,
    metadata: { label: "orizzontale γ", unicode: "αβγ" },
  };
  const sourceHydrostatic = new sourceModuleValue.PorePressureField2D(hydrostaticOptions);
  const typescriptHydrostatic = new typescriptModuleValue.PorePressureField2D(hydrostaticOptions);
  assert.equal(typescriptHydrostatic.waterElevationAt(2), sourceHydrostatic.waterElevationAt(2));
  assert.equal(
    typescriptHydrostatic.porePressureAt({ x: 2, z: 1 }),
    sourceHydrostatic.porePressureAt({ x: 2, z: 1 }),
  );
  assert.deepEqual(typescriptHydrostatic.breakpointsAtX(2), sourceHydrostatic.breakpointsAtX(2));
  assert.deepEqual(typescriptHydrostatic.toJSON(), sourceHydrostatic.toJSON());
  assert.equal(
    JSON.stringify(typescriptHydrostatic.toJSON()),
    JSON.stringify(sourceHydrostatic.toJSON()),
  );

  const phreaticOptions: Record<string, unknown> = {
    id: "phreatic-δ",
    model: "phreatic-line",
    phreaticLine: {
      points: [
        { x: 0, z: 6 },
        { x: 5, z: 5 },
        { x: 10, z: 4 },
      ],
      metadata: { label: "linea ε" },
    },
    waterUnitWeight: 10,
    outsideDomain: "constant",
    units,
  };
  const sourcePhreatic = new sourceModuleValue.PorePressureField2D(phreaticOptions);
  const typescriptPhreatic = new typescriptModuleValue.PorePressureField2D(phreaticOptions);
  for (const x of [-2, 2.5, 12]) {
    assert.equal(typescriptPhreatic.waterElevationAt(x), sourcePhreatic.waterElevationAt(x));
    assert.equal(
      typescriptPhreatic.porePressureAt({ x, z: 1 }),
      sourcePhreatic.porePressureAt({ x, z: 1 }),
    );
  }
  assert.deepEqual(typescriptPhreatic.toJSON(), sourcePhreatic.toJSON());

  const gridOptions: Record<string, unknown> = {
    id: "grid-ζ",
    model: "assigned-grid",
    assignedGrid: {
      xCoordinates: [0, 2, 4],
      zCoordinates: [0, 2, 4],
      values: [
        [0, 10, 20],
        [20, 30, 40],
        [40, 50, 60],
      ],
      metadata: { label: "griglia η" },
    },
    outsideDomain: "constant",
    units,
  };
  const sourceGrid = new sourceModuleValue.PorePressureField2D(gridOptions);
  const typescriptGrid = new typescriptModuleValue.PorePressureField2D(gridOptions);
  assert.equal(
    typescriptGrid.porePressureAt({ x: 1, z: 1 }),
    sourceGrid.porePressureAt({ x: 1, z: 1 }),
  );
  assert.equal(
    typescriptGrid.porePressureAt({ x: -1, z: 5 }),
    sourceGrid.porePressureAt({ x: -1, z: 5 }),
  );
  assert.deepEqual(typescriptGrid.breakpointsAtX(1), sourceGrid.breakpointsAtX(1));
  assert.deepEqual(typescriptGrid.toJSON(), sourceGrid.toJSON());

  const profileOptions: Record<string, unknown> = {
    id: "ground-profile-θ",
    groundSurfaceElevation: 10,
    materials: [
      {
        id: "sand",
        name: "Sand",
        unitWeight: { bulk: 18, saturated: 20 },
        parameterSets: [
          {
            id: "sand-characteristic",
            basis: "characteristic",
            drainage: "drained",
            strength: { model: "mohr-coulomb-effective", frictionAngle: 30, cohesion: 0 },
            provenance: { source: "ground profile oracle" },
          },
        ],
        angleUnits: "deg",
        units,
      },
    ],
    layers: [{ id: "sand-layer", topElevation: 10, bottomElevation: 0, materialId: "sand" }],
    groundwater: { model: "hydrostatic", waterTableElevation: 4, waterUnitWeight: 9.81 },
    units,
  };
  const sourceProfile = new sourceModuleValue.GroundProfile(profileOptions);
  const typescriptProfile = new typescriptModuleValue.GroundProfile(profileOptions);
  const sourceFromProfile = sourceModuleValue.PorePressureField2D.fromGroundProfile({
    profile: sourceProfile,
  });
  const typescriptFromProfile = typescriptModuleValue.PorePressureField2D.fromGroundProfile({
    profile: typescriptProfile,
  });
  assert.deepEqual(typescriptFromProfile.toJSON(), sourceFromProfile.toJSON());
  assert.equal(
    typescriptFromProfile.porePressureAt({ x: 0, z: 0 }),
    sourceFromProfile.porePressureAt({ x: 0, z: 0 }),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    { id: "invalid", model: "unsupported", units },
    {
      id: "invalid-line",
      model: "phreatic-line",
      phreaticLine: { points: [{ x: 0, z: 5 }], metadata: {} },
      units,
    },
    {
      id: "invalid-grid",
      model: "assigned-grid",
      assignedGrid: {
        xCoordinates: [0, 0],
        zCoordinates: [0, 1],
        values: [
          [1, 1],
          [1, 1],
        ],
      },
      units,
    },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => new sourceModuleValue.PorePressureField2D(errorInput));
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.PorePressureField2D(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
  const sourceOutsideError = errorSnapshot(() =>
    new sourceModuleValue.PorePressureField2D({
      ...phreaticOptions,
      outsideDomain: "error",
    }).waterElevationAt(-1),
  );
  const typescriptOutsideError = errorSnapshot(() =>
    new typescriptModuleValue.PorePressureField2D({
      ...phreaticOptions,
      outsideDomain: "error",
    }).waterElevationAt(-1),
  );
  assert.deepEqual(typescriptOutsideError, sourceOutsideError);
});
