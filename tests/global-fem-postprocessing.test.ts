// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_READINESS_ASSESSMENTS,
  GlobalFemPostProcessingApplication,
  RESULT_STATUS,
  classifyGlobalFemStructuralEntities,
  extractGlobalFemDemands,
  normalizeGlobalFemClassificationPolicy,
} from "../dist/index.js";
import type {
  FemDiagnostic,
  FemEntityMappingContract,
  GlobalFemDemandSet,
  GlobalFemAnalysisContract,
  GlobalFemPostProcessingInput,
  GlobalFemModelContract,
  GlobalFemResultContract,
  GlobalFemPostProcessingProfile,
  GlobalFemStructuralClassificationProposal,
  GlobalFemVerificationReadinessReport,
} from "../dist/index.js";
import type { MutableGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixtureAdapter.js";

interface RuntimeFixtureAdapter {
  readonly createGlobalFemBuildingFixture: () => MutableGlobalFemBuildingFixture;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeFixtureAdapter(value: unknown): RuntimeFixtureAdapter {
  assert.ok(isRecord(value));
  assert.equal(typeof value.createGlobalFemBuildingFixture, "function");
  return {
    createGlobalFemBuildingFixture:
      value.createGlobalFemBuildingFixture as () => MutableGlobalFemBuildingFixture,
  };
}

const fixtureAdapter = runtimeFixtureAdapter(
  await import(
    pathToFileURL(
      path.resolve(import.meta.dirname, "fixtures", "globalFemBuildingFixtureAdapter.ts"),
    ).href
  ),
);
const createGlobalFemBuildingFixture = (): MutableGlobalFemBuildingFixture =>
  fixtureAdapter.createGlobalFemBuildingFixture();

interface SerializedValidation {
  readonly ok: boolean;
  readonly errors: readonly FemDiagnostic[];
  readonly warnings: readonly FemDiagnostic[];
}

interface GlobalFemPostProcessingOutputs {
  readonly profile: GlobalFemPostProcessingProfile;
  readonly validations: Readonly<Record<string, SerializedValidation | null>>;
  readonly classification: GlobalFemStructuralClassificationProposal;
  readonly demands: GlobalFemDemandSet;
  readonly readiness: GlobalFemVerificationReadinessReport;
}

function postProcessingOutputs(result: {
  readonly outputs: Record<string, unknown>;
}): GlobalFemPostProcessingOutputs {
  const outputs = result.outputs;
  assert.equal(typeof outputs.profile, "string");
  assert.ok(isRecord(outputs.validations));
  assert.ok(isRecord(outputs.classification));
  assert.ok(isRecord(outputs.demands));
  assert.ok(isRecord(outputs.readiness));
  assert.equal(
    outputs.classification.schema,
    "strutture-js/fem-structural-classification-proposal",
  );
  assert.equal(outputs.demands.schema, "strutture-js/global-fem-demand-set");
  assert.equal(outputs.readiness.schema, "strutture-js/global-fem-verification-readiness");
  return {
    profile: outputs.profile as GlobalFemPostProcessingProfile,
    validations: outputs.validations as Readonly<Record<string, SerializedValidation | null>>,
    classification: outputs.classification as unknown as GlobalFemStructuralClassificationProposal,
    demands: outputs.demands as unknown as GlobalFemDemandSet,
    readiness: outputs.readiness as unknown as GlobalFemVerificationReadinessReport,
  };
}

function runApplication(application: GlobalFemPostProcessingApplication, input: unknown) {
  return application.run(input as GlobalFemPostProcessingInput);
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findRequired<T>(items: readonly T[], predicate: (item: T) => boolean, label: string): T {
  const item = items.find(predicate);
  assert.ok(item, label);
  return item;
}

function atRequired<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  assert.ok(item, label);
  return item;
}

void test("global FEM postprocessing exposes demand-only, assisted and confirmed profiles", () => {
  const application = new GlobalFemPostProcessingApplication();
  const fixture = createGlobalFemBuildingFixture();

  const demandOnly = runApplication(application, {
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  });
  const demandOnlyOutputs = postProcessingOutputs(demandOnly);
  assert.equal(demandOnly.status, RESULT_STATUS.OK);
  assert.equal(
    demandOnlyOutputs.demands.lineElementDemands.length,
    fixture.model.lineElements.length,
  );
  assert.equal(
    demandOnlyOutputs.demands.shellElementDemands.length,
    fixture.model.shellElements.length,
  );
  assert.equal(demandOnlyOutputs.classification.members.length, 0);
  assert.deepEqual(
    demandOnlyOutputs.readiness.assessments.map((item) => item.id),
    [GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS],
  );

  const assisted = runApplication(application, {
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  const assistedOutputs = postProcessingOutputs(assisted);
  assert.equal(assisted.status, RESULT_STATUS.OK);
  assert.ok(
    assistedOutputs.classification.members.some(
      (item) => item.classification.role === "beam" && item.classification.status === "proposed",
    ),
  );
  assert.ok(
    assistedOutputs.classification.members.some(
      (item) => item.classification.role === "column" && item.classification.status === "proposed",
    ),
  );
  assert.ok(
    assistedOutputs.classification.surfaces.some((item) => item.classification.role === "wall"),
  );
  assert.ok(
    assistedOutputs.classification.surfaces.some((item) => item.classification.role === "slab"),
  );
  assert.deepEqual(
    findRequired(
      assistedOutputs.classification.surfaces,
      (item) => item.classification.role === "wall",
      "wall classification",
    ).shellElementIds,
    ["WALL-S1", "WALL-S2"],
  );
  assert.equal(assistedOutputs.classification.storeys.length, 2);
  assert.ok(
    assistedOutputs.classification.joints.some(
      (item) => item.nodeId === "A1" && item.classification.status === "proposed",
    ),
  );
  assert.equal(assistedOutputs.readiness.mapping.provisional, true);
  assert.equal(assistedOutputs.readiness.normativeVerificationEligible, false);
  assert.equal(
    findRequired(
      assistedOutputs.readiness.assessments,
      (item) => item.id === GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS,
      "semantic readiness assessment",
    ).status,
    "provisional",
  );

  const confirmed = runApplication(application, {
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  const confirmedOutputs = postProcessingOutputs(confirmed);
  assert.equal(confirmed.status, RESULT_STATUS.OK);
  assert.equal(confirmedOutputs.readiness.mapping.confirmed, true);
  assert.equal(
    findRequired(
      confirmedOutputs.classification.members,
      (item) => item.id === "MEMBER-COL-A-1",
      "confirmed column",
    ).classification.status,
    "confirmed",
  );
  assert.equal(
    findRequired(
      confirmedOutputs.classification.joints,
      (item) => item.id === "JOINT-A1",
      "confirmed joint",
    ).classification.status,
    "confirmed",
  );
});

void test("assisted classification follows gravity rather than assuming global Z", () => {
  const fixture = createGlobalFemBuildingFixture();
  const model = fixture.model;
  for (const node of model.nodes) {
    const { x, y, z } = node.coordinates;
    node.coordinates = { x: z, y, z: -x };
  }
  model.globalCoordinateSystem.gravityDirection = { x: -1, y: 0, z: 0 };
  const proposal = classifyGlobalFemStructuralEntities({
    model: model as unknown as GlobalFemModelContract,
  });

  assert.equal(
    findRequired(
      proposal.members,
      (item) => item.lineElementIds.includes("COL-A-1"),
      "column proposal",
    ).classification.role,
    "column",
  );
  assert.equal(
    findRequired(
      proposal.members,
      (item) => item.lineElementIds.includes("BEAM-AB-1"),
      "beam proposal",
    ).classification.role,
    "beam",
  );
});

void test("inclined members remain ambiguous unless an explicit beam threshold is configured", () => {
  const fixture = createGlobalFemBuildingFixture();
  const model = fixture.model;
  findRequired(model.nodes, (node) => node.id === "A1", "inclined node").coordinates = {
    x: 4,
    y: 0,
    z: 3,
  };
  model.lineElements = [
    findRequired(model.lineElements, (item) => item.id === "COL-A-1", "inclined column"),
  ];
  model.shellElements = [];
  model.constraints = [];
  model.diaphragms = [];
  model.storeys = [];

  const typedModel = model as unknown as GlobalFemModelContract;
  const ambiguous = classifyGlobalFemStructuralEntities({ model: typedModel });
  const ambiguousMember = atRequired(ambiguous.members, 0, "ambiguous member");
  assert.equal(ambiguousMember.classification.role, "other");
  assert.equal(ambiguousMember.classification.status, "ambiguous");

  const configured = classifyGlobalFemStructuralEntities({
    model: typedModel,
    policy: { line: { maximumBeamInclinationDegrees: 40 } },
  });
  const configuredMember = atRequired(configured.members, 0, "configured member");
  assert.equal(configuredMember.classification.role, "beam");
  assert.equal(configuredMember.classification.source, "configured-geometric-inference");

  assert.throws(
    () =>
      normalizeGlobalFemClassificationPolicy({
        line: { horizontalToleranceDegrees: 20, maximumBeamInclinationDegrees: 10 },
      }),
    /between 20 and 80/,
  );
});

void test("demand extraction preserves element axes, governing references and joint ends", () => {
  const fixture = createGlobalFemBuildingFixture();
  const typedFixture = {
    model: fixture.model as unknown as GlobalFemModelContract,
    analysis: fixture.analysis as unknown as GlobalFemAnalysisContract,
    mapping: fixture.mapping as unknown as FemEntityMappingContract,
    result: fixture.result as unknown as GlobalFemResultContract,
  };
  const classification = classifyGlobalFemStructuralEntities({
    model: typedFixture.model,
    mapping: typedFixture.mapping,
  });
  const demands = extractGlobalFemDemands({
    model: typedFixture.model,
    analysis: typedFixture.analysis,
    result: typedFixture.result,
    classification,
  });

  const column = findRequired(
    demands.lineElementDemands,
    (item) => item.lineElementId === "COL-A-1",
    "column demand",
  );
  const columnEnvelope = column.componentEnvelopes.N;
  assert.ok(columnEnvelope);
  assert.ok(columnEnvelope.minimum);
  assert.ok(columnEnvelope.maximum);
  assert.deepEqual(
    column.localAxes,
    atRequired(fixture.model.lineElements, 0, "first line").localAxes,
  );
  assert.equal(columnEnvelope.minimum.value, -120);
  assert.equal(columnEnvelope.minimum.reference.combinationId, "ULS-1");
  assert.equal(columnEnvelope.maximum.value, -72);

  const shell = findRequired(
    demands.shellElementDemands,
    (item) => item.shellElementId === "WALL-S1",
    "wall demand",
  );
  assert.equal(atRequired(shell.resultantStates, 0, "wall resultant").face, "mid-surface");
  assert.equal(atRequired(shell.resultantStates, 0, "wall resultant").location.kind, "centroid");
  assert.deepEqual(
    shell.localAxes,
    findRequired(fixture.model.shellElements, (item) => item.id === "WALL-S1", "wall element")
      .localAxes,
  );

  const joint = findRequired(
    demands.jointDemands,
    (item) => item.jointId === "JOINT-A1",
    "joint demand",
  );
  const uls = findRequired(
    joint.demandStates,
    (item) => item.reference.combinationId === "ULS-1",
    "ULS joint state",
  );
  assert.equal(joint.complete, true);
  assert.equal(uls.elementEnds.length, 4);
  const columnStart = findRequired(
    uls.elementEnds,
    (item) => item.lineElementId === "COL-A-1",
    "column start end",
  );
  const columnEnd = findRequired(
    uls.elementEnds,
    (item) => item.lineElementId === "COL-A-2",
    "column end end",
  );
  assert.ok(columnStart.station);
  assert.ok(columnEnd.station);
  assert.equal(columnStart.station.xi, 1);
  assert.equal(columnEnd.station.xi, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(demands)), demands);

  const interiorOnlyResult = copy(fixture.result);
  for (const state of interiorOnlyResult.results.lineElementActions.filter(
    (item) => item.lineElementId === "COL-A-1",
  )) {
    atRequired(state.stations, 0, "first interior station").xi = 0.1;
    atRequired(state.stations, 0, "first interior station").position = 0.3;
    atRequired(state.stations, 1, "second interior station").xi = 0.9;
    atRequired(state.stations, 1, "second interior station").position = 2.7;
  }
  const interiorOnlyDemands = extractGlobalFemDemands({
    model: typedFixture.model,
    analysis: typedFixture.analysis,
    result: interiorOnlyResult as unknown as GlobalFemResultContract,
    classification,
  });
  const incompleteJoint = findRequired(
    interiorOnlyDemands.jointDemands,
    (item) => item.jointId === "JOINT-A1",
    "incomplete joint",
  );
  assert.equal(incompleteJoint.complete, false);
  assert.ok(
    incompleteJoint.demandStates.every((state) =>
      state.missingElementEnds.some((item) => item.lineElementId === "COL-A-1"),
    ),
  );

  const sparseResult = copy(fixture.result);
  delete (sparseResult.results as unknown as { sectionCuts?: unknown }).sectionCuts;
  delete (sparseResult.results as unknown as { storeyResults?: unknown }).storeyResults;
  delete (sparseResult.results as unknown as { equilibriumResiduals?: unknown })
    .equilibriumResiduals;
  delete (sparseResult as unknown as { qualityIndicators?: unknown }).qualityIndicators;
  const sparseDemands = extractGlobalFemDemands({
    model: typedFixture.model,
    analysis: typedFixture.analysis,
    result: sparseResult as unknown as GlobalFemResultContract,
    classification,
  });
  assert.deepEqual(sparseDemands.globalResponses.sectionCuts, []);
  assert.deepEqual(sparseDemands.globalResponses.qualityIndicators, {});
});

void test("confirmed profile blocks incomplete mapping while assisted profile accepts safe proposals", () => {
  const application = new GlobalFemPostProcessingApplication();
  const fixture = createGlobalFemBuildingFixture();
  fixture.mapping.members.pop();

  const confirmed = runApplication(application, {
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  const confirmedOutputs = postProcessingOutputs(confirmed);
  assert.equal(confirmed.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(confirmedOutputs.validations.mapping?.ok, false);
  assert.equal(confirmedOutputs.readiness.mapping.confirmed, false);

  const assisted = runApplication(application, {
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  const assistedOutputs = postProcessingOutputs(assisted);
  assert.equal(assisted.status, RESULT_STATUS.OK);
  assert.equal(assistedOutputs.readiness.mapping.provisional, true);

  const unsafe = copy(fixture);
  atRequired(unsafe.mapping.members, 0, "unsafe member").lineElementIds = ["UNKNOWN-LINE"];
  const unsafeResult = runApplication(application, {
    ...unsafe,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.ASSISTED,
  });
  const unsafeOutputs = postProcessingOutputs(unsafeResult);
  assert.equal(unsafeResult.status, RESULT_STATUS.NOT_ANALYZED);
  assert.ok(
    unsafeOutputs.readiness.assessments.some((assessment) =>
      assessment.missingInputs.some((item) => item.code === "FEM_UNKNOWN_REFERENCE"),
    ),
  );
});

void test("readiness reports missing project, design and analysis inputs without claiming checks", () => {
  const fixture = createGlobalFemBuildingFixture();
  const output = runApplication(new GlobalFemPostProcessingApplication(), {
    ...fixture,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
    requestedAssessments: [GLOBAL_FEM_READINESS_ASSESSMENTS.COMPLETE_NTC2018_BUILDING_VERIFICATION],
  });
  const outputValues = postProcessingOutputs(output);
  const assessment = outputValues.readiness.assessments[0];
  assert.ok(assessment);

  assert.equal(output.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(assessment.implementationStatus, "not-implemented");
  assert.equal(assessment.inputStatus, "blocked");
  assert.equal(outputValues.readiness.normativeVerificationEligible, false);
  assert.ok(
    assessment.missingInputs.some((item) => item.code === "FEM_MEMBER_DESIGN_DATA_MISSING"),
  );
  assert.ok(assessment.missingInputs.some((item) => item.code === "FEM_SLAB_DESIGN_DATA_MISSING"));
  assert.ok(
    assessment.missingInputs.some((item) => item.path === "$.projectContext.ductilityClass"),
  );
  assert.ok(
    assessment.missingInputs.some(
      (item) => item.code === "FEM_REQUIRED_COMBINATION_MISSING" && /seismic/.test(item.message),
    ),
  );
  assert.equal(output.metadata.normativeVerificationPerformed, false);
});

void test("invalid core contracts stop postprocessing with explicit diagnostics", () => {
  const fixture = createGlobalFemBuildingFixture();
  delete (fixture.model.units as { length?: string }).length;
  const output = runApplication(new GlobalFemPostProcessingApplication(), fixture);
  const outputValues = output.outputs;
  assert.ok(isRecord(outputValues.validations));
  assert.ok(isRecord(outputValues.validations.model));

  assert.equal(output.status, RESULT_STATUS.NOT_ANALYZED);
  assert.equal(outputValues.validations.model.ok, false);
  assert.ok(
    output.warnings.some((item) => isRecord(item) && item.code === "FEM_UNIT_MISSING_OR_AMBIGUOUS"),
  );
  assert.equal(outputValues.demands, undefined);
});

void test("partial solver results remain usable for explicitly available result families", () => {
  const fixture = createGlobalFemBuildingFixture();
  fixture.result.status = "partial";
  const output = runApplication(new GlobalFemPostProcessingApplication(), {
    ...fixture,
    mapping: undefined,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  });
  const outputValues = postProcessingOutputs(output);

  assert.equal(output.status, RESULT_STATUS.OK);
  assert.equal(outputValues.readiness.assessments[0]?.status, "ready");
  assert.ok(output.warnings.some((item) => isRecord(item) && item.code === "FEM_ANALYSIS_PARTIAL"));
});
