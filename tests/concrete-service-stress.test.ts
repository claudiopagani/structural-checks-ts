import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  ConcreteNoTensionLaw,
  RCServiceStressSolver,
  ReinforcedConcreteSection,
  ReinforcedConcreteSectionApplication,
  ReinforcedConcreteSectionModel,
  ReinforcementBar,
  RectangularSection,
  SectionFiberDiscretizer,
  SteelElasticLaw,
  createNTC2018ConcreteMaterial,
  createNTC2018ReinforcementSteelMaterial,
} from "../dist/index.js";

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

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

function createServiceFixture(): {
  section: ReinforcedConcreteSection;
  concreteLaw: ConcreteNoTensionLaw;
  steelLaw: SteelElasticLaw;
  fibers: ReturnType<SectionFiberDiscretizer["discretize"]>["fibers"];
} {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC service fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      { id: "bottom-left", y: 50, z: 60 },
      { id: "bottom-right", y: 50, z: 240 },
      { id: "top-left", y: 450, z: 60 },
      { id: "top-right", y: 450, z: 240 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          diameter: 16,
          grade: "B450C",
          material: reinforcementMaterial,
          units,
        }),
    ),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return {
    section,
    fibers: new SectionFiberDiscretizer().discretize(section, {
      targetCount: 120,
    }).fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: concreteMaterial.elasticModulus as number,
    }),
    steelLaw: new SteelElasticLaw({
      Es: reinforcementMaterial.elasticModulus as number,
    }),
  };
}

function createServiceModel(): ReinforcedConcreteSectionModel {
  const concreteMaterial = createNTC2018ConcreteMaterial({
    strengthClass: "C25/30",
    units,
  });
  const reinforcementMaterial = createNTC2018ReinforcementSteelMaterial({
    grade: "B450C",
    units,
  });
  const section = new ReinforcedConcreteSection({
    name: "RC service application fixture",
    concreteSection: new RectangularSection({
      width: 300,
      height: 500,
      units,
    }),
    reinforcementBars: [
      { id: "bottom-left", y: 50, z: 60 },
      { id: "bottom-right", y: 50, z: 240 },
      { id: "top-left", y: 450, z: 60 },
      { id: "top-right", y: 450, z: 240 },
    ].map(
      (bar) =>
        new ReinforcementBar({
          ...bar,
          diameter: 16,
          grade: "B450C",
          material: reinforcementMaterial,
          units,
        }),
    ),
    concreteMaterial,
    reinforcementMaterial,
    referenceModularRatio: 15,
    units,
  });

  return new ReinforcedConcreteSectionModel({
    id: "rc-service-01",
    section,
    analysisType: "service-stress",
    materials: {
      concreteMaterial,
      reinforcementMaterial,
    },
    mesh: {
      targetFiberCount: 120,
    },
    solver: {
      tolerance: 1e-2,
      maxIterations: 50,
    },
    units,
    actions: {
      nEd: -400_000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });
}

void test("service constitutive laws preserve the pinned source behavior", () => {
  const JavaScriptConcreteNoTensionLaw =
    baselineExport<typeof ConcreteNoTensionLaw>("ConcreteNoTensionLaw");
  const JavaScriptSteelElasticLaw = baselineExport<typeof SteelElasticLaw>("SteelElasticLaw");
  const concreteOptions = {
    ecm: 30_000,
    compressionCap: 18,
  };
  const steelOptions = {
    Es: 210_000,
    stressCap: 360,
  };
  const typescriptConcrete = new ConcreteNoTensionLaw(concreteOptions);
  const javascriptConcrete = new JavaScriptConcreteNoTensionLaw(concreteOptions);
  const typescriptSteel = new SteelElasticLaw(steelOptions);
  const javascriptSteel = new JavaScriptSteelElasticLaw(steelOptions);

  for (const strain of [-0.002, -0.0002, 0, 0.0002, 0.002]) {
    assert.equal(typescriptConcrete.stress(strain), javascriptConcrete.stress(strain));
    assert.equal(typescriptSteel.stress(strain), javascriptSteel.stress(strain));
  }
  assert.deepEqual(typescriptConcrete.toJSON(), javascriptConcrete.toJSON());
  assert.deepEqual(typescriptSteel.toJSON(), javascriptSteel.toJSON());
});

void test("service stress solver equilibrates combined N-Mx-My without concrete tension", () => {
  const fixture = createServiceFixture();
  const result = new RCServiceStressSolver({
    tolerance: 1e-2,
    maxIterations: 50,
  }).solve({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    actions: {
      nEd: -400_000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });

  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.residual.n) < 1e-1);
  assert.ok(Math.abs(result.residual.mx) < 1e-1);
  assert.ok(Math.abs(result.residual.my) < 1e-1);
  assert.equal(result.state.extremes.maxConcreteTension, null);
  assert.ok(result.strainField.kappaZ > 0);
  assert.ok(result.strainField.kappaY > 0);
  assert.ok((result.state.extremes.maxConcreteCompression?.y ?? Number.NEGATIVE_INFINITY) > 250);
  assert.ok((result.state.extremes.maxConcreteCompression?.z ?? Number.POSITIVE_INFINITY) < 150);
  assert.equal(result.state.extremes.maxSteelTension?.id, "bottom-right");
});

void test("service stress solver matches an independent uniform axial solution", () => {
  const fixture = createServiceFixture();
  const steelModulus = fixture.steelLaw.Es;
  const modularRatio = 15;
  const concreteModulus = steelModulus / modularRatio;
  const concreteArea = 300 * 500;
  const steelArea = 4 * ((Math.PI * 16 ** 2) / 4);
  const axialForce = -400_000;
  const expectedStrain = axialForce / (concreteModulus * concreteArea + steelModulus * steelArea);
  const result = new RCServiceStressSolver({
    tolerance: 1e-6,
    maxIterations: 20,
  }).solve({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: new ConcreteNoTensionLaw({
      ecm: concreteModulus,
    }),
    steelLaw: fixture.steelLaw,
    actions: {
      nEd: axialForce,
      mxEd: 0,
      myEd: 0,
    },
  });

  assert.equal(result.converged, true);
  assert.ok(Math.abs(result.strainField.eps0 - expectedStrain) < 1e-15);
  assert.ok(Math.abs(result.strainField.kappaY) < 1e-18);
  assert.ok(Math.abs(result.strainField.kappaZ) < 1e-18);
  assert.ok(
    Math.abs(
      (result.state.extremes.maxConcreteCompression?.value ?? Number.NaN) -
        concreteModulus * expectedStrain,
    ) < 1e-10,
  );
  assert.ok(
    Math.abs(
      (result.state.extremes.maxSteelCompression?.value ?? Number.NaN) -
        steelModulus * expectedStrain,
    ) < 1e-10,
  );
});

void test("service stress solver matches the live JavaScript baseline", () => {
  const fixture = createServiceFixture();
  const JavaScriptRCServiceStressSolver =
    baselineExport<typeof RCServiceStressSolver>("RCServiceStressSolver");
  const result = new RCServiceStressSolver({
    tolerance: 1e-2,
    maxIterations: 50,
  }).solve({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    actions: {
      nEd: -400_000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });
  const baselineResult = new JavaScriptRCServiceStressSolver({
    tolerance: 1e-2,
    maxIterations: 50,
  }).solve({
    section: fixture.section,
    concreteFibers: fixture.fibers,
    concreteLaw: fixture.concreteLaw,
    steelLaw: fixture.steelLaw,
    actions: {
      nEd: -400_000,
      mxEd: 6e7,
      myEd: 2e7,
    },
  });

  assert.deepEqual(
    {
      ...result,
      strainField: { ...result.strainField },
    },
    {
      ...baselineResult,
      strainField: { ...baselineResult.strainField },
    },
  );
});

void test("section application returns the exact source service-stress result", () => {
  const targetModel = createServiceModel();
  const targetResult = new ReinforcedConcreteSectionApplication().run({
    model: targetModel,
  });
  const JavaScriptApplication = baselineExport<typeof ReinforcedConcreteSectionApplication>(
    "ReinforcedConcreteSectionApplication",
  );
  const sourceResult = new JavaScriptApplication().run({
    model: targetModel,
  });

  const targetJson = targetResult.toJSON();
  const sourceJson = sourceResult.toJSON();
  const { normativeReferences, ...targetMetadataWithoutTraceability } = targetJson.metadata;

  assert.deepEqual(
    {
      ...targetJson,
      metadata: targetMetadataWithoutTraceability,
    },
    sourceJson,
  );
  assert.equal(
    (
      normativeReferences as {
        unitId: string;
      }[]
    )[0]?.unitId,
    "urn:structural-codes:it:unit:circ2019:c4.1.2.2.5",
  );
  assert.equal(targetResult.outputs.analysisType, "service-stress");
  assert.equal(targetResult.outputs.modularRatio, 15);
  assert.equal(
    (
      targetResult.outputs.concrete as {
        maxTension: unknown;
      }
    ).maxTension,
    null,
  );
  assert.equal(
    (
      targetResult.outputs.steel as {
        maxTension: { y: number };
      }
    ).maxTension.y,
    50,
  );
});
