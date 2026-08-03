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

interface RuntimeNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface RuntimeSection {
  readonly profileName?: string | null;
  readonly area?: number | null;
  readonly inertiaY?: number | null;
  readonly inertiaZ?: number | null;
  readonly elasticSectionModulusY?: number | null;
  readonly elasticSectionModulusZ?: number | null;
  readonly plasticSectionModulusY?: number | null;
  readonly plasticSectionModulusZ?: number | null;
}

interface RuntimeMaterial {
  readonly elasticModulus?: number | null;
  readonly fyd?: number | null;
  readonly fyk?: number | null;
}

interface RuntimeDofRegistry {
  registerNodes(nodes: readonly RuntimeNode[]): void;
}

interface RuntimeElement {
  readonly id: unknown;
  readonly plasticMomentStart: number;
  readonly plasticMomentEnd: number;
  readonly sectionOrientation: Record<string, unknown>;
  readonly startNode: RuntimeNode;
  readonly endNode: RuntimeNode;
  readonly section: RuntimeSection | null;
  readonly material: RuntimeMaterial | null;
  defaultPlasticMomentCapacity(): number;
  defaultAxialRigidity(): number;
  defaultFlexuralRigidity(): number;
  plasticMomentCapacity(position: string): number;
  transformationMatrix(): unknown;
  localElasticStiffness(): unknown;
  globalElasticStiffness(): unknown;
  condensationOperators(hingeState?: unknown): unknown;
  evaluate(options?: unknown): unknown;
  toJSON(): unknown;
}

interface RuntimeElementModule {
  readonly SteelPlasticHingeFrameElement2D: new (options?: unknown) => RuntimeElement;
}

interface RuntimeRootModule {
  readonly Node: new (options: unknown) => RuntimeNode;
  readonly DofRegistry: new (options?: unknown) => RuntimeDofRegistry;
  readonly SteelPlasticHingeState: new (options?: unknown) => unknown;
  readonly createSteelProfileSection: (options: unknown) => RuntimeSection;
  readonly createNTC2018StructuralSteelMaterial: (options: unknown) => RuntimeMaterial;
  readonly SteelPlasticHingeFrameElement2D: RuntimeElementModule["SteelPlasticHingeFrameElement2D"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isElementModule(value: unknown): value is RuntimeElementModule {
  return isRecord(value) && typeof value.SteelPlasticHingeFrameElement2D === "function";
}

function recordKeys(value: unknown): string[] {
  if (!isRecord(value)) throw new Error("Expected a serialized element record.");
  return Object.keys(value);
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.Node === "function" &&
    typeof value.DofRegistry === "function" &&
    typeof value.SteelPlasticHingeState === "function" &&
    typeof value.createSteelProfileSection === "function" &&
    typeof value.createNTC2018StructuralSteelMaterial === "function" &&
    typeof value.SteelPlasticHingeFrameElement2D === "function"
  );
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadElementModule(
  root: string,
  relativePath: string,
): Promise<RuntimeElementModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isElementModule(module)) {
    throw new Error(`The module ${relativePath} does not expose the plastic hinge element.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error(
      `The module ${relativePath} does not expose the required element dependencies.`,
    );
  }
  return module;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = JSON.stringify(source);
  const typescriptJson = JSON.stringify(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(codePoints(typescriptJson), codePoints(sourceJson), `${label}: Unicode`);
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

function prototypeKeys(value: unknown): string[] {
  if (typeof value !== "function") throw new Error("Expected a class export.");
  return Object.getOwnPropertyNames(value.prototype);
}

function createElementFixture(
  root: RuntimeRootModule,
  id: string,
): {
  element: RuntimeElement;
  registry: RuntimeDofRegistry;
} {
  const units = { force: "N", length: "mm" };
  const startNode = new root.Node({ id: `${id}-A`, x: 0, y: 0, units });
  const endNode = new root.Node({ id: `${id}-B`, x: 1000, y: 0, units });
  const section = root.createSteelProfileSection({ profileName: "IPE200", units });
  const material = root.createNTC2018StructuralSteelMaterial({ grade: "S275", units });
  const registry = new root.DofRegistry();
  registry.registerNodes([startNode, endNode]);
  const element = new root.SteelPlasticHingeFrameElement2D({
    id,
    startNode,
    endNode,
    section,
    material,
    metadata: { label: "Cerniera \u03bb", source: "steel-\u00e9" },
  });
  return { element, registry };
}

void test("SteelPlasticHingeFrameElement2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadElementModule(
    sourceRoot,
    "src/applications/steel-frames/analysis/SteelPlasticHingeFrameElement2D.js",
  );
  const typescript = await loadElementModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/analysis/SteelPlasticHingeFrameElement2D.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.notEqual(
    source.SteelPlasticHingeFrameElement2D,
    typescript.SteelPlasticHingeFrameElement2D,
  );
  assert.equal(
    sourceRootModule.SteelPlasticHingeFrameElement2D,
    source.SteelPlasticHingeFrameElement2D,
  );
  assert.equal(
    typescriptRootModule.SteelPlasticHingeFrameElement2D,
    typescript.SteelPlasticHingeFrameElement2D,
  );
  assert.notEqual(
    sourceRootModule.SteelPlasticHingeFrameElement2D,
    typescriptRootModule.SteelPlasticHingeFrameElement2D,
  );
  assert.deepEqual(
    prototypeKeys(source.SteelPlasticHingeFrameElement2D),
    prototypeKeys(typescript.SteelPlasticHingeFrameElement2D),
    "prototype shape",
  );

  const sourceFixture = createElementFixture(sourceRootModule, "plastic-element");
  const typescriptFixture = createElementFixture(typescriptRootModule, "plastic-element");
  assert.deepEqual(
    recordKeys(typescriptFixture.element.toJSON()),
    recordKeys(sourceFixture.element.toJSON()),
    "serialized key order",
  );
  exactJson(sourceFixture.element.toJSON(), typescriptFixture.element.toJSON(), "element JSON");
  assert.equal(
    sourceFixture.element.defaultPlasticMomentCapacity(),
    typescriptFixture.element.defaultPlasticMomentCapacity(),
    "default plastic moment",
  );
  assert.equal(
    sourceFixture.element.defaultAxialRigidity(),
    typescriptFixture.element.defaultAxialRigidity(),
    "default axial rigidity",
  );
  assert.equal(
    sourceFixture.element.defaultFlexuralRigidity(),
    typescriptFixture.element.defaultFlexuralRigidity(),
    "default flexural rigidity",
  );
  exactJson(
    sourceFixture.element.transformationMatrix(),
    typescriptFixture.element.transformationMatrix(),
    "transformation matrix",
  );
  exactJson(
    sourceFixture.element.localElasticStiffness(),
    typescriptFixture.element.localElasticStiffness(),
    "local stiffness",
  );
  exactJson(
    sourceFixture.element.globalElasticStiffness(),
    typescriptFixture.element.globalElasticStiffness(),
    "global stiffness",
  );

  const sourceHinged = createElementFixture(sourceRootModule, "hinged-element");
  const typescriptHinged = createElementFixture(typescriptRootModule, "hinged-element");
  const sourceHingeState = new sourceRootModule.SteelPlasticHingeState({ start: "positive" });
  const typescriptHingeState = new typescriptRootModule.SteelPlasticHingeState({
    start: "positive",
  });
  exactJson(
    sourceHinged.element.condensationOperators(sourceHingeState),
    typescriptHinged.element.condensationOperators(typescriptHingeState),
    "condensation operators",
  );
  const sourceResponse = sourceHinged.element.evaluate({
    globalDisplacements: [0, 0, 0.1, 0, 0, 0],
    dofRegistry: sourceHinged.registry,
  });
  const typescriptResponse = typescriptHinged.element.evaluate({
    globalDisplacements: [0, 0, 0.1, 0, 0, 0],
    dofRegistry: typescriptHinged.registry,
  });
  exactJson(sourceResponse, typescriptResponse, "plastic response");

  assertErrorParity(
    () => new source.SteelPlasticHingeFrameElement2D(),
    () => new typescript.SteelPlasticHingeFrameElement2D(undefined),
    "missing constructor options",
  );
  assertErrorParity(
    () =>
      new source.SteelPlasticHingeFrameElement2D({
        id: "",
        startNode: sourceFixture.element.startNode,
        endNode: sourceFixture.element.endNode,
        section: sourceFixture.element.section,
        material: sourceFixture.element.material,
      }),
    () =>
      new typescript.SteelPlasticHingeFrameElement2D({
        id: "",
        startNode: typescriptFixture.element.startNode,
        endNode: typescriptFixture.element.endNode,
        section: typescriptFixture.element.section,
        material: typescriptFixture.element.material,
      }),
    "missing id",
  );
  assertErrorParity(
    () =>
      new source.SteelPlasticHingeFrameElement2D({
        id: "invalid-moment",
        startNode: sourceFixture.element.startNode,
        endNode: sourceFixture.element.endNode,
        section: sourceFixture.element.section,
        material: sourceFixture.element.material,
        plasticMomentStart: 0,
      }),
    () =>
      new typescript.SteelPlasticHingeFrameElement2D({
        id: "invalid-moment",
        startNode: typescriptFixture.element.startNode,
        endNode: typescriptFixture.element.endNode,
        section: typescriptFixture.element.section,
        material: typescriptFixture.element.material,
        plasticMomentStart: 0,
      }),
    "invalid plastic moment",
  );
  assertErrorParity(
    () => sourceFixture.element.evaluate({ globalDisplacements: [0, 0, 0, 0, 0, 0] }),
    () => typescriptFixture.element.evaluate({ globalDisplacements: [0, 0, 0, 0, 0, 0] }),
    "missing DOF registry",
  );
});
