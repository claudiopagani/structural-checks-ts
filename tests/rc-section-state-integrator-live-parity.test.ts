import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");

type RuntimeModule = Record<string, unknown>;
type IntegratorConstructor = new () => {
  evaluate(options: unknown): unknown;
  createAxialForceEvaluator(options: unknown): (strainField: unknown) => unknown;
  createResultantEvaluator(options: unknown): (strainField: unknown) => unknown;
};
type ErrorRecord = { name: string; message: string };

function isRecord(value: unknown): value is RuntimeModule {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIntegratorConstructor(value: unknown): value is IntegratorConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function errorRecord(error: unknown): ErrorRecord {
  if (!isRecord(error) || typeof error.name !== "string" || typeof error.message !== "string") {
    throw new Error("Expected an Error-like record.");
  }
  return { name: error.name, message: error.message };
}

function captureError(action: () => unknown): ErrorRecord {
  try {
    action();
  } catch (error) {
    return errorRecord(error);
  }
  throw new Error("Expected the action to throw.");
}

function assertExactParity(source: unknown, typescript: unknown, label: string): void {
  assert.deepEqual(typescript, source, label);
  assert.equal(JSON.stringify(typescript), JSON.stringify(source), `${label}: exact JSON`);
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function createSection(): {
  concreteSection: object;
  getReferencePoint(): { y: number; z: number };
  getReinforcementBars(): Array<{ id: string; y: number; z: number; area: number }>;
} {
  return {
    concreteSection: {},
    getReferencePoint: () => ({ y: 0, z: 0 }),
    getReinforcementBars: () => [{ id: "bar-1", y: 2, z: -1, area: 4 }],
  };
}

function createConcreteLaw(): {
  stress(strain: number): number;
  strainLimits(): { tension: number; compression: number };
} {
  return {
    stress: (strain) => strain * 1000,
    strainLimits: () => ({ tension: 0.01, compression: -0.01 }),
  };
}

function createSteelLaw(): {
  stress(strain: number): number;
  strainLimits(): { tension: number; compression: number };
} {
  return {
    stress: (strain) => strain * 2000,
    strainLimits: () => ({ tension: 0.02, compression: -0.02 }),
  };
}

function createOptions(): Record<string, unknown> {
  return {
    section: createSection(),
    concreteFibers: [
      { y: -1, z: -2, area: 3 },
      { y: 3, z: 4, area: 5 },
    ],
    concreteLaw: createConcreteLaw(),
    steelLaw: createSteelLaw(),
    strainField: { eps0: 0.003, kappaY: 0.0004, kappaZ: -0.0002 },
    includeConcreteTension: true,
    postUltimateResponse: "linear-softening",
    postUltimateFractureEnergyDensity: { concrete: 0.2, steel: 0.4 },
  };
}

void test("RCSectionStateIntegrator matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/reinforced-concrete-sections/analysis/RCSectionStateIntegrator.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/reinforced-concrete-sections/analysis/RCSectionStateIntegrator.js",
  );

  const sourceValue = sourceRootModule.RCSectionStateIntegrator;
  const typescriptValue = typescriptRootModule.RCSectionStateIntegrator;
  assert.equal(typeof sourceValue, "function", "source root export");
  assert.equal(typeof typescriptValue, "function", "TypeScript root export");
  assert.notEqual(sourceValue, typescriptValue, "independent root implementations");
  assert.equal(sourceRootModule.RCSectionStateIntegrator, sourceModule.RCSectionStateIntegrator);
  assert.equal(
    typescriptRootModule.RCSectionStateIntegrator,
    typescriptModule.RCSectionStateIntegrator,
  );

  if (!isIntegratorConstructor(sourceModule.RCSectionStateIntegrator)) {
    throw new Error("Expected the source integrator export to be constructable.");
  }
  if (!isIntegratorConstructor(typescriptModule.RCSectionStateIntegrator)) {
    throw new Error("Expected the TypeScript integrator export to be constructable.");
  }
  const sourceConstructor = sourceModule.RCSectionStateIntegrator;
  const typescriptConstructor = typescriptModule.RCSectionStateIntegrator;
  const sourceIntegrator = new sourceConstructor();
  const typescriptIntegrator = new typescriptConstructor();
  const options = createOptions();
  assertExactParity(
    sourceIntegrator.evaluate(options),
    typescriptIntegrator.evaluate(options),
    "complete evaluation",
  );

  const sourceAxial = sourceIntegrator.createAxialForceEvaluator(options)(options.strainField);
  const typescriptAxial = typescriptIntegrator.createAxialForceEvaluator(options)(
    options.strainField,
  );
  assertExactParity(sourceAxial, typescriptAxial, "axial fast evaluator");
  const sourceResultant = sourceIntegrator.createResultantEvaluator(options)(options.strainField);
  const typescriptResultant = typescriptIntegrator.createResultantEvaluator(options)(
    options.strainField,
  );
  assertExactParity(sourceResultant, typescriptResultant, "resultant fast evaluator");

  const errorCases: Array<[string, (Integrator: IntegratorConstructor) => unknown]> = [
    ["missing section", (Integrator) => new Integrator().evaluate({})],
    ["missing fibers", (Integrator) => new Integrator().evaluate({ section: createSection() })],
    [
      "unsupported response",
      (Integrator) =>
        new Integrator().evaluate({ ...createOptions(), postUltimateResponse: "unsupported" }),
    ],
    [
      "missing softening energy",
      (Integrator) =>
        new Integrator().evaluate({ ...createOptions(), postUltimateFractureEnergyDensity: null }),
    ],
  ];
  for (const [label, action] of errorCases) {
    assertExactParity(
      captureError(() => action(sourceConstructor)),
      captureError(() => action(typescriptConstructor)),
      `${label} error`,
    );
  }
});
