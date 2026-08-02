import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSection {
  readonly profileName: string | null | undefined;
  readonly family: string | null;
  readonly area: number;
  readonly inertiaY: number | null;
  readonly inertiaZ: number | null;
  readonly warpingConstant: number | null | undefined;
  readonly metadata: Record<string, unknown>;
  readonly catalogProperties: Record<string, unknown>;
  readonly convertedCatalogProperties: Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeModule {
  readonly SteelProfileSection: new (options: Record<string, unknown>) => RuntimeSection;
}

interface RuntimeRoot extends RuntimeModule {
  readonly CrossSection: new (options: Record<string, unknown>) => object;
  readonly createSteelProfileSection: (options: Record<string, unknown>) => RuntimeSection;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return isRecord(value) && typeof value.SteelProfileSection === "function";
}

function isRuntimeRoot(value: unknown): value is RuntimeRoot {
  return (
    isRuntimeModule(value) &&
    isRecord(value) &&
    typeof value.CrossSection === "function" &&
    typeof value.createSteelProfileSection === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
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

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

async function loadModules(): Promise<{
  source: RuntimeModule;
  typescript: RuntimeModule;
  sourceRoot: RuntimeRoot;
  typescriptRoot: RuntimeRoot;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "geometry", "SteelProfileSection.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "geometry", "SteelProfileSection.js"))
      .href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isRuntimeModule(sourceModule) ||
    !isRuntimeModule(typescriptModule) ||
    !isRuntimeRoot(sourceRootModule) ||
    !isRuntimeRoot(typescriptRootModule)
  ) {
    throw new Error("Steel profile section modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function createOptions(): Record<string, unknown> {
  return {
    profileName: "IPE300",
    id: "profilo-\u03B1",
    name: "Profilo \u03B4",
    units: { force: "kN", length: "m" },
    metadata: { label: "sezione \u03B2" },
    warpingConstant: 2e-6,
    unsupported: "ignored",
  };
}

void test("SteelProfileSection matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.SteelProfileSection, typescript.SteelProfileSection);
  assert.equal(sourceRoot.SteelProfileSection, source.SteelProfileSection);
  assert.equal(typescriptRoot.SteelProfileSection, typescript.SteelProfileSection);
  assert.notEqual(
    Reflect.get(sourceRoot, "createSteelProfileSection"),
    Reflect.get(typescriptRoot, "createSteelProfileSection"),
  );

  const sourceSection = sourceRoot.createSteelProfileSection(createOptions());
  const typescriptSection = typescriptRoot.createSteelProfileSection(createOptions());

  assert.equal(sourceSection instanceof source.SteelProfileSection, true);
  assert.equal(typescriptSection instanceof typescript.SteelProfileSection, true);
  assert.equal(sourceSection instanceof typescript.SteelProfileSection, false);
  assert.equal(typescriptSection instanceof source.SteelProfileSection, false);
  assert.equal(sourceSection instanceof sourceRoot.CrossSection, true);
  assert.equal(typescriptSection instanceof typescriptRoot.CrossSection, true);
  assert.deepEqual(Object.keys(typescriptSection), Object.keys(sourceSection));
  assert.deepEqual(typescriptSection.toJSON(), sourceSection.toJSON());
  assert.equal(JSON.stringify(typescriptSection.toJSON()), JSON.stringify(sourceSection.toJSON()));
  assert.equal(typescriptSection.area, sourceSection.area);
  assert.equal(typescriptSection.inertiaY, sourceSection.inertiaY);
  assert.equal(typescriptSection.inertiaZ, sourceSection.inertiaZ);
  assert.equal(typescriptSection.warpingConstant, sourceSection.warpingConstant);
  assert.deepEqual(typescriptSection.catalogProperties, sourceSection.catalogProperties);
  assert.deepEqual(
    typescriptSection.convertedCatalogProperties,
    sourceSection.convertedCatalogProperties,
  );
  assert.deepEqual(typescriptSection.metadata, sourceSection.metadata);
  assert.deepEqual(
    codePoints(String(typescriptSection.metadata.label)),
    codePoints("sezione \u03B2"),
  );

  const sourceDefault = new source.SteelProfileSection({ profileName: "IPE300" });
  const typescriptDefault = new typescript.SteelProfileSection({ profileName: "IPE300" });
  assert.deepEqual(typescriptDefault.toJSON(), sourceDefault.toJSON());

  assertErrorParity(
    () =>
      sourceRoot.createSteelProfileSection({
        profileName: "XYZ999",
        units: { force: "kN", length: "m" },
      }),
    () =>
      typescriptRoot.createSteelProfileSection({
        profileName: "XYZ999",
        units: { force: "kN", length: "m" },
      }),
    "unknown profile error",
  );
  assertErrorParity(
    () => sourceRoot.createSteelProfileSection({ profileName: "IPE300", area: null }),
    () => typescriptRoot.createSteelProfileSection({ profileName: "IPE300", area: null }),
    "null area error",
  );
});
