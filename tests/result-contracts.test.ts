import assert from "node:assert/strict";
import test from "node:test";

import {
  CalculationResult,
  RESULT_STATUS,
  RESULT_STATUS_VALUES,
  VerificationResult,
  isResultStatus,
} from "../dist/index.js";

void test("calculation result uses the centralized baseline status constants", () => {
  const result = new CalculationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
  });
  const placeholder = new CalculationResult({ applicationId: "demo" });

  assert.equal(result.isSuccessful(), true);
  assert.equal(placeholder.status, RESULT_STATUS.NOT_IMPLEMENTED);
  assert.deepEqual(RESULT_STATUS_VALUES, [
    "ok",
    "not-verified",
    "not-supported",
    "not-analyzed",
    "not-implemented",
    "failed",
  ]);
  assert.equal(isResultStatus(RESULT_STATUS.NOT_SUPPORTED), true);
  assert.equal(isResultStatus("error"), false);
  assert.throws(
    () =>
      new CalculationResult({
        applicationId: "demo",
        status: "error",
      }),
    /Unsupported result status/u,
  );
});

void test("calculation result preserves the baseline serialized shape", () => {
  const result = new CalculationResult({
    applicationId: "demo",
    assumptions: ["plane sections remain plane"],
    metadata: { method: "migration-oracle" },
    outputs: { value: 12 },
    status: RESULT_STATUS.OK,
    summary: "Complete",
    warnings: ["Example warning"],
  });
  const serialized = result.toJSON();

  assert.deepEqual(serialized, {
    applicationId: "demo",
    status: "ok",
    summary: "Complete",
    outputs: { value: 12 },
    warnings: ["Example warning"],
    assumptions: ["plane sections remain plane"],
    metadata: { method: "migration-oracle" },
  });
  assert.notEqual(serialized.outputs, result.outputs);
  assert.notEqual(serialized.warnings, result.warnings);
  assert.notEqual(serialized.assumptions, result.assumptions);
  assert.notEqual(serialized.metadata, result.metadata);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), serialized);

  result.summary = "Updated";
  result.outputs = { value: 13 };
  assert.equal(result.summary, "Updated");
  assert.deepEqual(result.outputs, { value: 13 });
});

void test("verification result status and checks participate in isVerified", () => {
  const ok = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
    utilizationRatio: 0.7,
  });
  const notImplemented = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.NOT_IMPLEMENTED,
    utilizationRatio: 0.7,
  });
  const failedCheck = new VerificationResult({
    applicationId: "demo",
    status: RESULT_STATUS.OK,
    utilizationRatio: 0.7,
    checks: [{ id: "check", ok: false, utilizationRatio: 0.7 }],
  });

  assert.equal(ok.isVerified(), true);
  assert.equal(notImplemented.isVerified(), false);
  assert.equal(failedCheck.isVerified(), false);
});

void test("verification result preserves all compatibility fields", () => {
  const result = new VerificationResult({
    applicationId: "verification",
    assumptions: ["assigned demand"],
    capacity: 20,
    checks: [{ id: "capacity", ok: true, utilizationRatio: 0.5 }],
    demand: 10,
    metadata: { units: { force: "kN", length: "m" } },
    outputs: { governingCheckId: "capacity" },
    status: RESULT_STATUS.OK,
    utilizationRatio: 0.5,
    warnings: [],
  });

  assert.deepEqual(result.toJSON(), {
    applicationId: "verification",
    status: "ok",
    summary: "",
    outputs: { governingCheckId: "capacity" },
    warnings: [],
    assumptions: ["assigned demand"],
    metadata: { units: { force: "kN", length: "m" } },
    utilizationRatio: 0.5,
    demand: 10,
    capacity: 20,
    checks: [{ id: "capacity", ok: true, utilizationRatio: 0.5 }],
  });
});
