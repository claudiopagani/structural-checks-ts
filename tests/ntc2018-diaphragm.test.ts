// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";

import {
  NTC2018_DIAPHRAGM_FORCE_FACTOR,
  NTC2018_DIAPHRAGM_REFERENCES,
  amplifyNTC2018DiaphragmActions,
  createDiaphragmAssessment,
} from "../dist/index.js";

void test("diaphragm chapter-7 rule is the 1.30 force increase", () => {
  assert.equal(NTC2018_DIAPHRAGM_FORCE_FACTOR, 1.3);
  assert.equal(Object.isFrozen(NTC2018_DIAPHRAGM_REFERENCES), true);
  const reference = NTC2018_DIAPHRAGM_REFERENCES[0];
  assert.ok(reference);
  assert.match(reference.citation, /7\.4\.4\.4\.1/);
});

void test("diaphragm action amplification preserves component signs", () => {
  const result = amplifyNTC2018DiaphragmActions({
    analysisActions: {
      nxx: 100,
      nyy: -50,
      nxy: 20,
      mx: -10,
    },
  });
  assert.deepEqual(result.designActions, {
    nxx: 130,
    nyy: -65,
    nxy: 26,
    mx: -13,
  });
});

void test("diaphragm action amplification rejects empty or non-numeric actions", () => {
  assert.throws(
    () => amplifyNTC2018DiaphragmActions({ analysisActions: {} }),
    /at least one component/,
  );
  assert.throws(
    () =>
      amplifyNTC2018DiaphragmActions({
        analysisActions: { nxx: "unknown" },
      }),
    /analysisActions\.nxx/,
  );
});

void test("demand amplification alone cannot produce a positive resistance result", () => {
  const result = createDiaphragmAssessment({
    diaphragmId: "D1",
    analysisActions: { nxx: 100 },
  });
  assert.equal(result.status, "not-implemented");
  assert.equal(result.complete, false);
  assert.equal(result.allChecksOk, false);
});

void test("assessment aggregates independently calculated chapter-4 checks", () => {
  const passing = createDiaphragmAssessment({
    diaphragmId: "D1",
    analysisActions: { nxx: 100 },
    capacityChecks: [
      {
        id: "membrane-nxx",
        demand: 130,
        capacity: 150,
        ok: true,
        reference: "NTC 2018 § 4.1",
      },
    ],
  });
  const failing = createDiaphragmAssessment({
    diaphragmId: "D1",
    analysisActions: { nxx: 100 },
    capacityChecks: [
      {
        id: "membrane-nxx",
        demand: 130,
        capacity: 120,
        ok: false,
        reference: "NTC 2018 § 4.1",
      },
    ],
  });
  assert.equal(passing.status, "ok");
  assert.equal(failing.status, "not-verified");
});
