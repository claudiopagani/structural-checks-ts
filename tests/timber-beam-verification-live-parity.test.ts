import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type JsonRecord = Record<string, unknown>;

interface RuntimeVerifier {
  verify(input?: unknown): JsonRecord;
}

interface RuntimeModule extends JsonRecord {
  readonly TimberBeamVerification: new (options?: unknown) => RuntimeVerifier;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.TimberBeamVerification === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadRootModule(root: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, "src", "index.js")).href);
  if (!isRuntimeModule(module)) {
    throw new Error("Missing TimberBeamVerification root export.");
  }
  return module;
}

async function loadBuiltRootModule(): Promise<RuntimeModule> {
  const module: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(module)) {
    throw new Error("Missing built TimberBeamVerification root export.");
  }
  return module;
}

async function loadDirectModule(root: string, relativePath: string): Promise<JsonRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`Missing direct export in ${relativePath}.`);
  }
  return module;
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(
    Array.from(typescriptJson, (character) => character.codePointAt(0)),
    Array.from(sourceJson, (character) => character.codePointAt(0)),
    `${label}: exact Unicode code points`,
  );
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

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

function verificationFixture(): JsonRecord {
  const lambda = String.fromCodePoint(0x3bb);
  return {
    section: {
      area: 39_200,
      inertiaY: 9_173_333_333,
      inertiaZ: 64_106_666_667,
      shearAreaY: 28_000,
      shearAreaZ: 28_000,
      elasticSectionModulusY: 65_523_810,
      elasticSectionModulusZ: 280_000,
      width: 140,
      height: 280,
      metadata: {
        shape: "rectangular",
        unitSystem: { force: "N", length: "mm" },
      },
    },
    material: {
      elasticModulus: 11_000,
      fmK: 24,
      fvK: 4,
      fc0K: 21,
      ft0K: 14,
      kmod: 0.8,
      metadata: { gammaM: 1.5, label: `Abete ${lambda}` },
    },
    analysisResult: {
      units: { force: "N", length: "mm" },
      combinations: {
        uls: {
          id: `ULS-${lambda}`,
          resultType: "combination",
          geometry: { length: 4_000 },
          context: { limitState: "ULS", combinationType: "ULS" },
          sectionProperties: { metadata: { kmod: 0.8 } },
          internalForces: {
            samples: [
              {
                station: 0,
                v: 4_000,
                m: 0,
                principalActions: { mY: 0, mZ: 0 },
              },
              {
                station: 2_000,
                v: 4_000,
                m: 2_400_000,
                principalActions: { mY: 2_400_000, mZ: 120_000 },
              },
            ],
          },
        },
        sleRare: {
          id: "SLE-rare",
          resultType: "combination",
          geometry: { length: 4_000 },
          context: { limitState: "SLE", serviceCombination: "rare" },
          displacements: {
            maxAbsVerticalDisplacement: { uy: 5.25, station: 2_000 },
          },
        },
        sleFinal: {
          id: "SLE-final",
          resultType: "combination",
          geometry: { length: 4_000 },
          context: { limitState: "SLE", serviceCombination: "final" },
          sectionProperties: { metadata: { finalStiffness: true } },
          displacements: {
            maxAbsVerticalDisplacement: { uy: 7.5, station: 2_000 },
          },
        },
      },
    },
  };
}

function invalidUnitsFixture(): JsonRecord {
  const fixture = verificationFixture();
  const analysisResult = fixture.analysisResult;
  assert.ok(isRecord(analysisResult));
  analysisResult.units = { force: "invalid", length: "mm" };
  return fixture;
}

void test("0209 TimberBeamVerification matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadRootModule(sourceRoot);
  const typescriptRootModule = await loadBuiltRootModule();
  const sourceDirect = await loadDirectModule(
    sourceRoot,
    "src/applications/timber-beams/checks/TimberBeamVerification.js",
  );
  const typescriptDirect = await loadDirectModule(
    path.join(repositoryRoot, "dist"),
    "applications/timber-beams/checks/TimberBeamVerification.js",
  );

  assert.notEqual(sourceDirect.TimberBeamVerification, typescriptDirect.TimberBeamVerification);
  assert.equal(
    typescriptRootModule.TimberBeamVerification,
    typescriptDirect.TimberBeamVerification,
  );

  const sourceVerifier = new sourceRootModule.TimberBeamVerification({
    metadata: { label: "Trave λ" },
  });
  const typescriptVerifier = new typescriptRootModule.TimberBeamVerification({
    metadata: { label: "Trave λ" },
  });
  exactJson(sourceVerifier, typescriptVerifier, "default verifier");
  exactJson(
    sourceVerifier.verify({ beamId: "missing-λ" }),
    typescriptVerifier.verify({ beamId: "missing-λ" }),
    "missing-input result",
  );

  const sourceFixture = verificationFixture();
  const typescriptFixture = verificationFixture();
  exactJson(
    sourceVerifier.verify(sourceFixture),
    typescriptVerifier.verify(typescriptFixture),
    "complete verification result",
  );
  assertErrorParity(
    () => sourceVerifier.verify(invalidUnitsFixture()),
    () => typescriptVerifier.verify(invalidUnitsFixture()),
    "unsupported units",
  );
});
