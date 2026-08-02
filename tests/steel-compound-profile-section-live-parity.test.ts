import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSection {
  readonly family: string;
  readonly profileName: string | null;
  readonly area: number;
  readonly height: number | null;
  readonly width: number | null;
  readonly inertiaY: number | null;
  readonly inertiaZ: number | null;
  readonly centroidY: number | null;
  readonly centroidZ: number | null;
  readonly metadata: Record<string, unknown>;
  readonly components: readonly RuntimeComponent[];
  getComponent(role: string): RuntimeComponent | null;
  toJSON(): Record<string, unknown>;
}

interface RuntimeComponent {
  readonly id: string | null;
  readonly role: string | null;
  readonly profileName: string | null;
  readonly family: string | null;
  readonly centroidY: number;
  readonly centroidZ: number;
  readonly rotation: number;
  readonly mirrorY: boolean;
  readonly mirrorZ: boolean;
  readonly area: number;
  readonly inertiaY: number;
  readonly inertiaZ: number;
  readonly productOfInertiaYZ: number;
  readonly torsionalConstant: number | null | undefined;
  readonly shearAreaY: number | null | undefined;
  readonly shearAreaZ: number | null | undefined;
  readonly massPerLength: number | null | undefined;
  readonly section: RuntimeSection;
  readonly transformedPoints: readonly Record<string, number>[];
  readonly bounds: Record<string, number>;
  readonly localGeometry: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

interface RuntimeModule {
  readonly SteelCompoundProfileSection: new (options: Record<string, unknown>) => RuntimeSection;
  readonly createDoubleAngleOpposedSection: (options?: Record<string, unknown>) => RuntimeSection;
  readonly createDoubleUPNBackToBackSection: (options?: Record<string, unknown>) => RuntimeSection;
  readonly createSteelCompoundProfileSection: (options: Record<string, unknown>) => RuntimeSection;
}

interface RuntimeRoot extends RuntimeModule {
  readonly CrossSection: new (options: Record<string, unknown>) => object;
  readonly createSteelProfileSection: (options: Record<string, unknown>) => RuntimeSection;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return (
    isRecord(value) &&
    typeof value.SteelCompoundProfileSection === "function" &&
    typeof value.createDoubleAngleOpposedSection === "function" &&
    typeof value.createDoubleUPNBackToBackSection === "function" &&
    typeof value.createSteelCompoundProfileSection === "function"
  );
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

async function loadModules(): Promise<{
  source: RuntimeModule;
  typescript: RuntimeModule;
  sourceRoot: RuntimeRoot;
  typescriptRoot: RuntimeRoot;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(
      path.join(sourceRoot, "src", "domain", "geometry", "SteelCompoundProfileSection.js"),
    ).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "domain", "geometry", "SteelCompoundProfileSection.js"),
    ).href
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
    throw new Error("Steel compound profile section modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function upnOptions(): Record<string, unknown> {
  return {
    profileName: "UPN200",
    gap: 0.02,
    units: { force: "kN", length: "m" },
    metadata: { label: "dorso \u03B3" },
  };
}

function angleOptions(): Record<string, unknown> {
  return {
    profileName: "L60X60X6",
    separationY: 0.01,
    separationZ: 0.02,
    units: { force: "kN", length: "m" },
  };
}

function genericOptions(base: RuntimeSection): Record<string, unknown> {
  return {
    name: "Two shifted SHS",
    units: { force: "N", length: "mm" },
    components: [
      {
        section: base,
        centroidY: -75,
        centroidZ: 0,
        role: "bottom",
      },
      {
        section: base,
        centroidY: 75,
        centroidZ: 0,
        rotation: 90,
        rotationUnits: "deg",
        role: "top",
      },
    ],
  };
}

function assertSectionParity(
  sourceSection: RuntimeSection,
  typescriptSection: RuntimeSection,
): void {
  assert.deepEqual(Object.keys(typescriptSection), Object.keys(sourceSection));
  assert.deepEqual(typescriptSection.toJSON(), sourceSection.toJSON());
  assert.equal(JSON.stringify(typescriptSection.toJSON()), JSON.stringify(sourceSection.toJSON()));
  assert.equal(typescriptSection.area, sourceSection.area);
  assert.equal(typescriptSection.inertiaY, sourceSection.inertiaY);
  assert.equal(typescriptSection.inertiaZ, sourceSection.inertiaZ);
  assert.equal(typescriptSection.centroidY, sourceSection.centroidY);
  assert.equal(typescriptSection.centroidZ, sourceSection.centroidZ);
  assert.deepEqual(typescriptSection.metadata, sourceSection.metadata);
  assert.deepEqual(
    typescriptSection.components.map(componentSnapshot),
    sourceSection.components.map(componentSnapshot),
  );
}

function componentSnapshot(component: RuntimeComponent): Record<string, unknown> {
  return {
    id: component.id,
    role: component.role,
    profileName: component.profileName,
    family: component.family,
    centroidY: component.centroidY,
    centroidZ: component.centroidZ,
    rotation: component.rotation,
    mirrorY: component.mirrorY,
    mirrorZ: component.mirrorZ,
    area: component.area,
    inertiaY: component.inertiaY,
    inertiaZ: component.inertiaZ,
    productOfInertiaYZ: component.productOfInertiaYZ,
    torsionalConstant: component.torsionalConstant,
    shearAreaY: component.shearAreaY,
    shearAreaZ: component.shearAreaZ,
    massPerLength: component.massPerLength,
    section: component.section.toJSON(),
    transformedPoints: component.transformedPoints,
    bounds: component.bounds,
    localGeometry: component.localGeometry,
    metadata: component.metadata,
  };
}

void test("SteelCompoundProfileSection and its factories match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.SteelCompoundProfileSection, typescript.SteelCompoundProfileSection);
  assert.equal(sourceRoot.SteelCompoundProfileSection, source.SteelCompoundProfileSection);
  assert.equal(typescriptRoot.SteelCompoundProfileSection, typescript.SteelCompoundProfileSection);

  const sourceUpn = sourceRoot.createDoubleUPNBackToBackSection(upnOptions());
  const typescriptUpn = typescriptRoot.createDoubleUPNBackToBackSection(upnOptions());
  assert.equal(sourceUpn instanceof source.SteelCompoundProfileSection, true);
  assert.equal(typescriptUpn instanceof typescript.SteelCompoundProfileSection, true);
  assert.equal(sourceUpn instanceof typescript.SteelCompoundProfileSection, false);
  assert.equal(typescriptUpn instanceof source.SteelCompoundProfileSection, false);
  assert.equal(sourceUpn instanceof sourceRoot.CrossSection, true);
  assert.equal(typescriptUpn instanceof typescriptRoot.CrossSection, true);
  assertSectionParity(sourceUpn, typescriptUpn);
  const sourceUpnComponent = sourceUpn.getComponent("left-channel");
  const typescriptUpnComponent = typescriptUpn.getComponent("left-channel");
  assert.ok(sourceUpnComponent);
  assert.ok(typescriptUpnComponent);
  assert.deepEqual(
    componentSnapshot(typescriptUpnComponent),
    componentSnapshot(sourceUpnComponent),
  );

  const sourceAngle = sourceRoot.createDoubleAngleOpposedSection(angleOptions());
  const typescriptAngle = typescriptRoot.createDoubleAngleOpposedSection(angleOptions());
  assertSectionParity(sourceAngle, typescriptAngle);
  const sourceAngleComponent = sourceAngle.getComponent("opposed-angle");
  const typescriptAngleComponent = typescriptAngle.getComponent("opposed-angle");
  assert.ok(sourceAngleComponent);
  assert.ok(typescriptAngleComponent);
  assert.deepEqual(
    componentSnapshot(typescriptAngleComponent),
    componentSnapshot(sourceAngleComponent),
  );

  const sourceBase = sourceRoot.createSteelProfileSection({
    profileName: "SHS100X100X5",
    units: { force: "kN", length: "m" },
  });
  const typescriptBase = typescriptRoot.createSteelProfileSection({
    profileName: "SHS100X100X5",
    units: { force: "kN", length: "m" },
  });
  const sourceGeneric = sourceRoot.createSteelCompoundProfileSection(genericOptions(sourceBase));
  const typescriptGeneric = typescriptRoot.createSteelCompoundProfileSection(
    genericOptions(typescriptBase),
  );
  assertSectionParity(sourceGeneric, typescriptGeneric);

  assertErrorParity(
    () =>
      sourceRoot.createDoubleUPNBackToBackSection({
        profileName: "IPE200",
        units: { force: "kN", length: "m" },
      }),
    () =>
      typescriptRoot.createDoubleUPNBackToBackSection({
        profileName: "IPE200",
        units: { force: "kN", length: "m" },
      }),
    "UPN family error",
  );
  assertErrorParity(
    () =>
      sourceRoot.createDoubleAngleOpposedSection({
        profileName: "UPN200",
        units: { force: "kN", length: "m" },
      }),
    () =>
      typescriptRoot.createDoubleAngleOpposedSection({
        profileName: "UPN200",
        units: { force: "kN", length: "m" },
      }),
    "angle family error",
  );
  assertErrorParity(
    () => sourceRoot.createSteelCompoundProfileSection({ components: [] }),
    () => typescriptRoot.createSteelCompoundProfileSection({ components: [] }),
    "missing components error",
  );
});
