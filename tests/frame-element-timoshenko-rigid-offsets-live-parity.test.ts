import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface RuntimeJson {
  readonly metadata: Record<string, unknown>;
  readonly [key: string]: unknown;
}

interface RuntimeElement {
  readonly id: string;
  readonly type: string;
  readonly startNode: RuntimeNode;
  readonly endNode: RuntimeNode;
  readonly nodes: [RuntimeNode, RuntimeNode];
  readonly rigidStartOffset: number;
  readonly rigidEndOffset: number;
  referenceNodes(): unknown;
  physicalLength(): number;
  deformableLength(): number;
  referenceDirectionCosines(): unknown;
  kinematicTransformationMatrix(): number[][];
  getDofIds(registry: RuntimeDofRegistry): string[];
  localStiffness(): number[][];
  transformationMatrix(): number[][];
  globalStiffness(): number[][];
  getGlobalStiffness(): number[][];
  localPhysicalDisplacements(displacements: unknown, registry: RuntimeDofRegistry): unknown;
  localDeformableDisplacements(displacements: unknown, registry: RuntimeDofRegistry): unknown;
  localDisplacements(displacements: unknown, registry: RuntimeDofRegistry): unknown;
  equivalentNodalLoadVector(options?: Record<string, unknown>): unknown;
  localEndForces(
    displacements: unknown,
    registry: RuntimeDofRegistry,
    options?: Record<string, unknown>,
  ): unknown;
  referenceElement(): RuntimeElement;
  toJSON(): RuntimeJson;
}

interface RuntimeElementModule {
  readonly FrameElement2DTimoshenkoRigidOffsets: new (
    options: Record<string, unknown>,
  ) => RuntimeElement;
}

interface RuntimeDofRegistry {
  registerNodes(nodes: readonly RuntimeNode[]): RuntimeDofRegistry;
  getIndex(id: string): number;
}

interface RuntimeRootModule extends RuntimeElementModule {
  readonly FrameElement2DTimoshenko: new (options: Record<string, unknown>) => unknown;
  readonly DofRegistry: new () => RuntimeDofRegistry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isElementModule(value: unknown): value is RuntimeElementModule {
  return isRecord(value) && typeof value.FrameElement2DTimoshenkoRigidOffsets === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return (
    isRecord(value) &&
    isElementModule(value) &&
    typeof value.FrameElement2DTimoshenko === "function" &&
    typeof value.DofRegistry === "function"
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
  source: RuntimeElementModule;
  typescript: RuntimeElementModule;
  sourceRoot: RuntimeRootModule;
  typescriptRoot: RuntimeRootModule;
}> {
  const sourceModule: unknown = await import(
    pathToFileURL(
      path.join(
        sourceRoot,
        "src",
        "domain",
        "fem",
        "elements",
        "FrameElement2DTimoshenkoRigidOffsets.js",
      ),
    ).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        "dist",
        "domain",
        "fem",
        "elements",
        "FrameElement2DTimoshenkoRigidOffsets.js",
      ),
    ).href
  );
  const sourceRootModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptRootModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );

  if (
    !isElementModule(sourceModule) ||
    !isElementModule(typescriptModule) ||
    !isRootModule(sourceRootModule) ||
    !isRootModule(typescriptRootModule)
  ) {
    throw new Error("Rigid-offset Timoshenko modules do not expose the expected API.");
  }

  return {
    source: sourceModule,
    typescript: typescriptModule,
    sourceRoot: sourceRootModule,
    typescriptRoot: typescriptRootModule,
  };
}

function createNodes(): { startNode: RuntimeNode; endNode: RuntimeNode } {
  return {
    startNode: { id: "A-α", x: 0, y: 1 },
    endNode: { id: "B-β", x: 3, y: 1 },
  };
}

function createOptions(): Record<string, unknown> {
  const { startNode, endNode } = createNodes();
  return {
    id: "rigid-offset-γ",
    startNode,
    endNode,
    axialRigidity: 1e6,
    flexuralRigidity: 1000,
    shearRigidity: 100,
    shearCorrectionFactor: 1,
    rigidStartOffset: 1,
    rigidEndOffset: 1,
    referenceStartNode: { id: "A-ref-δ", x: 1, y: 0.5 },
    referenceEndNode: { id: "B-ref-ε", x: 2, y: 0.5 },
    metadata: {
      label: "asse Γ — prova",
      source: "strutture-js",
    },
    unsupported: "ignored",
  };
}

function createDefaultOptions(): Record<string, unknown> {
  const { startNode, endNode } = createNodes();
  return {
    id: "defaults-ζ",
    startNode,
    endNode,
    axialRigidity: 1e6,
    flexuralRigidity: 1000,
    shearRigidity: 100,
    shearCorrectionFactor: 1,
  };
}

void test("FrameElement2DTimoshenkoRigidOffsets matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(
    source.FrameElement2DTimoshenkoRigidOffsets,
    typescript.FrameElement2DTimoshenkoRigidOffsets,
  );
  assert.equal(
    sourceRoot.FrameElement2DTimoshenkoRigidOffsets,
    source.FrameElement2DTimoshenkoRigidOffsets,
  );
  assert.equal(
    typescriptRoot.FrameElement2DTimoshenkoRigidOffsets,
    typescript.FrameElement2DTimoshenkoRigidOffsets,
  );

  const sourceElement = new source.FrameElement2DTimoshenkoRigidOffsets(createOptions());
  const typescriptElement = new typescript.FrameElement2DTimoshenkoRigidOffsets(createOptions());

  assert.equal(sourceElement instanceof source.FrameElement2DTimoshenkoRigidOffsets, true);
  assert.equal(typescriptElement instanceof typescript.FrameElement2DTimoshenkoRigidOffsets, true);
  assert.equal(sourceElement instanceof typescript.FrameElement2DTimoshenkoRigidOffsets, false);
  assert.equal(typescriptElement instanceof source.FrameElement2DTimoshenkoRigidOffsets, false);
  assert.deepEqual(Object.keys(typescriptElement), Object.keys(sourceElement));
  assert.equal(sourceElement.type, "frame-2d-timoshenko-rigid-offsets");
  assert.equal(typescriptElement.type, sourceElement.type);
  assert.deepEqual(typescriptElement.referenceNodes(), sourceElement.referenceNodes());
  assert.deepEqual(
    typescriptElement.referenceDirectionCosines(),
    sourceElement.referenceDirectionCosines(),
  );
  assert.deepEqual(
    typescriptElement.kinematicTransformationMatrix(),
    sourceElement.kinematicTransformationMatrix(),
  );
  assert.deepEqual(typescriptElement.localStiffness(), sourceElement.localStiffness());
  assert.deepEqual(typescriptElement.transformationMatrix(), sourceElement.transformationMatrix());
  assert.deepEqual(typescriptElement.globalStiffness(), sourceElement.globalStiffness());
  assert.deepEqual(typescriptElement.getGlobalStiffness(), sourceElement.getGlobalStiffness());
  assert.deepEqual(typescriptElement.toJSON(), sourceElement.toJSON());
  assert.equal(JSON.stringify(typescriptElement.toJSON()), JSON.stringify(sourceElement.toJSON()));
  const sourceLabel = sourceElement.toJSON().metadata.label;
  const typescriptLabel = typescriptElement.toJSON().metadata.label;
  if (typeof sourceLabel !== "string" || typeof typescriptLabel !== "string") {
    throw new Error("Expected Unicode metadata labels in both serialized elements.");
  }
  assert.deepEqual(codePoints(typescriptLabel), codePoints(sourceLabel));

  const sourceReferenceElement = sourceElement.referenceElement();
  const typescriptReferenceElement = typescriptElement.referenceElement();
  assert.equal(sourceReferenceElement instanceof sourceRoot.FrameElement2DTimoshenko, true);
  assert.equal(typescriptReferenceElement instanceof typescriptRoot.FrameElement2DTimoshenko, true);
  assert.deepEqual(typescriptReferenceElement.toJSON(), sourceReferenceElement.toJSON());

  const sourceRegistry = new sourceRoot.DofRegistry().registerNodes(sourceElement.nodes);
  const typescriptRegistry = new typescriptRoot.DofRegistry().registerNodes(
    typescriptElement.nodes,
  );
  const globalDisplacements = [0.1, -0.2, 0.03, 0.4, -0.5, 0.06];
  assert.deepEqual(
    typescriptElement.getDofIds(typescriptRegistry),
    sourceElement.getDofIds(sourceRegistry),
  );
  assert.deepEqual(
    typescriptElement.localPhysicalDisplacements(globalDisplacements, typescriptRegistry),
    sourceElement.localPhysicalDisplacements(globalDisplacements, sourceRegistry),
  );
  assert.deepEqual(
    typescriptElement.localDeformableDisplacements(globalDisplacements, typescriptRegistry),
    sourceElement.localDeformableDisplacements(globalDisplacements, sourceRegistry),
  );
  assert.deepEqual(
    typescriptElement.localDisplacements(globalDisplacements, typescriptRegistry),
    sourceElement.localDisplacements(globalDisplacements, sourceRegistry),
  );
  assert.deepEqual(
    typescriptElement.localEndForces(globalDisplacements, typescriptRegistry),
    sourceElement.localEndForces(globalDisplacements, sourceRegistry),
  );
  assert.deepEqual(
    typescriptElement.equivalentNodalLoadVector(),
    sourceElement.equivalentNodalLoadVector(),
  );

  const sourceDefault = new source.FrameElement2DTimoshenkoRigidOffsets(createDefaultOptions());
  const typescriptDefault = new typescript.FrameElement2DTimoshenkoRigidOffsets(
    createDefaultOptions(),
  );
  assert.deepEqual(typescriptDefault.referenceNodes(), sourceDefault.referenceNodes());
  assert.deepEqual(typescriptDefault.toJSON(), sourceDefault.toJSON());

  const invalidConstructors: readonly [string, Record<string, unknown>][] = [
    ["missing id", {}],
    ["missing start node", { id: "invalid", endNode: { id: "B", x: 1, y: 0 } }],
    [
      "negative rigid offset",
      {
        id: "invalid",
        startNode: { id: "A", x: 0, y: 0 },
        endNode: { id: "B", x: 1, y: 0 },
        rigidStartOffset: -1,
      },
    ],
    [
      "incomplete explicit reference nodes",
      {
        id: "invalid",
        startNode: { id: "A", x: 0, y: 0 },
        endNode: { id: "B", x: 1, y: 0 },
        referenceStartNode: { id: "A-ref", x: 0, y: 0 },
      },
    ],
    [
      "non-finite explicit reference coordinate",
      {
        id: "invalid",
        startNode: { id: "A", x: 0, y: 0 },
        endNode: { id: "B", x: 1, y: 0 },
        referenceStartNode: { id: "A-ref", x: Number.NaN, y: 0 },
        referenceEndNode: { id: "B-ref", x: 1, y: 0 },
      },
    ],
  ];
  for (const [label, options] of invalidConstructors) {
    assertErrorParity(
      () => new source.FrameElement2DTimoshenkoRigidOffsets(options),
      () => new typescript.FrameElement2DTimoshenkoRigidOffsets(options),
      label,
    );
  }

  const zeroPhysicalOptions = {
    id: "zero-physical",
    startNode: { id: "A", x: 0, y: 0 },
    endNode: { id: "B", x: 0, y: 0 },
  };
  assertErrorParity(
    () => new source.FrameElement2DTimoshenkoRigidOffsets(zeroPhysicalOptions).physicalLength(),
    () => new typescript.FrameElement2DTimoshenkoRigidOffsets(zeroPhysicalOptions).physicalLength(),
    "zero physical length",
  );

  const zeroDeformableOptions = {
    id: "zero-deformable",
    startNode: { id: "A", x: 0, y: 0 },
    endNode: { id: "B", x: 2, y: 0 },
    rigidStartOffset: 1,
    rigidEndOffset: 1,
  };
  assertErrorParity(
    () => new source.FrameElement2DTimoshenkoRigidOffsets(zeroDeformableOptions).deformableLength(),
    () =>
      new typescript.FrameElement2DTimoshenkoRigidOffsets(zeroDeformableOptions).deformableLength(),
    "zero deformable length",
  );

  assertErrorParity(
    () => sourceElement.localDisplacements(undefined, sourceRegistry),
    () => typescriptElement.localDisplacements(undefined, typescriptRegistry),
    "invalid displacement vector",
  );
  assertErrorParity(
    () =>
      sourceElement.localEndForces(globalDisplacements, sourceRegistry, {
        equivalentNodalLoad: [0],
      }),
    () =>
      typescriptElement.localEndForces(globalDisplacements, typescriptRegistry, {
        equivalentNodalLoad: [0],
      }),
    "invalid equivalent nodal load vector",
  );
  assertErrorParity(
    () => sourceElement.equivalentNodalLoadVector({ loads: [{}] }),
    () => typescriptElement.equivalentNodalLoadVector({ loads: [{}] }),
    "unsupported element loads with rigid offsets",
  );
});
