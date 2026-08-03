import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const units = { force: "kN", length: "m" } as const;

type RuntimeModule = Record<string, unknown>;
type RuntimeMaterial = { toJSON(): unknown };
type RuntimeProfile = { toJSON(): unknown };
type RuntimeResult = { toJSON(): unknown };
type RuntimeApplication = {
  getManifest(): unknown;
  run(input?: Record<string, unknown>): RuntimeResult;
};
type RuntimeConstructor<T> = new (options?: Record<string, unknown>) => T;
interface RootRuntimeModule extends RuntimeModule {
  GeotechnicalEarthPressureApplication: RuntimeConstructor<RuntimeApplication>;
  GroundProfile: RuntimeConstructor<RuntimeProfile>;
  SoilMaterial: RuntimeConstructor<RuntimeMaterial>;
}

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootRuntimeModule(value: unknown): value is RootRuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalEarthPressureApplication === "function" &&
    typeof value.GroundProfile === "function" &&
    typeof value.SoilMaterial === "function"
  );
}

function isApplicationModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.GeotechnicalEarthPressureApplication === "function" &&
    typeof value.LateralEarthPressureAnalysis === "function" &&
    Array.isArray(value.EARTH_PRESSURE_METHODS) &&
    Array.isArray(value.EARTH_PRESSURE_STATES)
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
  assert.deepEqual([...JSON.stringify(typescript)], [...JSON.stringify(source)]);
}

function createMaterial(moduleValue: RootRuntimeModule): RuntimeMaterial {
  return new moduleValue.SoilMaterial({
    id: "soil-γ",
    name: "Material γ",
    unitWeight: { bulk: 18, saturated: 20 },
    parameterSets: [
      {
        id: "drained",
        basis: "characteristic",
        drainage: "drained",
        strength: {
          model: "mohr-coulomb-effective",
          frictionAngle: 30,
          cohesion: 0,
        },
        provenance: { source: "application-wrapper-parity-β" },
      },
    ],
    defaultParameterSetId: "drained",
    angleUnits: "deg",
    units,
  });
}

function createProfile(moduleValue: RootRuntimeModule): RuntimeProfile {
  const material = createMaterial(moduleValue);
  return new moduleValue.GroundProfile({
    id: "profile-α",
    groundSurfaceElevation: 10,
    materials: [material],
    layers: [
      {
        id: "layer-β",
        topElevation: 10,
        bottomElevation: 0,
        materialId: "soil-γ",
      },
    ],
    units,
  });
}

function applicationResult(
  moduleValue: RootRuntimeModule,
  input: Record<string, unknown>,
): unknown {
  const Application = moduleValue.GeotechnicalEarthPressureApplication;
  return new Application().run(input).toJSON();
}

void test("geotechnical earth-pressure application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModuleValue: unknown = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );
  const sourceApplicationModuleValue: unknown = await loadModule(
    sourceRoot,
    "src/applications/geotechnical-earth-pressures/index.js",
  );
  const typescriptApplicationModuleValue: unknown = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/geotechnical-earth-pressures/index.js",
  );
  if (
    !isRootRuntimeModule(sourceRootModuleValue) ||
    !isRootRuntimeModule(typescriptRootModuleValue) ||
    !isApplicationModule(sourceApplicationModuleValue) ||
    !isApplicationModule(typescriptApplicationModuleValue)
  ) {
    throw new Error("Geotechnical earth-pressure exports do not expose the expected API.");
  }

  assert.deepEqual(
    Object.keys(typescriptApplicationModuleValue),
    Object.keys(sourceApplicationModuleValue),
  );
  for (const name of [
    "GeotechnicalEarthPressureApplication",
    "EARTH_PRESSURE_METHODS",
    "EARTH_PRESSURE_STATES",
    "LateralEarthPressureAnalysis",
  ]) {
    assert.notEqual(
      typescriptApplicationModuleValue[name],
      sourceApplicationModuleValue[name],
      `${name} independent implementations`,
    );
    assert.equal(
      typescriptRootModuleValue[name],
      typescriptApplicationModuleValue[name],
      `${name} TypeScript root alias`,
    );
    assert.equal(
      sourceRootModuleValue[name],
      sourceApplicationModuleValue[name],
      `${name} source root alias`,
    );
  }
  assert.deepEqual(
    typescriptApplicationModuleValue.EARTH_PRESSURE_METHODS,
    sourceApplicationModuleValue.EARTH_PRESSURE_METHODS,
  );
  assert.deepEqual(
    typescriptApplicationModuleValue.EARTH_PRESSURE_STATES,
    sourceApplicationModuleValue.EARTH_PRESSURE_STATES,
  );

  const sourceApplication = new sourceRootModuleValue.GeotechnicalEarthPressureApplication();
  const typescriptApplication =
    new typescriptRootModuleValue.GeotechnicalEarthPressureApplication();
  assertExactParity(
    sourceApplication.getManifest(),
    typescriptApplication.getManifest(),
    "application manifest",
  );

  const sourceProfile = createProfile(sourceRootModuleValue);
  const typescriptProfile = createProfile(typescriptRootModuleValue);
  const validInput = {
    profile: sourceProfile,
    state: "active",
    method: "rankine",
    units,
  };
  const typescriptValidInput = {
    ...validInput,
    profile: typescriptProfile,
  };
  assertExactParity(
    applicationResult(sourceRootModuleValue, validInput),
    applicationResult(typescriptRootModuleValue, typescriptValidInput),
    "valid application result",
  );

  const sourceUnsupportedProfile = createProfile(sourceRootModuleValue);
  const typescriptUnsupportedProfile = createProfile(typescriptRootModuleValue);
  assertExactParity(
    applicationResult(sourceRootModuleValue, {
      profile: sourceUnsupportedProfile,
      state: "unsupported-state",
      units,
    }),
    applicationResult(typescriptRootModuleValue, {
      profile: typescriptUnsupportedProfile,
      state: "unsupported-state",
      units,
    }),
    "unsupported state result",
  );

  assertExactParity(
    applicationResult(sourceRootModuleValue, {}),
    applicationResult(typescriptRootModuleValue, {}),
    "missing input result",
  );
});
