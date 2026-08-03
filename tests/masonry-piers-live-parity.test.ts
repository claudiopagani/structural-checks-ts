import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface ModelRuntime {
  toJSON(): unknown;
  grossArea(): number;
  inPlaneInertia(): number;
  resolvedEquivalentFrameRigidities(): unknown;
  resolvedNormativeMaterial(): unknown;
}

interface ResultRuntime {
  toJSON(): unknown;
}

interface BuilderRuntime {
  build(input?: { model?: ModelRuntime }): {
    snapshot: unknown;
  };
}

interface ApplicationRuntime {
  run(input?: Record<string, unknown>): ResultRuntime;
}

interface ModuleRuntime {
  MasonryPierApplication: new () => ApplicationRuntime;
  MasonryPierEquivalentFrameBuilder: new () => BuilderRuntime;
  MasonryPierModel: new (options: Record<string, unknown>) => ModelRuntime;
  MasonryPierVerticalVerification: new (options?: Record<string, unknown>) => {
    verify(input?: { model?: ModelRuntime }): ResultRuntime;
  };
  NTC2018MasonryPierAnalysis: new () => {
    analyze(input?: { model?: ModelRuntime }): ResultRuntime;
  };
  NTC2018MasonryPierModel: new (options: Record<string, unknown>) => ModelRuntime;
}

function isModuleRuntime(value: unknown): value is ModuleRuntime {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "MasonryPierApplication") === "function" &&
    typeof Reflect.get(value, "MasonryPierEquivalentFrameBuilder") === "function" &&
    typeof Reflect.get(value, "MasonryPierModel") === "function" &&
    typeof Reflect.get(value, "MasonryPierVerticalVerification") === "function" &&
    typeof Reflect.get(value, "NTC2018MasonryPierAnalysis") === "function" &&
    typeof Reflect.get(value, "NTC2018MasonryPierModel") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error: unknown) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the masonry-pier case to throw.");
}

function assertExact(actual: unknown, expected: unknown): void {
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  assert.deepEqual([...JSON.stringify(actual)], [...JSON.stringify(expected)]);
}

function createVerticalOptions(): Record<string, unknown> {
  const units = { force: "N", length: "mm" };
  return {
    id: "pier-vertical-α",
    units,
    geometry: {
      height: 3000,
      length: 1000,
      thickness: 300,
      baseX: 100,
      baseY: 200,
      transverseWallSpacing: 2500,
    },
    material: {
      fm: 6,
      E: 1800,
      G: 600,
      w: 0.000018,
      units,
      metadata: { label: "masonry β" },
    },
    actions: {
      axialForce: 200000,
      outOfPlaneMoment: 2500000,
      inPlaneMoment: 16666666.6666667,
      outOfPlaneVerticalLoadEccentricity: 10,
    },
    design: {
      gammaM: 2,
      confidenceFactor: 1.2,
    },
    idealization: {
      rigidEndZoneBottom: 200,
      rigidEndZoneTop: 300,
    },
    metadata: { label: "pilastro β" },
  };
}

function createNormativeOptions(): Record<string, unknown> {
  const units = { force: "N", length: "mm" };
  return {
    id: "pier-ntc-β",
    units,
    geometry: { height: 3000, length: 1500, thickness: 300 },
    material: {
      units,
      fm: 4,
      tau0: 0.08,
      fv0: 0.12,
      E: 1800,
      G: 600,
    },
    actions: { axialForce: 300000, lateralDisplacement: 20 },
    design: { confidenceFactor: 1.2 },
    normative: {
      scope: "existing",
      masonryTexture: "irregular",
      blockCompressiveStrength: 12,
    },
  };
}

async function loadModules(): Promise<readonly [ModuleRuntime, ModuleRuntime]> {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isModuleRuntime(sourceModule) || !isModuleRuntime(typescriptModule)) {
    throw new Error("Masonry-pier exports do not expose the expected API.");
  }
  assert.notEqual(typescriptModule.MasonryPierModel, sourceModule.MasonryPierModel);
  return [sourceModule, typescriptModule];
}

void test("masonry-pier models, verifications, analyses and idealizations match the pinned JavaScript implementation", async () => {
  const [sourceModule, typescriptModule] = await loadModules();
  const sourceModel = new sourceModule.MasonryPierModel(createVerticalOptions());
  const typescriptModel = new typescriptModule.MasonryPierModel(createVerticalOptions());
  assertExact(typescriptModel.toJSON(), sourceModel.toJSON());
  assert.equal(typescriptModel.grossArea(), sourceModel.grossArea());
  assert.equal(typescriptModel.inPlaneInertia(), sourceModel.inPlaneInertia());
  assertExact(
    typescriptModel.resolvedEquivalentFrameRigidities(),
    sourceModel.resolvedEquivalentFrameRigidities(),
  );

  const sourceVertical = new sourceModule.MasonryPierVerticalVerification({
    code: "NTC2018",
    metadata: { label: "verifica γ" },
  }).verify({ model: sourceModel });
  const typescriptVertical = new typescriptModule.MasonryPierVerticalVerification({
    code: "NTC2018",
    metadata: { label: "verifica γ" },
  }).verify({ model: typescriptModel });
  assertExact(typescriptVertical.toJSON(), sourceVertical.toJSON());

  const sourceBuilder = new sourceModule.MasonryPierEquivalentFrameBuilder().build({
    model: sourceModel,
  });
  const typescriptBuilder = new typescriptModule.MasonryPierEquivalentFrameBuilder().build({
    model: typescriptModel,
  });
  assertExact(typescriptBuilder.snapshot, sourceBuilder.snapshot);

  const sourceApplication = new sourceModule.MasonryPierApplication().run({ model: sourceModel });
  const typescriptApplication = new typescriptModule.MasonryPierApplication().run({
    model: typescriptModel,
  });
  assertExact(typescriptApplication.toJSON(), sourceApplication.toJSON());

  const sourceNormativeModel = new sourceModule.NTC2018MasonryPierModel(createNormativeOptions());
  const typescriptNormativeModel = new typescriptModule.NTC2018MasonryPierModel(
    createNormativeOptions(),
  );
  assertExact(
    typescriptNormativeModel.resolvedNormativeMaterial(),
    sourceNormativeModel.resolvedNormativeMaterial(),
  );
  assertExact(typescriptNormativeModel.toJSON(), sourceNormativeModel.toJSON());
  const sourceAnalysis = new sourceModule.NTC2018MasonryPierAnalysis().analyze({
    model: sourceNormativeModel,
  });
  const typescriptAnalysis = new typescriptModule.NTC2018MasonryPierAnalysis().analyze({
    model: typescriptNormativeModel,
  });
  assertExact(typescriptAnalysis.toJSON(), sourceAnalysis.toJSON());
  const sourceBilinearApplication = new sourceModule.MasonryPierApplication().run({
    analysisType: "ntc2018-bilinear",
    model: sourceNormativeModel,
  });
  const typescriptBilinearApplication = new typescriptModule.MasonryPierApplication().run({
    analysisType: "ntc2018-bilinear",
    model: typescriptNormativeModel,
  });
  assertExact(typescriptBilinearApplication.toJSON(), sourceBilinearApplication.toJSON());

  const invalidCases: readonly [
    (moduleValue: ModuleRuntime) => unknown,
    (moduleValue: ModuleRuntime) => unknown,
  ][] = [
    [
      (moduleValue) => new moduleValue.MasonryPierModel({}),
      (moduleValue) => new moduleValue.MasonryPierModel({}),
    ],
    [
      (moduleValue) =>
        new moduleValue.MasonryPierModel({
          ...createVerticalOptions(),
          id: "unsupported-convention",
          actions: { axialForceConvention: "tension-positive" },
        }),
      (moduleValue) =>
        new moduleValue.MasonryPierModel({
          ...createVerticalOptions(),
          id: "unsupported-convention",
          actions: { axialForceConvention: "tension-positive" },
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.MasonryPierVerticalVerification().verify({
          model: new moduleValue.MasonryPierModel({
            ...createVerticalOptions(),
            id: "missing-gamma",
            design: {},
          }),
        }),
      (moduleValue) =>
        new moduleValue.MasonryPierVerticalVerification().verify({
          model: new moduleValue.MasonryPierModel({
            ...createVerticalOptions(),
            id: "missing-gamma",
            design: {},
          }),
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.NTC2018MasonryPierModel({
          ...createNormativeOptions(),
          normative: { scope: "new" },
        }),
      (moduleValue) =>
        new moduleValue.NTC2018MasonryPierModel({
          ...createNormativeOptions(),
          normative: { scope: "new" },
        }),
    ],
    [
      (moduleValue) =>
        new moduleValue.MasonryPierEquivalentFrameBuilder().build({
          model: new moduleValue.MasonryPierModel({
            ...createVerticalOptions(),
            id: "unsupported-element-class",
            idealization: { elementClass: "unsupported" },
          }),
        }),
      (moduleValue) =>
        new moduleValue.MasonryPierEquivalentFrameBuilder().build({
          model: new moduleValue.MasonryPierModel({
            ...createVerticalOptions(),
            id: "unsupported-element-class",
            idealization: { elementClass: "unsupported" },
          }),
        }),
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCase(sourceModule)),
      capture(() => typescriptCase(typescriptModule)),
    );
  }
});
