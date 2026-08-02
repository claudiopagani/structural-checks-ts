import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeSoilStructureInterface {
  getParameterSet(parameterSetId?: string | null): Record<string, unknown>;
  resolveFrictionAngle(options: Record<string, unknown>): Record<string, unknown>;
  toJSON(): Record<string, unknown>;
}

interface RuntimeSoilStructureInterfaceModule {
  SOIL_STRUCTURE_INTERFACE_MODELS: readonly string[];
  SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION: string;
  SoilStructureInterface: new (options: Record<string, unknown>) => RuntimeSoilStructureInterface;
}

function isRuntimeModule(value: unknown): value is RuntimeSoilStructureInterfaceModule {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(Reflect.get(value, "SOIL_STRUCTURE_INTERFACE_MODELS")) &&
    typeof Reflect.get(value, "SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION") === "string" &&
    typeof Reflect.get(value, "SoilStructureInterface") === "function"
  );
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
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

void test("SoilStructureInterface matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  const sourceModuleValue: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModuleValue: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  if (!isRuntimeModule(sourceModuleValue) || !isRuntimeModule(typescriptModuleValue)) {
    throw new Error("SoilStructureInterface exports do not expose the expected API.");
  }

  assert.deepEqual(
    typescriptModuleValue.SOIL_STRUCTURE_INTERFACE_MODELS,
    sourceModuleValue.SOIL_STRUCTURE_INTERFACE_MODELS,
  );
  assert.equal(
    typescriptModuleValue.SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION,
    sourceModuleValue.SOIL_STRUCTURE_INTERFACE_SCHEMA_VERSION,
  );
  assert.notEqual(
    sourceModuleValue.SoilStructureInterface,
    typescriptModuleValue.SoilStructureInterface,
  );

  const assignedOptions: Record<string, unknown> = {
    id: "interface-\u03B1",
    name: "Interfaccia \u03B2",
    wallSurface: {
      typeId: "formed-concrete",
      materialType: "concrete",
      finish: "smooth",
      metadata: { label: "calcestruzzo \u03B3" },
    },
    parameterSets: [
      {
        id: "assigned",
        basis: "characteristic",
        model: "assigned-angle",
        frictionAngle: 24,
        angleUnits: "deg",
        soilInterfaceClassId: "medium-sand",
        provenance: { source: "catalogue \u03B4" },
        metadata: { label: "assegnato \u03B5" },
      },
    ],
    metadata: { label: "parete \u03B6", unicode: "\u03B7\u03B8\u03B9" },
  };
  const sourceAssigned = new sourceModuleValue.SoilStructureInterface(assignedOptions);
  const typescriptAssigned = new typescriptModuleValue.SoilStructureInterface(assignedOptions);
  assert.deepEqual(typescriptAssigned.getParameterSet(), sourceAssigned.getParameterSet());
  assert.deepEqual(
    typescriptAssigned.resolveFrictionAngle({ soilFrictionAngles: [0.3, 0.4] }),
    sourceAssigned.resolveFrictionAngle({ soilFrictionAngles: [0.3, 0.4] }),
  );
  assert.deepEqual(typescriptAssigned.toJSON(), sourceAssigned.toJSON());
  assert.equal(
    JSON.stringify(typescriptAssigned.toJSON()),
    JSON.stringify(sourceAssigned.toJSON()),
  );

  const ratioOptions: Record<string, unknown> = {
    ...assignedOptions,
    id: "ratio-interface",
    parameterSets: [
      {
        id: "ratio",
        basis: "indicative",
        model: "soil-friction-ratio",
        frictionRatio: 0.8,
        provenance: { source: "ratio-catalogue" },
      },
    ],
    defaultParameterSetId: "ratio",
  };
  const sourceRatio = new sourceModuleValue.SoilStructureInterface(ratioOptions);
  const typescriptRatio = new typescriptModuleValue.SoilStructureInterface(ratioOptions);
  assert.deepEqual(
    typescriptRatio.resolveFrictionAngle({ soilFrictionAngles: [0.2, 0.6] }),
    sourceRatio.resolveFrictionAngle({ soilFrictionAngles: [0.2, 0.6] }),
  );
  assert.deepEqual(typescriptRatio.toJSON(), sourceRatio.toJSON());

  const errorInputs: readonly Record<string, unknown>[] = [
    { id: "missing-surface", parameterSets: assignedOptions.parameterSets },
    {
      ...assignedOptions,
      parameterSets: [
        {
          id: "invalid-model",
          basis: "characteristic",
          model: "unsupported",
        },
      ],
    },
    {
      ...assignedOptions,
      parameterSets: [
        {
          id: "invalid-angle",
          basis: "characteristic",
          model: "assigned-angle",
          frictionAngle: 90,
          angleUnits: "deg",
        },
      ],
    },
    {
      ...assignedOptions,
      parameterSets: [
        {
          id: "invalid-ratio",
          basis: "characteristic",
          model: "soil-friction-ratio",
          frictionRatio: 1.1,
        },
      ],
    },
  ];
  for (const errorInput of errorInputs) {
    const sourceError = errorSnapshot(
      () => new sourceModuleValue.SoilStructureInterface(errorInput),
    );
    const typescriptError = errorSnapshot(
      () => new typescriptModuleValue.SoilStructureInterface(errorInput),
    );
    assert.deepEqual(typescriptError, sourceError);
  }

  const sourceResolveError = errorSnapshot(() =>
    sourceAssigned.resolveFrictionAngle({ soilFrictionAngles: [] }),
  );
  const typescriptResolveError = errorSnapshot(() =>
    typescriptAssigned.resolveFrictionAngle({ soilFrictionAngles: [] }),
  );
  assert.deepEqual(typescriptResolveError, sourceResolveError);
  const sourceParameterError = errorSnapshot(() => sourceAssigned.getParameterSet("unknown"));
  const typescriptParameterError = errorSnapshot(() =>
    typescriptAssigned.getParameterSet("unknown"),
  );
  assert.deepEqual(typescriptParameterError, sourceParameterError);
});
