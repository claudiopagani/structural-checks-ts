import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import * as TypeScriptApi from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;

const { stdout: revisionOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "rev-parse",
  "HEAD",
]);
const { stdout: statusOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "status",
  "--porcelain",
]);
assert.equal(
  revisionOutput.trim(),
  expectedRevision,
  "Compatibility test loaded the wrong source revision.",
);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

interface JsonValue {
  toJSON: () => unknown;
}

interface SectionValue {
  concreteSection: unknown;
}

interface RcParityApi {
  ConcreteParabolaRectangleLaw: new (options: Record<string, unknown>) => unknown;
  SteelElasticPerfectlyPlasticLaw: new (options: Record<string, unknown>) => unknown;
  SectionFiberDiscretizer: new () => {
    discretize: (section: SectionValue, options: Record<string, unknown>) => { fibers: unknown[] };
  };
  RCUltimateSectionSolver: new () => {
    solveUniaxialAtAxialLoad: (options: Record<string, unknown>) => unknown;
  };
  RectangularSection: new (options: Record<string, unknown>) => unknown;
  ReinforcementBar: new (options: Record<string, unknown>) => unknown;
  ReinforcedConcreteSection: new (options: Record<string, unknown>) => SectionValue;
  ReinforcedConcreteSectionModel: new (options: Record<string, unknown>) => unknown;
  ReinforcedConcreteSectionApplication: new () => {
    run: (input: Record<string, unknown>) => JsonValue;
  };
  createNTC2018ConcreteMaterial: (options: Record<string, unknown>) => unknown;
  createNTC2018ReinforcementSteelMaterial: (options: Record<string, unknown>) => unknown;
}

function parityApi(value: unknown): RcParityApi {
  return value as RcParityApi;
}

function buildSection(api: RcParityApi): {
  section: SectionValue;
  concreteMaterial: Record<string, unknown>;
  reinforcementMaterial: Record<string, unknown>;
} {
  const concreteMaterial = api.createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  }) as Record<string, unknown>;
  const reinforcementMaterial = api.createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  }) as Record<string, unknown>;
  const concreteSection = new api.RectangularSection({
    width: 300,
    height: 500,
    units,
  });
  const reinforcementBars = [
    { id: "bottom-left", y: 40, z: 60 },
    { id: "bottom-right", y: 40, z: 240 },
    { id: "top-left", y: 460, z: 60 },
    { id: "top-right", y: 460, z: 240 },
  ].map(
    (bar) =>
      new api.ReinforcementBar({
        ...bar,
        diameter: 20,
        grade: "B450C",
        material: reinforcementMaterial,
        units,
      }),
  );
  const section = new api.ReinforcedConcreteSection({
    name: "RC application fixture",
    concreteSection,
    reinforcementBars,
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return {
    section,
    concreteMaterial,
    reinforcementMaterial,
  };
}

function runFixture(
  api: RcParityApi,
  {
    mEd,
    compressedEdge,
  }: {
    mEd: number;
    compressedEdge: "top" | "bottom";
  },
): unknown {
  const { section, concreteMaterial, reinforcementMaterial } = buildSection(api);
  const model = new api.ReinforcedConcreteSectionModel({
    id: "rc-section-01",
    section,
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    units,
    actions: {
      nEd: -800_000,
      mEd,
      mxEd: mEd,
    },
    analysisSettings: {
      compressedEdge,
    },
  });

  return new api.ReinforcedConcreteSectionApplication().run({ model }).toJSON();
}

function runDirectSolver(api: RcParityApi): unknown {
  const { section, concreteMaterial, reinforcementMaterial } = buildSection(api);
  const mesh = new api.SectionFiberDiscretizer().discretize(section, {
    targetCount: 120,
    method: "grid",
  });
  const concreteLaw = new api.ConcreteParabolaRectangleLaw({
    fcd: concreteMaterial.fcd,
    ec2: 0.002,
    ecu: 0.0035,
  });
  const steelLaw = new api.SteelElasticPerfectlyPlasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    fyd: reinforcementMaterial.fyd,
    esu: reinforcementMaterial.ultimateStrain,
  });
  const result = new api.RCUltimateSectionSolver().solveUniaxialAtAxialLoad({
    section,
    concreteFibers: mesh.fibers,
    concreteLaw,
    steelLaw,
    nEd: -800_000,
    compressedEdge: "top",
    referencePoint: { y: 250, z: 150 },
  });

  return JSON.parse(JSON.stringify(result)) as unknown;
}

function runDomainFixture(api: RcParityApi): unknown {
  const { section, concreteMaterial, reinforcementMaterial } = buildSection(api);
  const model = new api.ReinforcedConcreteSectionModel({
    id: "rc-uniaxial-domain-01",
    section,
    analysisType: "uls-uniaxial-domain",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    units,
    actions: {
      nValues: [-1_200_000, -800_000, -400_000, -100_000],
    },
  });

  return new api.ReinforcedConcreteSectionApplication().run({ model }).toJSON();
}

function runBiaxialDomainFixture(api: RcParityApi): unknown {
  const { section, concreteMaterial, reinforcementMaterial } = buildSection(api);
  const model = new api.ReinforcedConcreteSectionModel({
    id: "rc-biaxial-domain-01",
    section,
    analysisType: "uls-biaxial-domain",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-6,
      maxIterations: 100,
    },
    units,
    actions: {
      nEd: -800_000,
    },
    analysisSettings: {
      angleCount: 8,
    },
  });

  return new api.ReinforcedConcreteSectionApplication().run({ model }).toJSON();
}

void test("ULS uniaxial resistance matches the live JavaScript baseline exactly", () => {
  const typescriptApi = parityApi(TypeScriptApi);
  const javascriptApi = parityApi(JavaScriptApi);

  for (const options of [
    { mEd: 150_000_000, compressedEdge: "top" },
    { mEd: -150_000_000, compressedEdge: "bottom" },
  ] as const) {
    assert.deepEqual(runFixture(typescriptApi, options), runFixture(javascriptApi, options));
  }
});

void test("the exported ultimate solver state matches the live JavaScript baseline", () => {
  const typescriptApi = parityApi(TypeScriptApi);
  const javascriptApi = parityApi(JavaScriptApi);

  assert.deepEqual(runDirectSolver(typescriptApi), runDirectSolver(javascriptApi));
});

void test("the ULS uniaxial M-N domain matches the live JavaScript baseline exactly", () => {
  const typescriptApi = parityApi(TypeScriptApi);
  const javascriptApi = parityApi(JavaScriptApi);

  assert.deepEqual(runDomainFixture(typescriptApi), runDomainFixture(javascriptApi));
});

void test("the ULS biaxial N-Mx-My domain matches the live JavaScript baseline exactly", () => {
  const typescriptApi = parityApi(TypeScriptApi);
  const javascriptApi = parityApi(JavaScriptApi);

  assert.deepEqual(runBiaxialDomainFixture(typescriptApi), runBiaxialDomainFixture(javascriptApi));
});
