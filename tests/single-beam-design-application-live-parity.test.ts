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
type ApplicationLike = { run: (input?: unknown) => unknown };
type ApplicationConstructor = new (options?: unknown) => ApplicationLike;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApplicationConstructor(value: unknown): value is ApplicationConstructor {
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

function toJsonForTest(value: unknown): unknown {
  const toJSON: unknown = value == null ? undefined : Reflect.get(Object(value), "toJSON");
  return typeof toJSON === "function" ? Reflect.apply(toJSON, value, []) : value;
}

void test("single-beam design application matches the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const sourceModule = await loadModule(
    sourceRoot,
    "src/applications/single-beam-design/SingleBeamDesignApplication.js",
  );
  const typescriptModule = await loadModule(
    path.join(repositoryRoot, "dist"),
    "applications/single-beam-design/SingleBeamDesignApplication.js",
  );
  const sourceConstructor = sourceModule.SingleBeamDesignApplication;
  const typescriptConstructor = typescriptModule.SingleBeamDesignApplication;
  if (
    !isApplicationConstructor(sourceConstructor) ||
    !isApplicationConstructor(typescriptConstructor)
  ) {
    throw new Error("Expected both modules to export SingleBeamDesignApplication.");
  }

  assert.notEqual(typescriptConstructor, sourceConstructor, "independent implementations");

  const sourceRootModule = await loadModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadModule(path.join(repositoryRoot, "dist"), "index.js");
  assert.equal(
    sourceRootModule.SingleBeamDesignApplication,
    sourceConstructor,
    "source root alias",
  );
  assert.equal(
    typescriptRootModule.SingleBeamDesignApplication,
    typescriptConstructor,
    "TypeScript root alias",
  );

  const beamInput = {
    units: { force: "kN", length: "m" },
    geometry: { start: { x: 0, y: 0 }, end: { x: 6, y: 0 } },
    supports: [
      { id: "left", nodeId: "N1", station: 0, type: "pinned", restraints: { ux: true, uy: true } },
      { id: "right", nodeId: "N2", station: 6, type: "roller", restraints: { uy: true } },
    ],
    verificationStations: [1, 3, 5],
    loads: [
      {
        id: "G1-load",
        actionType: "permanent",
        loadCaseId: "G1",
        loadDurationClass: "permanent",
        type: "uniform",
        w: -4,
        start: 0,
        end: 6,
      },
    ],
    combinations: [{ id: "ULS", factors: { G1: 1.35 }, limitState: "ULS" }],
  };
  const modelInput = {
    id: "application-beam-δ",
    title: "Trave applicativa è",
    description: "Workflow Unicode",
    beamInput,
  };
  const injectedAnalysis = {
    id: "analysis-δ",
    units: { force: "kN", length: "m" },
    analysisModel: "injected",
    loadCases: {},
    combinations: {},
    envelopes: {},
    warnings: ["analysis warning è"],
    assumptions: ["analysis assumption"],
  };
  const sourceApplication = new sourceConstructor();
  const typescriptApplication = new typescriptConstructor();
  const sourceResult: unknown = sourceApplication.run({
    model: modelInput,
    analysisResult: injectedAnalysis,
  });
  const typescriptResult: unknown = typescriptApplication.run({
    model: modelInput,
    analysisResult: injectedAnalysis,
  });
  if (!isRecord(sourceResult) || !isRecord(typescriptResult)) {
    throw new Error("Expected both applications to return result objects.");
  }
  assert.equal(
    JSON.stringify(typescriptResult),
    JSON.stringify(sourceResult),
    "exact calculation result JSON",
  );
  assert.deepEqual(
    toJsonForTest(typescriptResult),
    toJsonForTest(sourceResult),
    "exact calculation result",
  );

  const verification = {
    input: { adapter: "custom-δ", verificationStations: [2, 4] },
    verify(input: unknown): unknown {
      return {
        status: "not-verified",
        utilizationRatio: 0.5,
        warnings: ["verification warning è"],
        assumptions: ["verification assumption"],
        metadata: { station: propertyValueForTest(input, "verificationStations") },
      };
    },
  };
  const sourceVerified = new sourceConstructor({
    analysis: {
      analyze: () => ({ id: "analysis", loadCases: {}, combinations: {}, envelopes: {} }),
    },
    reportBuilder: {
      build(input: unknown): unknown {
        return {
          json: {
            id: propertyValueForTest(propertyValueForTest(input, "model"), "id"),
            warnings: "report warning δ",
            assumptions: { source: "report assumption" },
          },
          markdown: "# report",
        };
      },
    },
  });
  const typescriptVerified = new typescriptConstructor({
    analysis: {
      analyze: () => ({ id: "analysis", loadCases: {}, combinations: {}, envelopes: {} }),
    },
    reportBuilder: {
      build(input: unknown): unknown {
        return {
          json: {
            id: propertyValueForTest(propertyValueForTest(input, "model"), "id"),
            warnings: "report warning δ",
            assumptions: { source: "report assumption" },
          },
          markdown: "# report",
        };
      },
    },
  });
  const verifiedModel = { ...modelInput, verification };
  const sourceVerifiedResult: unknown = sourceVerified.run({
    model: verifiedModel,
    analysisResult: injectedAnalysis,
  });
  const typescriptVerifiedResult: unknown = typescriptVerified.run({
    model: verifiedModel,
    analysisResult: injectedAnalysis,
  });
  assert.deepEqual(
    toJsonForTest(typescriptVerifiedResult),
    toJsonForTest(sourceVerifiedResult),
    "object verification parity",
  );

  const invalidVerificationModel = {
    ...modelInput,
    verification: { input: {} },
  };
  assert.deepEqual(
    captureError(() =>
      new sourceConstructor().run({
        model: invalidVerificationModel,
        analysisResult: injectedAnalysis,
      }),
    ),
    captureError(() =>
      new typescriptConstructor().run({
        model: invalidVerificationModel,
        analysisResult: injectedAnalysis,
      }),
    ),
    "invalid verification adapter: exact error",
  );

  const errorCases: readonly [string, unknown, unknown][] = [
    ["missing input", undefined, undefined],
    ["missing id", { beamInput: {} }, undefined],
    ["missing beam input", { id: "beam" }, undefined],
  ];
  for (const [label, input] of errorCases) {
    assert.deepEqual(
      captureError(() => new sourceConstructor().run(input)),
      captureError(() => new typescriptConstructor().run(input)),
      `${label}: exact error`,
    );
  }
});

function propertyValueForTest(value: unknown, key: string): unknown {
  return value == null ? undefined : Reflect.get(Object(value), key);
}
