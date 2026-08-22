import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { analyzeMasonryArchVerificationWithPerformanceMetrics } from "../dist/applications/masonry-arches/analyzeMasonryArchVerification.js";
import {
  createExtradosContactPerformanceModel,
  EXTRADOS_CONTACT_PERFORMANCE_OPTIONS,
  type ExtradosContactPerformanceCase,
} from "../benchmarks/masonry-arches/extrados-contact-performance.ts";

const CASES = ["U", "P", "A"] as const satisfies readonly ExtradosContactPerformanceCase[];
const TIMED = process.argv.includes("--timed");

function execute(caseId: ExtradosContactPerformanceCase) {
  const model = createExtradosContactPerformanceModel(caseId);
  const startedAt = performance.now();
  const analyzed = analyzeMasonryArchVerificationWithPerformanceMetrics(
    model,
    EXTRADOS_CONTACT_PERFORMANCE_OPTIONS,
  );
  const elapsedMilliseconds = performance.now() - startedAt;
  const outputs = analyzed.result.outputs;
  const path = outputs.subAnalyses.path?.outputs;
  const final = path?.steps.at(-1)?.state;
  return {
    caseId,
    elapsedMilliseconds,
    status: outputs.engineeringAssessment.status,
    fixedStatus: outputs.fixedState.status,
    assessmentLambda: outputs.engineeringAssessment.lambda,
    finalNormalizedResidual: final?.equilibrium.maximumNormalizedBlockResidual ?? null,
    performanceMetrics: analyzed.performanceMetrics,
  };
}

function assertCompleted(result: ReturnType<typeof execute>): void {
  assert.equal(result.status, "PASS", `${result.caseId} did not complete with PASS.`);
  assert.equal(result.fixedStatus, "PASS", `${result.caseId} fixed state did not pass.`);
  assert.equal(result.assessmentLambda, 1, `${result.caseId} did not certify lambda = 1.`);
  assert.ok(result.finalNormalizedResidual !== null && result.finalNormalizedResidual <= 1e-8);
  const metrics = result.performanceMetrics;
  assert.notEqual(metrics, null);
  if (metrics === null) return;
  if (result.caseId === "U") {
    assert.equal(metrics.fullContactSearches, 0);
    assert.equal(metrics.fixedTopologyEvaluations, 0);
    return;
  }
  const degreesOfFreedom = 3 * 31;
  assert.equal(
    metrics.fixedTopologyEvaluations,
    2 * degreesOfFreedom * metrics.tangentSystemEvaluations,
    "Every central-difference tangent column must use two fixed-topology evaluations.",
  );
  assert.equal(
    metrics.reinforcementVectorEvaluations,
    metrics.systemEvaluations + metrics.fixedTopologyEvaluations,
  );
  if (result.caseId === "P") {
    assert.ok(metrics.tangentSystemEvaluations <= 50);
    assert.ok(metrics.fullContactSearches <= 120);
  } else {
    assert.ok(metrics.tangentSystemEvaluations <= 100);
    assert.ok(metrics.systemEvaluations <= 200);
    assert.ok(metrics.fullContactSearches <= 300);
  }
}

const checkResults = CASES.map(execute);
checkResults.forEach(assertCompleted);

let timing: Readonly<Record<ExtradosContactPerformanceCase, readonly number[]>> | null = null;
if (TIMED) {
  // One untimed pass above warms the runtime. Three fresh full-path executions provide the report
  // sample without making wall-clock values part of the regression contract.
  timing = {
    U: Array.from({ length: 3 }, () => execute("U").elapsedMilliseconds),
    P: Array.from({ length: 3 }, () => execute("P").elapsedMilliseconds),
    A: Array.from({ length: 3 }, () => execute("A").elapsedMilliseconds),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function timingOutput(
  measured: Readonly<Record<ExtradosContactPerformanceCase, readonly number[]>> | null,
) {
  if (measured === null) return null;
  return Object.fromEntries(
    CASES.map((caseId) => [
      caseId,
      {
        runsMilliseconds: measured[caseId],
        medianMilliseconds: median(measured[caseId]),
      },
    ]),
  );
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      operationGuards: checkResults,
      timing: timingOutput(timing),
    },
    null,
    2,
  ),
);
