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
const expectedExports = [
  "CalculationResult",
  "FORCE_UNIT_FACTORS",
  "LENGTH_UNIT_FACTORS",
  "RESULT_STATUS",
  "RESULT_STATUS_FAILED",
  "RESULT_STATUS_NOT_ANALYZED",
  "RESULT_STATUS_NOT_IMPLEMENTED",
  "RESULT_STATUS_NOT_SUPPORTED",
  "RESULT_STATUS_NOT_VERIFIED",
  "RESULT_STATUS_OK",
  "RESULT_STATUS_VALUES",
  "VerificationResult",
  "assertExplicitUnitSystem",
  "assertPositiveCheckValue",
  "convertUnitProperties",
  "createUnitResolver",
  "governingCheck",
  "isFinitePositive",
  "isResultStatus",
  "normalizeUnitSystem",
  "round",
  "uniqueStrings",
  "utilizationCheck",
].sort();

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
const revision = revisionOutput.trim();
assert.equal(revision, expectedRevision, "Compatibility test loaded the wrong source revision.");
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

void test("the migrated runtime exports exactly the declared foundation subset", () => {
  assert.deepEqual(Object.keys(TypeScriptApi).sort(), expectedExports);
  for (const name of expectedExports) {
    assert.ok(Object.hasOwn(JavaScriptApi, name), `The source baseline does not export ${name}.`);
  }
});

void test("result constants and serialized DTO behavior match the live baseline", () => {
  assert.deepEqual(TypeScriptApi.RESULT_STATUS, baselineExport("RESULT_STATUS"));
  assert.deepEqual(TypeScriptApi.RESULT_STATUS_VALUES, baselineExport("RESULT_STATUS_VALUES"));

  const JavaScriptCalculationResult =
    baselineExport<typeof TypeScriptApi.CalculationResult>("CalculationResult");
  const JavaScriptVerificationResult =
    baselineExport<typeof TypeScriptApi.VerificationResult>("VerificationResult");
  const options = {
    applicationId: "parity",
    assumptions: ["assigned"],
    metadata: { method: "parity" },
    outputs: { value: 4 },
    status: TypeScriptApi.RESULT_STATUS.OK,
    summary: "Compared",
    warnings: ["warning"],
  };
  const verificationOptions = {
    ...options,
    capacity: 8,
    checks: [{ id: "capacity", ok: true, utilizationRatio: 0.5 }],
    demand: 4,
    utilizationRatio: 0.5,
  };

  assert.deepEqual(
    new TypeScriptApi.CalculationResult(options).toJSON(),
    new JavaScriptCalculationResult(options).toJSON(),
  );
  assert.deepEqual(
    new TypeScriptApi.VerificationResult(verificationOptions).toJSON(),
    new JavaScriptVerificationResult(verificationOptions).toJSON(),
  );
  assert.equal(
    new TypeScriptApi.VerificationResult(verificationOptions).isVerified(),
    new JavaScriptVerificationResult(verificationOptions).isVerified(),
  );
});

void test("unit conversion values and metadata match the live baseline", () => {
  const createJavaScriptResolver =
    baselineExport<typeof TypeScriptApi.createUnitResolver>("createUnitResolver");
  const typescriptResolver = TypeScriptApi.createUnitResolver(
    { force: "kN", length: "cm" },
    { force: "N", length: "mm" },
  );
  const javascriptResolver = createJavaScriptResolver(
    { force: "kN", length: "cm" },
    { force: "N", length: "mm" },
  );
  const values = [0, 1, -2.5, Number.NaN, Number.POSITIVE_INFINITY];
  const methods = [
    "length",
    "area",
    "volume",
    "force",
    "moment",
    "lineLoad",
    "areaLoad",
    "volumeLoad",
    "stress",
    "translationalStiffness",
    "rotationalStiffness",
    "inertia",
    "sectionModulus",
  ] as const;

  assert.deepEqual(typescriptResolver.unitSystem, javascriptResolver.unitSystem);
  assert.deepEqual(typescriptResolver.sourceUnitSystem, javascriptResolver.sourceUnitSystem);
  assert.deepEqual(typescriptResolver.targetUnitSystem, javascriptResolver.targetUnitSystem);

  for (const method of methods) {
    for (const value of values) {
      assert.deepEqual(
        typescriptResolver[method](value),
        javascriptResolver[method](value),
        `${method} differs for ${String(value)}.`,
      );
    }
  }
});

void test("generic check utilities match the live baseline", () => {
  const javascriptUtilizationCheck =
    baselineExport<typeof TypeScriptApi.utilizationCheck>("utilizationCheck");
  const javascriptGoverningCheck =
    baselineExport<typeof TypeScriptApi.governingCheck>("governingCheck");
  const options = {
    id: "capacity",
    description: "Capacity",
    demand: -12.3456789,
    capacity: 20,
    metadata: { method: "parity" },
  };
  const typescriptCheck = TypeScriptApi.utilizationCheck(options);
  const javascriptCheck = javascriptUtilizationCheck(options);

  assert.deepEqual(typescriptCheck, javascriptCheck);
  assert.deepEqual(
    TypeScriptApi.governingCheck([
      typescriptCheck,
      { ...typescriptCheck, id: "second", utilizationRatio: 0.9 },
    ]),
    javascriptGoverningCheck([
      javascriptCheck,
      { ...javascriptCheck, id: "second", utilizationRatio: 0.9 },
    ]),
  );
  assert.deepEqual(
    TypeScriptApi.uniqueStrings(["a", "", "a", null, "b"]),
    baselineExport<typeof TypeScriptApi.uniqueStrings>("uniqueStrings")(["a", "", "a", null, "b"]),
  );
});
