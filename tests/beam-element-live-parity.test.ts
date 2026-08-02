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
  readonly x: number;
  distanceTo(node: RuntimeNode): number;
  toJSON(): unknown;
}

interface RuntimeElement {
  readonly id: string;
  readonly type: string;
  readonly nodes: RuntimeNode[];
  readonly releases: Record<string, unknown>;
  readonly localAxis: unknown;
  addNode(node: RuntimeNode): RuntimeElement;
  nodeIds(): string[];
  toJSON(): unknown;
}

interface RuntimeBeamElement extends RuntimeElement {
  readonly startNode: RuntimeNode;
  readonly endNode: RuntimeNode;
  length(): number;
}

interface RuntimeBeamModule {
  readonly BeamElement: new (options: Record<string, unknown>) => RuntimeBeamElement;
}

interface RuntimeRootModule extends RuntimeBeamModule {
  readonly StructuralElement: new (options: Record<string, unknown>) => RuntimeElement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBeamModule(value: unknown): value is RuntimeBeamModule {
  return isRecord(value) && typeof value.BeamElement === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    typeof value.BeamElement === "function" &&
    typeof value.StructuralElement === "function"
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

function readName(value: unknown): string {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Expected a named local axis.");
  }
  return value.name;
}

async function loadModules(): Promise<{
  source: RuntimeBeamModule;
  typescript: RuntimeBeamModule;
  sourceRoot: RuntimeRootModule;
  typescriptRoot: RuntimeRootModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "domain", "elements", "BeamElement.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "elements", "BeamElement.js")).href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isBeamModule(sourceModule) ||
    !isBeamModule(typescriptModule) ||
    !isRootModule(sourceRootModule) ||
    !isRootModule(typescriptRootModule)
  ) {
    throw new Error("BeamElement modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function createNode(id: string, x: number): RuntimeNode {
  return {
    id,
    x,
    distanceTo(node): number {
      return Math.abs(node.x - x);
    },
    toJSON(): unknown {
      return { id, x, y: 0, z: 0, label: id === "n-α" ? "inizio" : "fine" };
    },
  };
}

function createOptions(): Record<string, unknown> {
  return {
    id: "beam-α",
    startNode: createNode("n-α", 0),
    endNode: createNode("n-β", 3),
    releases: { ux: true, φ: false },
    localAxis: { name: "asse locale δοκιμή", direction: [1, 0, 0] },
    metadata: { label: "Trave δοκιμή", source: "strutture-js" },
    material: {
      toJSON(): unknown {
        return { name: "acciaio", grade: "S275" };
      },
    },
    crossSection: {
      toJSON(): unknown {
        return { name: "IPE 200", area: 0.00285 };
      },
    },
  };
}

void test("BeamElement matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.BeamElement, typescript.BeamElement);
  assert.equal(sourceRoot.BeamElement, source.BeamElement);
  assert.equal(typescriptRoot.BeamElement, typescript.BeamElement);

  const sourceBeam = new source.BeamElement(createOptions());
  const typescriptBeam = new typescript.BeamElement(createOptions());

  assert.equal(sourceBeam instanceof sourceRoot.StructuralElement, true);
  assert.equal(typescriptBeam instanceof typescriptRoot.StructuralElement, true);
  assert.equal(sourceBeam instanceof typescriptRoot.StructuralElement, false);
  assert.equal(typescriptBeam instanceof sourceRoot.StructuralElement, false);
  assert.equal(sourceBeam.length(), 3);
  assert.equal(typescriptBeam.length(), sourceBeam.length());
  assert.deepEqual(typescriptBeam.toJSON(), sourceBeam.toJSON());
  assert.equal(JSON.stringify(typescriptBeam.toJSON()), JSON.stringify(sourceBeam.toJSON()));
  assert.deepEqual(typescriptBeam.nodeIds(), sourceBeam.nodeIds());
  assert.deepEqual(typescriptBeam.releases, sourceBeam.releases);

  const sourceAdded = sourceBeam.addNode(createNode("n-γ", 4));
  const typescriptAdded = typescriptBeam.addNode(createNode("n-γ", 4));
  assert.equal(sourceAdded, sourceBeam);
  assert.equal(typescriptAdded, typescriptBeam);
  assert.deepEqual(typescriptAdded.nodeIds(), sourceAdded.nodeIds());
  assert.deepEqual(typescriptAdded.toJSON(), sourceAdded.toJSON());

  const sourceDefault = new source.BeamElement({
    id: "default-α",
    startNode: createNode("n-α", 0),
    endNode: createNode("n-β", 3),
  });
  const typescriptDefault = new typescript.BeamElement({
    id: "default-α",
    startNode: createNode("n-α", 0),
    endNode: createNode("n-β", 3),
  });
  assert.deepEqual(typescriptDefault.toJSON(), sourceDefault.toJSON());

  assertErrorParity(
    () =>
      new source.BeamElement({
        startNode: createNode("n-α", 0),
        endNode: createNode("n-β", 3),
      }),
    () =>
      new typescript.BeamElement({
        startNode: createNode("n-α", 0),
        endNode: createNode("n-β", 3),
      }),
    "missing id",
  );

  assert.deepEqual(
    codePoints(readName(typescriptBeam.localAxis)),
    codePoints(readName(sourceBeam.localAxis)),
  );
  assert.equal(sourceBeam.startNode.id, "n-α");
  assert.equal(typescriptBeam.startNode.id, sourceBeam.startNode.id);
});
