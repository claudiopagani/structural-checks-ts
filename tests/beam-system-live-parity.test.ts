import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeNode {
  readonly id: string;
}

interface RuntimeBeam {
  readonly id: string;
  readonly startNode: RuntimeNode;
  readonly endNode: RuntimeNode;
  length(): number;
}

interface RuntimeSystem {
  readonly id: string;
  readonly name: string;
  readonly beams: RuntimeBeam[];
  readonly nodes: RuntimeNode[];
  readonly metadata: Record<string, unknown>;
  addBeam(beam: RuntimeBeam): RuntimeSystem;
  addNode(node: RuntimeNode): RuntimeSystem;
  totalLength(): number;
  toJSON(): unknown;
}

interface RuntimeSystemModule {
  readonly BeamSystem: new (options: Record<string, unknown>) => RuntimeSystem;
}

type RuntimeRootModule = RuntimeSystemModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSystemModule(value: unknown): value is RuntimeSystemModule {
  return isRecord(value) && typeof value.BeamSystem === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return isSystemModule(value);
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
  source: RuntimeSystemModule;
  typescript: RuntimeSystemModule;
  sourceRoot: RuntimeRootModule;
  typescriptRoot: RuntimeRootModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "elements", "BeamSystem.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "elements", "BeamSystem.js")).href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isSystemModule(sourceModule) ||
    !isSystemModule(typescriptModule) ||
    !isRootModule(sourceRootModule) ||
    !isRootModule(typescriptRootModule)
  ) {
    throw new Error("BeamSystem modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function createNode(id: string): RuntimeNode {
  return { id };
}

function createBeam(
  id: string,
  startNode: RuntimeNode,
  endNode: RuntimeNode,
  length: number,
): RuntimeBeam {
  return {
    id,
    startNode,
    endNode,
    length: () => length,
  };
}

function createOptions(): Record<string, unknown> {
  const nodeA = createNode("n-α");
  const nodeB = createNode("n-β");
  return {
    id: "system-α",
    name: "Sistema δοκιμή",
    beams: [createBeam("beam-α", nodeA, nodeB, 3)],
    nodes: [nodeA],
    metadata: { label: "Sistema δοκιμή", source: "strutture-js" },
    unsupported: "ignored",
  };
}

void test("BeamSystem matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.BeamSystem, typescript.BeamSystem);
  assert.equal(sourceRoot.BeamSystem, source.BeamSystem);
  assert.equal(typescriptRoot.BeamSystem, typescript.BeamSystem);

  const sourceSystem = new source.BeamSystem(createOptions());
  const typescriptSystem = new typescript.BeamSystem(createOptions());

  assert.equal(sourceSystem instanceof source.BeamSystem, true);
  assert.equal(typescriptSystem instanceof typescript.BeamSystem, true);
  assert.equal(sourceSystem instanceof typescript.BeamSystem, false);
  assert.equal(typescriptSystem instanceof source.BeamSystem, false);
  assert.equal(sourceSystem.totalLength(), 3);
  assert.equal(typescriptSystem.totalLength(), sourceSystem.totalLength());
  assert.deepEqual(typescriptSystem.toJSON(), sourceSystem.toJSON());
  assert.equal(JSON.stringify(typescriptSystem.toJSON()), JSON.stringify(sourceSystem.toJSON()));

  const sourceNodeB = createNode("n-β");
  const sourceNodeC = createNode("n-γ");
  const typescriptNodeB = createNode("n-β");
  const typescriptNodeC = createNode("n-γ");
  const sourceBeamB = createBeam("beam-β", sourceNodeB, sourceNodeC, 4);
  const typescriptBeamB = createBeam("beam-β", typescriptNodeB, typescriptNodeC, 4);

  const sourceAddedBeam = sourceSystem.addBeam(sourceBeamB);
  const typescriptAddedBeam = typescriptSystem.addBeam(typescriptBeamB);
  assert.equal(sourceAddedBeam, sourceSystem);
  assert.equal(typescriptAddedBeam, typescriptSystem);
  assert.deepEqual(typescriptSystem.toJSON(), sourceSystem.toJSON());
  assert.deepEqual(
    typescriptSystem.nodes.map((node) => node.id),
    sourceSystem.nodes.map((node) => node.id),
  );
  assert.equal(typescriptSystem.totalLength(), sourceSystem.totalLength());

  const sourceAddedNode = sourceSystem.addNode(createNode("n-δ"));
  const typescriptAddedNode = typescriptSystem.addNode(createNode("n-δ"));
  assert.equal(sourceAddedNode, sourceSystem);
  assert.equal(typescriptAddedNode, typescriptSystem);
  assert.deepEqual(typescriptSystem.toJSON(), sourceSystem.toJSON());

  const sourceDefault = new source.BeamSystem({ id: "default-α" });
  const typescriptDefault = new typescript.BeamSystem({ id: "default-α" });
  assert.deepEqual(typescriptDefault.toJSON(), sourceDefault.toJSON());

  assertErrorParity(
    () => new source.BeamSystem({}),
    () => new typescript.BeamSystem({}),
    "missing id",
  );

  assert.deepEqual(codePoints(typescriptSystem.name), codePoints(sourceSystem.name));
  assert.equal(sourceSystem.toJSON() instanceof Object, true);
  assert.equal(typescriptSystem.toJSON() instanceof Object, true);
});
