import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMasonryArchModels,
  createMasonryArch,
  type MasonryArchInterfaceInput,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

function archModel({
  id,
  voussoirCount = 20,
  span = 10,
  interfaceLaw = { model: "heyman" },
  pointForce = -10,
  postTension = false,
  bondedLayer = false,
}: {
  readonly id: string;
  readonly voussoirCount?: number;
  readonly span?: number;
  readonly interfaceLaw?: MasonryArchInterfaceInput;
  readonly pointForce?: number;
  readonly postTension?: boolean;
  readonly bondedLayer?: boolean;
}) {
  return createMasonryArch({
    id,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount,
    },
    masonry: { unitWeight: 20 },
    interfaces: interfaceLaw,
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G" },
      {
        id: "Q-left",
        type: "patch",
        loadCaseId: "Q",
        components: { x: 0, y: pointForce },
        startStation: 0.05,
        endStation: 0.45,
      },
    ],
    reinforcements: postTension
      ? [
          {
            id: "PT-intrados",
            side: "intrados",
            area: 0.001,
            elasticModulus: 200_000_000,
            initialForce: 10,
            interaction: { type: "rigid-deviators", count: 3 },
            terminations: {
              left: { type: "distributed-anchorage", connectorCount: 1 },
              right: { type: "distributed-anchorage", connectorCount: 1 },
            },
          },
        ]
      : [],
    bondedLayers: bondedLayer
      ? [
          {
            id: "FRCM-intrados",
            family: "frcm",
            side: "intrados",
            area: 0.001,
            elasticModulus: 200_000_000,
            debondingStrain: 0.0066,
          },
        ]
      : [],
  });
}

void test("model comparison reports comparable mechanics variants and governing maxima", () => {
  const reference = archModel({ id: "heyman-20" });
  const refined = archModel({ id: "heyman-40", voussoirCount: 40 });
  const finiteCompression = archModel({
    id: "finite-compression",
    interfaceLaw: {
      model: "finite-compression",
      compressiveStrength: 1000,
      compressionFacetCount: 16,
    },
  });
  const postTensioned = archModel({ id: "post-tensioned", postTension: true });
  const bonded = archModel({ id: "bonded", bondedLayer: true });
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      label: "Heyman, 20 voussoirs",
      model: reference,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "refined",
      model: refined,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "finite-compression",
      model: finiteCompression,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "post-tensioned",
      model: postTensioned,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "bonded",
      model: bonded,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
  ]);

  assert.equal(result.status, "ok");
  assert.equal(result.outputs.overallComparability, "all-comparable");
  assert.equal(result.outputs.comparableCaseCount, 4);
  assert.ok(result.outputs.cases.every((item) => item.comparableToReference));
  assert.ok(result.outputs.cases.every((item) => item.numericallyConverged));

  const refinedSummary = result.outputs.cases.find((item) => item.caseId === "refined")!;
  assert.equal(refinedSummary.voussoirCount, 40);
  assert.notEqual(refinedSummary.relativeToReference, null);
  assert.ok(refinedSummary.maximumNormalizedEquilibriumResidual < 1e-11);

  const compressionSummary = result.outputs.cases.find(
    (item) => item.caseId === "finite-compression",
  )!;
  assert.equal(compressionSummary.interfaceModel, "finite-compression");
  assert.equal(compressionSummary.failureMode, "masonry-crushing");
  assert.ok(compressionSummary.maximumCompression.value! > 0);
  assert.notEqual(compressionSummary.maximumCompression.itemId, null);

  const tendonSummary = result.outputs.cases.find((item) => item.caseId === "post-tensioned")!;
  assert.equal(tendonSummary.maximumReinforcementForce.value, 10);
  assert.equal(tendonSummary.maximumReinforcementForce.itemId, "PT-intrados");
  assert.ok(tendonSummary.maximumAnchorForce.value! > 0);
  assert.notEqual(tendonSummary.maximumAnchorForce.itemId, null);

  const bondedSummary = result.outputs.cases.find((item) => item.caseId === "bonded")!;
  assert.equal(bondedSummary.maximumReinforcementForce.itemId, "FRCM-intrados");
  assert.ok(bondedSummary.maximumReinforcementForce.value! > 0);
  assert.equal(bondedSummary.reinforcementIds.includes("FRCM-intrados"), true);
});

void test("model comparison refuses quantitative ratios for unequal geometry or loading", () => {
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      model: archModel({ id: "reference" }),
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "different-geometry",
      model: archModel({ id: "different-geometry", span: 11 }),
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "different-loading",
      model: archModel({ id: "different-loading", pointForce: -12 }),
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
  ]);

  assert.equal(result.status, "not-verified");
  assert.equal(result.outputs.overallComparability, "none-comparable");
  assert.equal(result.outputs.comparableCaseCount, 0);
  const geometry = result.outputs.cases.find((item) => item.caseId === "different-geometry")!;
  assert.deepEqual(
    geometry.nonComparableReasons.map((item) => item.code),
    ["geometry-mismatch"],
  );
  assert.ok(geometry.nonComparableReasons[0]!.differingPaths.includes("geometry.span"));
  assert.equal(geometry.relativeToReference, null);

  const loading = result.outputs.cases.find((item) => item.caseId === "different-loading")!;
  assert.deepEqual(
    loading.nonComparableReasons.map((item) => item.code),
    ["load-definition-mismatch"],
  );
  assert.ok(
    loading.nonComparableReasons[0]!.differingPaths.some((path) => path.endsWith(".components.y")),
  );
  assert.equal(loading.relativeToReference, null);
});

void test("model comparison distinguishes combination factors from scalable load roles", () => {
  const model = archModel({ id: "load-selection" });
  const result = compareMasonryArchModels([
    {
      caseId: "reference",
      model,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "factored",
      model,
      analysisOptions: {
        scalableLoadCaseIds: ["Q"],
        loadCombination: {
          id: "ULS",
          combinationType: "ULS",
          factors: [
            { loadCase: { id: "G" }, factor: 1.3 },
            { loadCase: { id: "Q" }, factor: 1.5 },
          ],
        },
      },
    },
    {
      caseId: "different-role",
      model,
      analysisOptions: { scalableLoadCaseIds: ["G"] },
    },
  ]);

  const factored = result.outputs.cases.find((item) => item.caseId === "factored")!;
  assert.deepEqual(
    factored.nonComparableReasons.map((item) => item.code),
    ["load-factor-mismatch"],
  );
  const role = result.outputs.cases.find((item) => item.caseId === "different-role")!;
  assert.deepEqual(
    role.nonComparableReasons.map((item) => item.code),
    ["analysis-not-converged", "load-role-mismatch"],
  );
});

void test("model comparison accepts linear and nonlinear analyses without inventing a lambda ratio", () => {
  const deformable = archModel({
    id: "deformable",
    voussoirCount: 9,
    interfaceLaw: {
      model: "deformable-no-tension",
      normal: {
        elasticModulus: 1_000_000,
        characteristicLength: 0.5,
        integrationPointCount: 8,
      },
      tangential: {
        shearModulus: 400_000,
        characteristicLength: 0.5,
        frictionCoefficient: 0.5,
        cohesion: 0,
        flowRule: { type: "non-associated", dilationAngle: 0 },
      },
    },
  });
  const result = compareMasonryArchModels([
    {
      caseId: "linear-limit",
      model: deformable,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "nonlinear-path",
      model: deformable,
      analysisOptions: {
        units: { force: "kN", length: "m" },
        geometricNonlinearity: true,
        scalableLoadCaseIds: ["Q"],
        control: {
          type: "load",
          targetLambda: 0.05,
          monitor: { blockId: "V-004", component: "y" },
          initialStep: 0.05,
        },
        equilibriumTolerance: 1e-7,
        maxIterations: 30,
      },
    },
  ]);

  assert.equal(result.outputs.overallComparability, "all-comparable");
  const nonlinear = result.outputs.cases.find((item) => item.caseId === "nonlinear-path")!;
  assert.equal(nonlinear.analysisApplicationId, "masonry-arch-nonlinear");
  assert.equal(nonlinear.geometricNonlinearity, true);
  assert.equal(nonlinear.analysisObjective, "capacity");
  assert.equal(nonlinear.control, "load");
  assert.equal(nonlinear.numericallyConverged, true);
  assert.equal(nonlinear.limitMeaning, "incremental-material-or-path-limit");
  assert.equal(nonlinear.lambdaCritical, null);
  assert.equal(nonlinear.relativeToReference, null);
  assert.ok(nonlinear.maximumNormalizedEquilibriumResidual <= 1e-7);
});

void test("model comparison validates case identity and reference selection", () => {
  const model = archModel({ id: "validation" });
  assert.throws(
    () =>
      compareMasonryArchModels([
        { caseId: "same", model, analysisOptions: { scalableLoadCaseIds: ["Q"] } },
        { caseId: "same", model, analysisOptions: { scalableLoadCaseIds: ["Q"] } },
      ]),
    /Duplicate masonry arch comparison caseId/,
  );
  assert.throws(
    () =>
      compareMasonryArchModels(
        [
          { caseId: "one", model, analysisOptions: { scalableLoadCaseIds: ["Q"] } },
          { caseId: "two", model, analysisOptions: { scalableLoadCaseIds: ["Q"] } },
        ],
        { referenceCaseId: "missing" },
      ),
    /Unknown masonry arch comparison referenceCaseId/,
  );
});
