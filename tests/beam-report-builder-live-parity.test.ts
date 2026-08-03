import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

type RuntimeRecord = Record<string, unknown>;
type BuilderLike = {
  build: (input?: unknown) => unknown;
  buildJson: (input: unknown) => unknown;
  buildMarkdown: (report: unknown) => unknown;
  renderMarkdown: (report: unknown) => unknown;
};
type BuilderConstructor = new (options?: unknown) => BuilderLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBuilderConstructor(value: unknown): value is BuilderConstructor {
  return typeof value === "function";
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

async function loadModule(root: string, relativePath: string): Promise<RuntimeRecord> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRecord(module)) {
    throw new Error(`The module ${relativePath} is not an object module.`);
  }
  return module;
}

function captureError(action: () => unknown): unknown {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof Error)) {
      return { value: error };
    }
    return { name: error.name, message: error.message };
  }
}

void test("beam report builder matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/reports/BeamReportBuilder.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/reports/BeamReportBuilder.js",
  );
  const sourceConstructor = sourceModule.BeamReportBuilder;
  const typescriptConstructor = typescriptModule.BeamReportBuilder;
  if (!isBuilderConstructor(sourceConstructor) || !isBuilderConstructor(typescriptConstructor)) {
    throw new Error("Expected both modules to export BeamReportBuilder.");
  }

  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(sourceRootModule.BeamReportBuilder, sourceConstructor, "source root alias");
  assert.equal(
    typescriptRootModule.BeamReportBuilder,
    typescriptConstructor,
    "TypeScript root alias",
  );

  class DemoModel {
    id = "beam-δ";
    title = "Trave di prova";
    description = "Descrizione è";
    units = { force: "kN", length: "m" };
    beamInput = { sectionRotation: { alpha: 15, units: "deg" } };

    toJSON(): Record<string, unknown> {
      return { id: this.id, label: "modello-è", kind: "demo" };
    }
  }

  class DemoSection {
    toJSON(): Record<string, unknown> {
      return { kind: "section-δ", area: 0.25 };
    }
  }

  const circular: RuntimeRecord = { label: "cycle" };
  circular.self = circular;
  const analysisResult: RuntimeRecord = {
    id: "analysis-δ",
    units: { force: "kN", length: "m" },
    analysisModel: "elastic-2D",
    warnings: ["Analysis warning", "Analysis warning", ""],
    assumptions: ["Assumption A", "Assumption A"],
    loadCases: {
      G1: {
        id: "G1",
        resultType: "load-case",
        context: { limitState: "SLE", combinationType: "characteristic" },
        internalForces: {
          maxAbsBendingMoment: { m: 4.56789, station: 2 },
          maxShearForce: { v: 3, station: 1 },
          minShearForce: { v: -5, station: 4 },
          maxAbsShearForceY: { vY: 1.5, station: 2 },
        },
        displacements: { maxAbsVerticalDisplacement: { uy: 0.123, station: 3 } },
        sectionProperties: { axialRigidity: 1000, metadata: { sectionRotation: { alpha: 0.1 } } },
      },
    },
    combinations: {
      ULS: {
        id: "ULS",
        resultType: "combination",
        context: {
          limitState: "ULS",
          combinationType: "fundamental",
          sectionRotation: { alpha: 0.2, inputAlpha: 15, inputUnits: "deg" },
        },
        internalForces: {
          maxAbsBendingMoment: { m: 12.345, station: 3 },
          maxAbsBendingMomentY: { mY: 8, station: 3 },
          maxAbsBendingMomentZ: { mZ: 6, station: 3 },
          maxShearForce: { v: 4, station: 2 },
          minShearForce: { v: -3, station: 1 },
          maxAbsShearForceY: { vY: 2, station: 2 },
          maxAbsShearForceZ: { vZ: 1, station: 2 },
        },
        displacements: { maxAbsVerticalDisplacement: { uy: 0.2, station: 3 } },
        sectionProperties: {
          axialRigidity: 2000,
          flexuralRigidity: 3000,
          flexuralRigidityY: 3100,
          flexuralRigidityZ: 3200,
          shearRigidity: 4000,
          shearRigidityY: 4100,
          shearRigidityZ: 4200,
          metadata: {
            principalAxes: { primaryAxis: "principalY" },
            verticalFlexuralRigiditySource: "projected-yz",
            verticalShearRigiditySource: "projected-yz",
          },
        },
        custom: new DemoSection(),
        circular,
      },
    },
    envelopes: {
      combinations: {
        maxAbsBendingMoment: { resultId: "ULS", value: 12, sample: { station: 3 } },
      },
      uls: {
        maxAbsBendingMoment: { resultId: "ULS", value: 12, sample: { station: 3 } },
        maxAbsBendingMomentY: { resultId: "ULS", value: 8, sample: { station: 3 } },
        maxAbsBendingMomentZ: { resultId: "ULS", value: 6, sample: { station: 3 } },
      },
      sle: {
        maxAbsVerticalDisplacement: { resultId: "G1", value: 0.123, sample: { station: 3 } },
      },
      all: {},
    },
  };
  const verificationResult = {
    status: "ok",
    utilizationRatio: 0.75,
    checks: [
      { id: "check-1", utilizationRatio: 0.4, ok: true },
      { id: "check-2", utilizationRatio: 0.75, ok: false },
      { id: "check-3", utilizationRatio: Number.NaN, ok: true },
    ],
    outputs: { governing: { station: 3 } },
    metadata: { governingCheckId: "explicit-check" },
    warnings: ["Verification warning", "Verification warning"],
    assumptions: ["Verification assumption"],
    custom: new DemoSection(),
  };
  const input = {
    model: new DemoModel(),
    analysisResult,
    verificationResult,
    metadata: { reportSource: "fixture-è", generatedBy: "overridden" },
  };

  const sourceBuilder = new sourceConstructor({ metadata: { builderSource: "source" } });
  const typescriptBuilder = new typescriptConstructor({ metadata: { builderSource: "source" } });
  const sourceOutput: unknown = sourceBuilder.build(input);
  const typescriptOutput: unknown = typescriptBuilder.build(input);
  if (!isRecord(sourceOutput) || !isRecord(typescriptOutput)) {
    throw new Error("Expected both builders to return report objects.");
  }
  assert.deepEqual(typescriptOutput, sourceOutput, "exact report output");
  assert.equal(JSON.stringify(typescriptOutput), JSON.stringify(sourceOutput), "exact report JSON");
  assert.equal(
    typescriptBuilder.buildMarkdown(sourceOutput.json),
    sourceBuilder.buildMarkdown(sourceOutput.json),
  );
  assert.equal(
    typescriptBuilder.renderMarkdown(sourceOutput.json),
    sourceBuilder.renderMarkdown(sourceOutput.json),
    "exact renderer delegation",
  );

  const customRenderer = {
    render(report: unknown): unknown {
      return { rendered: report };
    },
  };
  const sourceCustom = new sourceConstructor({ markdownRenderer: customRenderer });
  const typescriptCustom = new typescriptConstructor({ markdownRenderer: customRenderer });
  assert.deepEqual(
    typescriptCustom.renderMarkdown({ label: "custom-δ" }),
    sourceCustom.renderMarkdown({ label: "custom-δ" }),
    "object renderer delegation",
  );

  const functionRenderer = (report: unknown): unknown => ({ report, mode: "function" });
  const sourceFunction = new sourceConstructor({ markdownRenderer: functionRenderer });
  const typescriptFunction = new typescriptConstructor({ markdownRenderer: functionRenderer });
  assert.deepEqual(
    typescriptFunction.renderMarkdown({ label: "function" }),
    sourceFunction.renderMarkdown({ label: "function" }),
    "function renderer delegation",
  );

  const errorCases: readonly [string, () => unknown, () => unknown][] = [
    [
      "missing model",
      () => new sourceConstructor().build({ analysisResult }),
      () => new typescriptConstructor().build({ analysisResult }),
    ],
    [
      "missing analysis result",
      () => new sourceConstructor().build({ model: new DemoModel() }),
      () => new typescriptConstructor().build({ model: new DemoModel() }),
    ],
    [
      "invalid renderer",
      () => new sourceConstructor({ markdownRenderer: {} }).renderMarkdown({}),
      () => new typescriptConstructor({ markdownRenderer: {} }).renderMarkdown({}),
    ],
  ];
  for (const [label, sourceAction, typescriptAction] of errorCases) {
    assert.deepEqual(captureError(typescriptAction), captureError(sourceAction), `${label}: error`);
  }
});
