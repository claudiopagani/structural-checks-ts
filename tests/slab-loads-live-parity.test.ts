import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeLoad {
  readonly id: string;
  readonly loadGroup?: string;
  readonly effect?: string;
  readonly description?: string;
  readonly value?: number;
  readonly variableLoadId?: number;
  readonly psi0?: number;
  readonly psi1?: number;
  readonly psi2?: number;
  toJSON(): unknown;
}

interface RuntimeFloorSlab {
  readonly description: string;
  readonly loads: RuntimeLoad[];
  readonly g1UnfavourableTotal: number;
  readonly g1FavourableTotal: number;
  readonly g2UnfavourableTotal: number;
  readonly g2FavourableTotal: number;
  readonly variableLoads: RuntimeLoad[];
  readonly variableTotal: number;
  readonly servicePermanentTotal: number;
  withDescription(description: string): RuntimeFloorSlab;
  addLoad(load: RuntimeLoad): RuntimeFloorSlab;
  removeLoad(loadId: number): RuntimeFloorSlab;
}

interface RuntimeAnalysis {
  calculateULS(coefficients?: Record<string, unknown>): unknown;
  calculateSLE(): unknown;
}

interface RuntimeAnalysisConstructor {
  new (floorSlab: RuntimeFloorSlab): RuntimeAnalysis;
  readonly prototype: RuntimeAnalysis;
}

interface RuntimeConstructor<TInstance> {
  new (options: Record<string, unknown>): TInstance;
  readonly prototype: TInstance;
}

interface RuntimeSlabLoadConstructor extends RuntimeConstructor<RuntimeLoad> {
  nextId: number;
}

interface RuntimeVariableLoadConstructor extends RuntimeConstructor<RuntimeLoad> {
  nextVariableId: number;
}

interface RuntimeModule {
  readonly AreaLoad: RuntimeConstructor<RuntimeLoad>;
  readonly SlabLoad: RuntimeSlabLoadConstructor;
  readonly SurfaceLoad: RuntimeConstructor<RuntimeLoad>;
  readonly LayerLoad: RuntimeConstructor<RuntimeLoad>;
  readonly LinearLoadFromLineWeight: RuntimeConstructor<RuntimeLoad>;
  readonly LinearLoadFromVolumeWeight: RuntimeConstructor<RuntimeLoad>;
  readonly VariableLoad: RuntimeVariableLoadConstructor;
  readonly WallLoad: RuntimeConstructor<RuntimeLoad>;
  readonly FloorSlab: RuntimeConstructor<RuntimeFloorSlab>;
  readonly NTC2018SlabLoadAnalysis: RuntimeAnalysisConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeModule(value: unknown): value is RuntimeModule {
  if (!isRecord(value)) return false;
  return [
    "AreaLoad",
    "SlabLoad",
    "SurfaceLoad",
    "LayerLoad",
    "LinearLoadFromLineWeight",
    "LinearLoadFromVolumeWeight",
    "VariableLoad",
    "WallLoad",
    "FloorSlab",
    "NTC2018SlabLoadAnalysis",
  ].every((name) => typeof value[name] === "function");
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error("Expected a code point for every character.");
    }
    return codePoint;
  });
}

function assertDeepParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);

  const compareUnicode = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      assert.deepEqual(
        codePoints(left as string),
        codePoints(right as string),
        `${label}${valuePath}: Unicode code points`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compareUnicode(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      Object.keys(left).forEach((key) =>
        compareUnicode(left[key], right[key], `${valuePath}.${key}`),
      );
    }
  };

  compareUnicode(source, typescript, "$");
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error: unknown) {
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

async function loadModules(): Promise<{ source: RuntimeModule; typescript: RuntimeModule }> {
  const sourceModule: unknown = await import(
    pathToFileURL(path.join(sourceRoot, "src", "index.js")).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
  );
  assert.ok(isRuntimeModule(sourceModule));
  assert.ok(isRuntimeModule(typescriptModule));
  return { source: sourceModule, typescript: typescriptModule };
}

function createScenario(module: RuntimeModule): Record<string, unknown> {
  module.SlabLoad.nextId = 1;
  module.VariableLoad.nextVariableId = 1;
  const units = { force: "kN", length: "m" };
  const permanent = new module.SurfaceLoad({
    description: "Permanente α",
    loadGroup: "G1",
    effect: "favourable",
    surfaceWeight: 3.2,
    units,
  });
  const layer = new module.LayerLoad({
    description: "Massetto β",
    loadGroup: "G2",
    density: 2.4,
    thickness: 0.2,
    units,
  });
  const line = new module.LinearLoadFromLineWeight({
    description: "Tramezzo γ",
    loadGroup: "G2",
    lineWeight: 4,
    spacing: 0.5,
    units,
  });
  const volume = new module.LinearLoadFromVolumeWeight({
    description: "Parete δ",
    loadGroup: "G1",
    density: 2.4,
    area: 0.8,
    spacing: 2,
    units,
  });
  const wall = new module.WallLoad({
    description: "Muro ε",
    loadGroup: "G1",
    density: 18,
    height: 3,
    thickness: 0.2,
    spacing: 4,
    units,
  });
  const variableA = new module.VariableLoad({
    description: "Uso uffici ζ",
    value: 2.5,
    psi0: 0.7,
    psi1: 0.5,
    psi2: 0.3,
    category: "uffici",
    units,
  });
  const variableB = new module.VariableLoad({
    description: "Neve η",
    value: 1.2,
    psi0: 0.5,
    psi1: 0.2,
    psi2: 0.0,
    category: "neve",
    units,
  });
  const floorSlab = new module.FloorSlab({
    description: "Solaio principale θ",
    loads: [permanent, layer, line, volume, wall, variableA, variableB],
  });
  const analysis = new module.NTC2018SlabLoadAnalysis(floorSlab);
  const added = floorSlab.addLoad(
    new module.SurfaceLoad({
      description: "Aggiunta ι",
      loadGroup: "G1",
      surfaceWeight: 0.4,
      units,
    }),
  );
  const renamed = floorSlab.withDescription("Solaio rinominato κ");
  const unchanged = floorSlab.removeLoad(999);
  return {
    loads: floorSlab.loads.map((load) => load.toJSON()),
    totals: {
      g1Unfavourable: floorSlab.g1UnfavourableTotal,
      g1Favourable: floorSlab.g1FavourableTotal,
      g2Unfavourable: floorSlab.g2UnfavourableTotal,
      g2Favourable: floorSlab.g2FavourableTotal,
      variable: floorSlab.variableTotal,
      servicePermanent: floorSlab.servicePermanentTotal,
    },
    variableIds: floorSlab.variableLoads.map((load) => load.variableLoadId),
    renamed: renamed.description,
    addedLoadCount: added.loads.length,
    unchangedLoadCount: unchanged.loads.length,
    uls: analysis.calculateULS(),
    ulsCustom: analysis.calculateULS({ qUnfavourable: 1.35 }),
    sle: analysis.calculateSLE(),
  };
}

void test("slab loads and NTC analysis match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const { source, typescript } = await loadModules();
  assert.notEqual(source.SlabLoad, typescript.SlabLoad);
  assert.notEqual(source.FloorSlab, typescript.FloorSlab);
  assert.notEqual(source.NTC2018SlabLoadAnalysis, typescript.NTC2018SlabLoadAnalysis);
  assert.equal(source.SurfaceLoad.prototype instanceof source.SlabLoad, true);
  assert.equal(typescript.SurfaceLoad.prototype instanceof typescript.SlabLoad, true);
  assertDeepParity(createScenario(source), createScenario(typescript), "slab scenario");

  assertErrorParity(
    () =>
      new source.SlabLoad({
        description: "",
        loadGroup: "G1",
        units: { force: "kN", length: "m" },
      }),
    () =>
      new typescript.SlabLoad({
        description: "",
        loadGroup: "G1",
        units: { force: "kN", length: "m" },
      }),
    "empty description error",
  );
  assertErrorParity(
    () =>
      new source.SlabLoad({
        description: "Unsupported",
        loadGroup: "G3",
        units: { force: "kN", length: "m" },
      }),
    () =>
      new typescript.SlabLoad({
        description: "Unsupported",
        loadGroup: "G3",
        units: { force: "kN", length: "m" },
      }),
    "unsupported load group error",
  );
  assertErrorParity(
    () =>
      new source.SurfaceLoad({
        description: "Non finito",
        loadGroup: "G1",
        surfaceWeight: Number.NaN,
        units: { force: "kN", length: "m" },
      }),
    () =>
      new typescript.SurfaceLoad({
        description: "Non finito",
        loadGroup: "G1",
        surfaceWeight: Number.NaN,
        units: { force: "kN", length: "m" },
      }),
    "invalid surface load error",
  );
  assertErrorParity(
    () =>
      new source.VariableLoad({
        description: "Qk non finito",
        value: Number.NaN,
        psi0: 0.7,
        psi1: 0.5,
        psi2: 0.3,
        units: { force: "kN", length: "m" },
      }),
    () =>
      new typescript.VariableLoad({
        description: "Qk non finito",
        value: Number.NaN,
        psi0: 0.7,
        psi1: 0.5,
        psi2: 0.3,
        units: { force: "kN", length: "m" },
      }),
    "invalid variable load error",
  );
  assertErrorParity(
    () => new source.FloorSlab({ description: "Solaio invalido", loads: [{}] }),
    () => new typescript.FloorSlab({ description: "Solaio invalido", loads: [{}] }),
    "invalid floor slab load error",
  );
  assertErrorParity(
    () => new source.FloorSlab({ description: "Solaio", loads: [] }).removeLoad(1.5),
    () => new typescript.FloorSlab({ description: "Solaio", loads: [] }).removeLoad(1.5),
    "invalid load id error",
  );
});
