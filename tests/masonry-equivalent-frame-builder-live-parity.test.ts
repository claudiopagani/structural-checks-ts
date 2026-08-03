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

interface RuntimeBuilderResult {
  readonly model: {
    readonly nodes: readonly unknown[];
    readonly elements: readonly RuntimeElement[];
  };
  readonly dofRegistry: { readonly toJSON: () => unknown };
  readonly snapshot: unknown;
  readonly warnings: readonly string[];
  readonly assumptions: readonly string[];
  readonly createSolver: () => unknown;
}

interface RuntimeElement {
  readonly toJSON: () => unknown;
}

interface RuntimeBuilderModule {
  readonly MasonryEquivalentFrameBuilder: new () => {
    build: (input?: unknown) => RuntimeBuilderResult;
  };
}

interface RuntimeModelModule {
  readonly MasonryWallOpeningsModel: new (input: unknown) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBuilderModule(value: unknown): value is RuntimeBuilderModule {
  return isRecord(value) && typeof value.MasonryEquivalentFrameBuilder === "function";
}

function isModelModule(value: unknown): value is RuntimeModelModule {
  return isRecord(value) && typeof value.MasonryWallOpeningsModel === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadBuilderModule(
  root: string,
  relativePath: string,
): Promise<RuntimeBuilderModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isBuilderModule(module)) throw new Error(`Missing builder export in ${relativePath}.`);
  return module;
}

async function loadModelModule(root: string, relativePath: string): Promise<RuntimeModelModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isModelModule(module)) throw new Error(`Missing model export in ${relativePath}.`);
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

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "allineamento-É",
    units: { force: "N", length: "m" },
    walls: [
      {
        id: "wall-1",
        length: 5,
        height: 3,
        thickness: 0.3,
        material: {
          fm: 6e6,
          tau0: 1e5,
          fv0: 2e5,
          E: 1.8e9,
          G: 6e8,
          units: { force: "N", length: "m" },
        },
      },
    ],
    openings: [{ id: "finestra-α", x: 2, y: 1, width: 1, height: 1 }],
    settings: {},
    metadata: { label: "parete-ß" },
    ...overrides,
  };
}

void test("MasonryEquivalentFrameBuilder matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceBuilder = await loadBuilderModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/analysis/MasonryEquivalentFrameBuilder.js",
  );
  const typescriptBuilder = await loadBuilderModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/analysis/MasonryEquivalentFrameBuilder.js",
  );
  const sourceModel = await loadModelModule(
    sourceRoot,
    "src/applications/masonry-wall-openings/models/MasonryWallOpeningsModel.js",
  );
  const typescriptModel = await loadModelModule(
    path.join(repositoryRoot, "dist"),
    "applications/masonry-wall-openings/models/MasonryWallOpeningsModel.js",
  );
  const sourceRootModule = await loadBuilderModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadBuilderModule(
    path.join(repositoryRoot, "dist"),
    "index.js",
  );

  assert.notEqual(
    sourceBuilder.MasonryEquivalentFrameBuilder,
    typescriptBuilder.MasonryEquivalentFrameBuilder,
  );
  assert.equal(
    sourceRootModule.MasonryEquivalentFrameBuilder,
    sourceBuilder.MasonryEquivalentFrameBuilder,
  );
  assert.equal(
    typescriptRootModule.MasonryEquivalentFrameBuilder,
    typescriptBuilder.MasonryEquivalentFrameBuilder,
  );
  assert.notEqual(
    sourceRootModule.MasonryEquivalentFrameBuilder,
    typescriptRootModule.MasonryEquivalentFrameBuilder,
  );

  const fixtures: readonly {
    options?: Record<string, unknown>;
    input?: Record<string, unknown>;
  }[] = [
    {},
    { options: { topRotation: "fixed" } },
    { options: { includeSpandrels: true } },
    { options: { includeDiaphragm: true } },
    {
      options: { includeDiaphragm: true },
      input: {
        openings: [
          {
            id: "finestra-α",
            x: 2,
            y: 1,
            width: 1,
            height: 1,
            ringFrame: {
              memberSections: { columns: "IPE200", topBeam: "IPE200" },
              material: "S275",
              baseCondition: "fixed-base",
            },
          },
        ],
      },
    },
  ];

  for (const [index, current] of fixtures.entries()) {
    const sourceAlignment = new sourceModel.MasonryWallOpeningsModel(fixture(current.input));
    const typescriptAlignment = new typescriptModel.MasonryWallOpeningsModel(
      fixture(current.input),
    );
    const sourceResult = new sourceBuilder.MasonryEquivalentFrameBuilder().build({
      alignment: sourceAlignment,
      options: current.options ?? {},
    });
    const typescriptResult = new typescriptBuilder.MasonryEquivalentFrameBuilder().build({
      alignment: typescriptAlignment,
      options: current.options ?? {},
    });

    exactJson(sourceResult.snapshot, typescriptResult.snapshot, `fixture ${index}: snapshot`);
    exactJson(
      sourceResult.dofRegistry.toJSON(),
      typescriptResult.dofRegistry.toJSON(),
      `fixture ${index}: DOF registry`,
    );
    exactJson(sourceResult.warnings, typescriptResult.warnings, `fixture ${index}: warnings`);
    exactJson(
      sourceResult.assumptions,
      typescriptResult.assumptions,
      `fixture ${index}: assumptions`,
    );
    exactJson(
      sourceResult.model.elements.map((element) => element.toJSON()),
      typescriptResult.model.elements.map((element) => element.toJSON()),
      `fixture ${index}: element serialization`,
    );
    assert.deepEqual(typescriptResult.model.nodes.length, sourceResult.model.nodes.length);
    assert.deepEqual(typescriptResult.model.elements.length, sourceResult.model.elements.length);
  }

  assertErrorParity(
    () => new sourceBuilder.MasonryEquivalentFrameBuilder().build(),
    () => new typescriptBuilder.MasonryEquivalentFrameBuilder().build(),
    "missing alignment",
  );
  assertErrorParity(
    () =>
      new sourceBuilder.MasonryEquivalentFrameBuilder().build({
        alignment: new sourceModel.MasonryWallOpeningsModel(fixture()),
        options: { topRotation: "non-supportato-δ" },
      }),
    () =>
      new typescriptBuilder.MasonryEquivalentFrameBuilder().build({
        alignment: new typescriptModel.MasonryWallOpeningsModel(fixture()),
        options: { topRotation: "non-supportato-δ" },
      }),
    "unsupported top rotation",
  );
});
