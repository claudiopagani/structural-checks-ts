import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeGroundSectionZone {
  id: string;
  materialId: string;
}

interface RuntimeGroundSection {
  surfaceElevationAt(x: number): number;
  getZonesAtPoint(
    point: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): RuntimeGroundSectionZone[];
  getZoneAtPoint(
    point: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): RuntimeGroundSectionZone | null;
  getMaterialIdAtPoint(
    point: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): string | null;
  isBelowGroundSurface(point: Record<string, unknown>): boolean;
  toJSON(): Record<string, unknown>;
}

interface RuntimeGroundProfile {
  toJSON(): Record<string, unknown>;
}

interface RuntimeGroundSectionModule {
  GroundSection2D: {
    new (options: Record<string, unknown>): RuntimeGroundSection;
    fromGroundProfile(options: Record<string, unknown>): RuntimeGroundSection;
  };
  GroundProfile: new (options: Record<string, unknown>) => RuntimeGroundProfile;
}

function isRuntimeModule(value: unknown): value is RuntimeGroundSectionModule {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "GroundSection2D") === "function" &&
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

void test("GroundSection2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("GroundSection2D exports do not expose the expected API.");
  }

  assert.notEqual(sourceModuleValue.GroundSection2D, typescriptModuleValue.GroundSection2D);
  const units = { force: "kN", length: "m" };
  const options: Record<string, unknown> = {
    id: "section-\u03B1",
    name: "Sezione \u03B2",
    surface: {
      points: [
        { x: 0, z: 10 },
        { x: 5, z: 9 },
        { x: 10, z: 8 },
      ],
      metadata: { label: "superficie γ" },
    },
    zones: [
      {
        id: "upper-δ",
        materialId: "sand-ε",
        polygon: [
          { x: 0, z: 5 },
          { x: 10, z: 5 },
          { x: 10, z: 8 },
          { x: 0, z: 10 },
        ],
        metadata: { label: "sabbia ζ" },
      },
      {
        id: "lower-η",
        materialId: "clay-θ",
        polygon: [
          { x: 0, z: 0 },
          { x: 10, z: 0 },
          { x: 10, z: 5 },
          { x: 0, z: 5 },
        ],
        metadata: { label: "argilla ι" },
      },
    ],
    units,
    metadata: { datum: "quota κ", unicode: "λμν" },
  };
  const sourceSection = new sourceModuleValue.GroundSection2D(options);
  const typescriptSection = new typescriptModuleValue.GroundSection2D(options);

  for (const x of [0, 2.5, 5, 7.5, 10]) {
    assert.equal(typescriptSection.surfaceElevationAt(x), sourceSection.surfaceElevationAt(x));
  }
  for (const point of [
    { x: 5, z: 7 },
    { x: 5, z: 2 },
    { x: 5, z: -1 },
  ]) {
    assert.deepEqual(
      typescriptSection.getZonesAtPoint(point),
      sourceSection.getZonesAtPoint(point),
    );
    assert.equal(
      typescriptSection.getMaterialIdAtPoint(point),
      sourceSection.getMaterialIdAtPoint(point),
    );
    assert.equal(
      typescriptSection.isBelowGroundSurface(point),
      sourceSection.isBelowGroundSurface(point),
    );
  }
  assert.deepEqual(
    typescriptSection.getZoneAtPoint({ x: 5, z: 5 }, { requireUnique: false }),
    sourceSection.getZoneAtPoint({ x: 5, z: 5 }, { requireUnique: false }),
  );
  assert.deepEqual(typescriptSection.toJSON(), sourceSection.toJSON());
  assert.equal(JSON.stringify(typescriptSection.toJSON()), JSON.stringify(sourceSection.toJSON()));

  const profileOptions: Record<string, unknown> = {
    id: "profile-ξ",
    name: "Profilo ο",
    groundSurfaceElevation: 10,
    materials: [
      {
        id: "sand",
        name: "Sand",
        unitWeight: { bulk: 18, saturated: 20 },
        parameterSets: [
          {
            id: "characteristic",
            basis: "characteristic",
            drainage: "drained",
            strength: {
              model: "mohr-coulomb-effective",
              frictionAngle: 30,
              cohesion: 0,
            },
          },
        ],
        angleUnits: "deg",
        units,
      },
    ],
    layers: [
      {
        id: "layer-π",
        topElevation: 10,
        bottomElevation: 0,
        materialId: "sand",
        metadata: { label: "strato ρ" },
      },
    ],
    units,
  };
  const sourceProfile = new sourceModuleValue.GroundProfile(profileOptions);
  const typescriptProfile = new typescriptModuleValue.GroundProfile(profileOptions);
  const sourceFromProfile = sourceModuleValue.GroundSection2D.fromGroundProfile({
    profile: sourceProfile,
    id: "section-profile-σ",
    minimumX: -2,
    maximumX: 3,
    metadata: { label: "estruso τ" },
  });
  const typescriptFromProfile = typescriptModuleValue.GroundSection2D.fromGroundProfile({
    profile: typescriptProfile,
    id: "section-profile-σ",
    minimumX: -2,
    maximumX: 3,
    metadata: { label: "estruso τ" },
  });
  assert.deepEqual(typescriptFromProfile.toJSON(), sourceFromProfile.toJSON());
  assert.equal(
    JSON.stringify(typescriptFromProfile.toJSON()),
    JSON.stringify(sourceFromProfile.toJSON()),
  );

  const errorInputs: readonly Record<string, unknown>[] = [
    { id: "missing-units", surface: options.surface, zones: options.zones },
    {
      id: "invalid-surface",
      surface: {
        points: [
          { x: 0, z: 10 },
          { x: 0, z: 9 },
        ],
      },
      zones: options.zones,
      units,
    },
    {
      ...options,
      zones: [
        {
          id: "bow-tie",
          materialId: "sand",
          polygon: [
            { x: 0, z: 0 },
            { x: 10, z: 10 },
            { x: 0, z: 10 },
            { x: 10, z: 0 },
          ],
        },
      ],
    },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(() => new sourceModuleValue.GroundSection2D(errorInput));
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.GroundSection2D(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }
  const sourceBoundaryError = errorSnapshot(() => sourceSection.getZoneAtPoint({ x: 5, z: 5 }));
  const typescriptBoundaryError = errorSnapshot(() =>
    typescriptSection.getZoneAtPoint({ x: 5, z: 5 }),
  );
  assert.deepEqual(typescriptBoundaryError, sourceBoundaryError);
  const sourceOutsideError = errorSnapshot(() => sourceSection.surfaceElevationAt(11));
  const typescriptOutsideError = errorSnapshot(() => typescriptSection.surfaceElevationAt(11));
  assert.deepEqual(typescriptOutsideError, sourceOutsideError);
});
