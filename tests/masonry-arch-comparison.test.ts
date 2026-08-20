import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMasonryArchModels,
  createMasonryArch,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts/applications/masonry-arches";

const rigidInterfaceLaw: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function archModel(input: {
  readonly id: string;
  readonly voussoirCount?: number;
  readonly pointForce?: number;
  readonly interfaceLaw?: MasonryInterfaceLawInput;
}) {
  return createMasonryArch({
    id: input.id,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount: input.voussoirCount ?? 20,
    },
    masonry: { unitWeight: 20 },
    interfaceLaw: input.interfaceLaw ?? rigidInterfaceLaw,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q-left",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: input.pointForce ?? -10 },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
  });
}

void test("comparison reports capacity landmarks only for comparable analyses", () => {
  const reference = archModel({ id: "reference" });
  const candidate = archModel({ id: "candidate", pointForce: -12 });
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      model: reference,
      analysis: { type: "limit", options: { scalableLoadCaseIds: ["Q"] } },
    },
    {
      caseId: "candidate",
      model: candidate,
      analysis: { type: "limit", options: { scalableLoadCaseIds: ["Q"] } },
    },
  ]);
  assert.equal(result.outputs.cases[0]!.analysisType, "limit");
  assert.equal(result.outputs.cases[0]!.constitutiveResponse, "rigid-plastic");
  assert.notEqual(result.outputs.cases[0]!.capacity, null);
  assert.equal(result.outputs.cases[1]!.comparableToReference, false);
  assert.equal(result.outputs.cases[1]!.capacityRelativeToReference, null);
});

void test("comparison rejects semantically different analysis types", () => {
  const model = archModel({ id: "same-model" });
  const result = compareMasonryArchModels([
    {
      caseId: "equilibrium",
      model,
      analysis: { type: "equilibrium" },
    },
    {
      caseId: "limit",
      model,
      analysis: { type: "limit", options: { scalableLoadCaseIds: ["Q"] } },
    },
  ]);
  assert.equal(result.outputs.cases[1]!.comparableToReference, false);
  assert.ok(
    result.outputs.cases[1]!.nonComparableReasons.some(
      (reason) => reason.code === "analysis-type-mismatch",
    ),
  );
});

void test("comparison treats different explicit loadFactorsByCaseId as not comparable", () => {
  const reference = archModel({ id: "factor-reference" });
  const candidate = archModel({ id: "factor-candidate" });
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      model: reference,
      analysis: { type: "equilibrium", options: { loadFactorsByCaseId: { G: 1, Q: 1 } } },
    },
    {
      caseId: "candidate",
      model: candidate,
      analysis: { type: "equilibrium", options: { loadFactorsByCaseId: { G: 1, Q: 1.5 } } },
    },
  ]);
  assert.equal(result.outputs.cases[0]!.comparableToReference, true);
  assert.equal(result.outputs.cases[1]!.comparableToReference, false);
  const factorReason = result.outputs.cases[1]!.nonComparableReasons.find(
    (reason) => reason.code === "load-factor-mismatch",
  );
  assert.ok(factorReason !== undefined);
  assert.ok(factorReason.differingPaths.some((path) => path.includes("loadFactors")));
});

void test("comparison matches explicit factors producing the same effective loads", () => {
  const reference = archModel({ id: "effective-reference" });
  const candidate = archModel({ id: "effective-candidate" });
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      model: reference,
      analysis: {
        type: "equilibrium",
        options: {
          loadCombination: {
            factors: [
              { loadCase: { id: "G" }, factor: 1 },
              { loadCase: { id: "Q" }, factor: 1.5 },
            ],
          },
        },
      },
    },
    {
      caseId: "candidate",
      model: candidate,
      analysis: { type: "equilibrium", options: { loadFactorsByCaseId: { G: 1, Q: 1.5 } } },
    },
  ]);
  // The explicit per-case factors take precedence over the combination in the canonical load
  // resolver, so the two cases carry identical effective loads and must stay comparable.
  assert.equal(result.outputs.cases[1]!.comparableToReference, true);
  assert.equal(
    result.outputs.cases[1]!.nonComparableReasons.some(
      (reason) => reason.code === "load-factor-mismatch",
    ),
    false,
  );
});

void test("comparison validates case identifiers", () => {
  const model = archModel({ id: "duplicate" });
  assert.throws(
    () =>
      compareMasonryArchModels([
        { caseId: "same", model, analysis: { type: "equilibrium" } },
        { caseId: "same", model, analysis: { type: "equilibrium" } },
      ]),
    /Duplicate masonry arch comparison caseId/,
  );
});
