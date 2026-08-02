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

interface RuntimeElement {
  readonly id: string;
  readonly type: string;
  readonly nodes: RuntimeNode[];
  readonly material: unknown;
  readonly crossSection: unknown;
  readonly metadata: Record<string, unknown>;
  addNode(node: RuntimeNode): RuntimeElement;
  nodeIds(): string[];
  toJSON(): unknown;
}

interface RuntimeElementModule {
  readonly StructuralElement: new (options: Record<string, unknown>) => RuntimeElement;
}

interface RuntimeRootModule extends RuntimeElementModule {
  readonly StructuralElement: RuntimeElementModule["StructuralElement"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isElementModule(value: unknown): value is RuntimeElementModule {
  return isRecord(value) && typeof value.StructuralElement === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return isElementModule(value);
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
    pathToFileURL(path.join(sourceRoot, "src", "domain", "elements", "StructuralElement.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "domain", "elements", "StructuralElement.js"))
      .href
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
    throw new Error("StructuralElement modules do not expose the expected API.");
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
    id: "element-α",
    type: "beam",
    nodes: [{ id: "n-α" }, { id: "n-β" }],
    material: {
      toJSON(): unknown {
        return { name: "calcestruzzo δοκιμή", grade: "C25/30" };
      },
    },
    crossSection: {
      toJSON(): unknown {
        return { name: "rettangolare", width: 0.3, height: 0.5 };
      },
    },
    metadata: { label: "Elemento δοκιμή", source: "strutture-js" },
    unsupported: "ignored",
  };
}

void test("StructuralElement matches the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript, sourceRoot, typescriptRoot } = await loadModules();

  assert.notEqual(source.StructuralElement, typescript.StructuralElement);
  assert.equal(sourceRoot.StructuralElement, source.StructuralElement);
  assert.equal(typescriptRoot.StructuralElement, typescript.StructuralElement);

  const sourceElement = new source.StructuralElement(createOptions());
  const typescriptElement = new typescript.StructuralElement(createOptions());

  assert.equal(sourceElement instanceof source.StructuralElement, true);
  assert.equal(typescriptElement instanceof typescript.StructuralElement, true);
  assert.equal(sourceElement instanceof typescript.StructuralElement, false);
  assert.equal(typescriptElement instanceof source.StructuralElement, false);
  assert.deepEqual(typescriptElement.toJSON(), sourceElement.toJSON());
  assert.equal(JSON.stringify(typescriptElement.toJSON()), JSON.stringify(sourceElement.toJSON()));
  assert.deepEqual(typescriptElement.nodeIds(), sourceElement.nodeIds());

  const sourceAdded = sourceElement.addNode({ id: "n-γ" });
  const typescriptAdded = typescriptElement.addNode({ id: "n-γ" });
  assert.equal(sourceAdded, sourceElement);
  assert.equal(typescriptAdded, typescriptElement);
  assert.deepEqual(typescriptAdded.nodeIds(), sourceAdded.nodeIds());
  assert.deepEqual(typescriptAdded.toJSON(), sourceAdded.toJSON());

  const sourceDefault = new source.StructuralElement({ id: "default-α", type: "generic" });
  const typescriptDefault = new typescript.StructuralElement({
    id: "default-α",
    type: "generic",
  });
  assert.deepEqual(typescriptDefault.toJSON(), sourceDefault.toJSON());

  assertErrorParity(
    () => new source.StructuralElement({ type: "beam" }),
    () => new typescript.StructuralElement({ type: "beam" }),
    "missing id",
  );
  assertErrorParity(
    () => new source.StructuralElement({ id: "element" }),
    () => new typescript.StructuralElement({ id: "element" }),
    "missing type",
  );
  assertErrorParity(
    () =>
      new source.StructuralElement({
        id: "element",
        type: "beam",
        material: { toJSON: "unsupported" },
      }).toJSON(),
    () =>
      new typescript.StructuralElement({
        id: "element",
        type: "beam",
        material: { toJSON: "unsupported" },
      }).toJSON(),
    "non-callable material toJSON",
  );

  assert.equal(sourceElement.id, "element-α");
  assert.deepEqual(codePoints(typescriptElement.id), codePoints(sourceElement.id));
  assert.equal(sourceElement.toJSON() instanceof Object, true);
  assert.equal(typescriptElement.toJSON() instanceof Object, true);
});
