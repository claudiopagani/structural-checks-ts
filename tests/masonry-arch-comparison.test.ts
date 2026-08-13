import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMasonryArchModels,
  createMasonryArch,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

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
