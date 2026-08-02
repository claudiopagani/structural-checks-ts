import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSlipSurface {
  toJSON(): Record<string, unknown>;
}

interface RuntimeAction {
  designTendonForcePerUnitWidth: number;
  sourceVerificationStatus: string;
  toJSON(): Record<string, unknown>;
  evaluateForSlipSurface(slipSurface: RuntimeSlipSurface): Record<string, unknown>;
}

interface RuntimeModule {
  GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION: string;
  GroundAnchorStabilityAction2D: {
    new (options: Record<string, unknown>): RuntimeAction;
    fromGroundAnchorResult(result: Record<string, unknown>): RuntimeAction;
  };
  CircularSlipSurface2D: {
    new (options: Record<string, unknown>): RuntimeSlipSurface;
    fromChordAndSagitta(options: Record<string, unknown>): RuntimeSlipSurface;
  };
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object";
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function capture(action: () => unknown): { name: string; message: string } {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return { name: error.name, message: error.message };
    throw error;
  }
  throw new Error("Expected the ground-anchor action case to throw.");
}

function createOptions(): Record<string, unknown> {
  const inclination = (10 * Math.PI) / 180;
  const pointAtDistance = (distance: number) => ({
    x: 8 - distance * Math.cos(inclination),
    z: 2 - distance * Math.sin(inclination),
  });
  return {
    id: "anchor-α",
    head: pointAtDistance(0),
    bondStart: pointAtDistance(3),
    bondEnd: pointAtDistance(5),
    designTendonForce: 10,
    horizontalSpacing: 1,
    sourceVerificationStatus: "ok",
    forceModel: "fhwa-uniform-bond-proportional",
    units: { force: "kN", length: "m" },
    provenance: { source: "parity-source-β" },
    metadata: { label: "ancora γ" },
  };
}

function createSlipSurface(moduleValue: RuntimeModule): RuntimeSlipSurface {
  return moduleValue.CircularSlipSurface2D.fromChordAndSagitta({
    id: "circle-δ",
    entry: { x: 0, z: 10 },
    exit: { x: 10, z: 0 },
    sagitta: 2,
    units: { force: "kN", length: "m" },
  });
}

function createAction(moduleValue: RuntimeModule): RuntimeAction {
  return new moduleValue.GroundAnchorStabilityAction2D(createOptions());
}

void test("GroundAnchorStabilityAction2D matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("Ground-anchor stability exports do not expose the expected API.");
  }
  assert.equal(
    sourceModuleValue.GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION,
    typescriptModuleValue.GROUND_ANCHOR_STABILITY_ACTION_2D_SCHEMA_VERSION,
  );
  assert.notEqual(
    typescriptModuleValue.GroundAnchorStabilityAction2D,
    sourceModuleValue.GroundAnchorStabilityAction2D,
  );

  const sourceAction = createAction(sourceModuleValue);
  const typescriptAction = createAction(typescriptModuleValue);
  const sourceSlipSurface = createSlipSurface(sourceModuleValue);
  const typescriptSlipSurface = createSlipSurface(typescriptModuleValue);
  assert.deepEqual(typescriptAction.toJSON(), sourceAction.toJSON());
  assert.deepEqual(
    typescriptAction.evaluateForSlipSurface(typescriptSlipSurface),
    sourceAction.evaluateForSlipSurface(sourceSlipSurface),
  );
  assert.deepEqual(
    [...JSON.stringify(typescriptAction.toJSON())],
    [...JSON.stringify(sourceAction.toJSON())],
  );
  assert.equal(typescriptAction.toJSON().id, "anchor-α");
  const serializedMetadata = typescriptAction.toJSON().metadata;
  if (serializedMetadata === null || typeof serializedMetadata !== "object") {
    throw new Error("Expected serialized metadata.");
  }
  assert.equal(Reflect.get(serializedMetadata, "label"), "ancora γ");

  const serialized = sourceAction.toJSON();
  const resultInput = {
    applicationId: "geotechnical-ground-anchors",
    status: "ok",
    warnings: ["avviso-ε"],
    outputs: {
      schemaVersion: "ground-anchor-design-result/v1",
      groundModelId: "ground-model",
      designSituationId: "anchor-situation",
      anchor: {
        id: "result-anchor-ζ",
        horizontalSpacing: 2,
        units: { force: "kN", length: "m" },
      },
      couplings: {
        globalStability: {
          anchorAxis: {
            head: serialized.head,
            bondStart: serialized.bondStart,
            bondEnd: serialized.bondEnd,
          },
          actions: { designTendonForce: 120 },
        },
      },
    },
  };
  const sourceFactory =
    sourceModuleValue.GroundAnchorStabilityAction2D.fromGroundAnchorResult(resultInput);
  const typescriptFactory =
    typescriptModuleValue.GroundAnchorStabilityAction2D.fromGroundAnchorResult(resultInput);
  assert.deepEqual(typescriptFactory.toJSON(), sourceFactory.toJSON());
  assert.equal(typescriptFactory.sourceVerificationStatus, "ok");
  assert.equal(typescriptFactory.designTendonForcePerUnitWidth, 60);

  const invalidCases: readonly [
    (moduleValue: RuntimeModule) => unknown,
    (moduleValue: RuntimeModule) => unknown,
  ][] = [
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorStabilityAction2D({ ...createOptions(), units: null }),
      (moduleValue) =>
        new moduleValue.GroundAnchorStabilityAction2D({ ...createOptions(), units: null }),
    ],
    [
      (moduleValue) =>
        new moduleValue.GroundAnchorStabilityAction2D({
          ...createOptions(),
          forceModel: "unsupported-ζ",
        }),
      (moduleValue) =>
        new moduleValue.GroundAnchorStabilityAction2D({
          ...createOptions(),
          forceModel: "unsupported-ζ",
        }),
    ],
    [
      (moduleValue) => moduleValue.GroundAnchorStabilityAction2D.fromGroundAnchorResult({}),
      (moduleValue) => moduleValue.GroundAnchorStabilityAction2D.fromGroundAnchorResult({}),
    ],
    [
      (moduleValue) =>
        createAction(moduleValue).evaluateForSlipSurface(
          new moduleValue.CircularSlipSurface2D({
            ...createSlipSurface(moduleValue).toJSON(),
            movementDirection: "right-to-left",
          }),
        ),
      (moduleValue) =>
        createAction(moduleValue).evaluateForSlipSurface(
          new moduleValue.CircularSlipSurface2D({
            ...createSlipSurface(moduleValue).toJSON(),
            movementDirection: "right-to-left",
          }),
        ),
    ],
  ];
  for (const [sourceCase, typescriptCase] of invalidCases) {
    assert.deepEqual(
      capture(() => sourceCase(sourceModuleValue)),
      capture(() => typescriptCase(typescriptModuleValue)),
    );
  }
});
