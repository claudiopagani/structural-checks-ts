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
  "AXIAL_PILE_BASE_RESISTANCE_METHODS",
  "AXIAL_PILE_CAPACITY_REFERENCE",
  "AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION",
  "AXIAL_PILE_EFFECTIVE_STRESS_COEFFICIENT_MODELS",
  "AXIAL_PILE_LOAD_DIRECTIONS",
  "AXIAL_PILE_LOAD_SCENARIO_SCHEMA_VERSION",
  "AXIAL_PILE_RESISTANCE_CONVERSION_MODELS",
  "AXIAL_PILE_SHAFT_RESISTANCE_METHODS",
  "DEEP_FOUNDATION_DISPLACEMENT_CLASSES",
  "DEEP_FOUNDATION_ELEMENT_TYPES",
  "DEEP_FOUNDATION_GEOMETRY_MODELS",
  "DEEP_FOUNDATION_MODEL_SCHEMA_VERSION",
  "GEOTECHNICAL_DESIGN_SITUATION_SCHEMA_VERSION",
  "GEOTECHNICAL_DESIGN_SITUATION_TYPES",
  "GEOTECHNICAL_DRAINAGE_CONDITIONS",
  "GEOTECHNICAL_INTERNAL_UNITS",
  "GEOTECHNICAL_LIMIT_STATES",
  "GEOTECHNICAL_SEISMIC_MODELS",
  "GEOTECHNICAL_TIME_CONDITIONS",
  "GROUND_MODEL_SCHEMA_VERSION",
  "GROUND_PROFILE_SCHEMA_VERSION",
  "SOIL_DEFORMATION_MODELS",
  "SOIL_DRAINAGE_CONDITIONS",
  "SOIL_MODULUS_DEFINITIONS",
  "SOIL_PARAMETER_BASES",
  "SOIL_SETTLEMENT_COMPONENTS",
  "SOIL_STRENGTH_MODELS",
  "AxialPileCapacityAnalysis",
  "AxialPileLoadScenario",
  "BEAM_SUPPORT_PRESETS",
  "DeepFoundationModel",
  "GeotechnicalDeepFoundationApplication",
  "GeotechnicalDesignSituation",
  "GroundModel",
  "GroundProfile",
  "SoilMaterial",
  "VerticalStressProfile",
  "BaseMaterial",
  "BandedLinearSolver",
  "BeamLinePreprocessor2D",
  "BeamSectionActionVerifier",
  "CalculationResult",
  "CircularSection",
  "CompositeSection",
  "CompositeSectionComponent",
  "ConcreteMaterial",
  "ConcreteNoTensionLaw",
  "ConcreteParabolaRectangleLaw",
  "ConcreteStressBlockLaw",
  "ConcreteTriangularRectangleLaw",
  "CrossSection",
  "DenseLinearSolver",
  "DistributedLoad",
  "DofRegistry",
  "DEFAULT_SECTION_ROTATION",
  "ElasticBeamSectionProvider",
  "FoundationBeamAnalysis",
  "FoundationBeamFemBuilder",
  "FoundationBeamModel",
  "EXISTING_MATERIAL_CONFIDENCE_LEVELS",
  "FORCE_UNIT_FACTORS",
  "FemAssembler2D",
  "FrameElement2DEulerBernoulli",
  "FrameElement2DTimoshenko",
  "IllinoisRootSolver",
  "KinematicConstraintReducer2D",
  "LENGTH_UNIT_FACTORS",
  "LineLoad",
  "LinearStaticSolver2D",
  "Load",
  "NTC2018_CONCRETE_CLASSES",
  "NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS",
  "NTC2018_OVERSTRENGTH_FACTORS",
  "NTC2018_REINFORCEMENT_STEEL_GRADES",
  "NTC2018_STRUCTURAL_BEHAVIOR",
  "NodalLoad",
  "Node",
  "PolygonSection",
  "PointLoad",
  "PUNCHING_ACTION_SCHEMA_VERSION",
  "PUNCHING_CONNECTION_SCHEMA_VERSION",
  "PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION",
  "PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION",
  "PunchingActionState",
  "PunchingConnectionModel",
  "PunchingControlPerimeter",
  "PunchingVerification",
  "PunchingVerificationRequest",
  "RCBiaxialDomainBuilder",
  "RCMomentCurvatureAnalyzer",
  "RC_PLATE_ANALYSIS_TYPES",
  "RC_PUNCHING_DESIGN_CODE_IDS",
  "RC_PUNCHING_DESIGN_CODE_ID_VALUES",
  "RC_PUNCHING_PARAMETER_PROFILES",
  "RCServiceStressSolver",
  "RCUniaxialDomainBuilder",
  "RCUltimateSectionSolver",
  "RESULT_STATUS",
  "RESULT_STATUS_FAILED",
  "RESULT_STATUS_NOT_ANALYZED",
  "RESULT_STATUS_NOT_IMPLEMENTED",
  "RESULT_STATUS_NOT_SUPPORTED",
  "RESULT_STATUS_NOT_VERIFIED",
  "RESULT_STATUS_OK",
  "RESULT_STATUS_VALUES",
  "RectangularSection",
  "RectangularFootingContactAnalysis",
  "ReinforcedConcreteSection",
  "ReinforcedConcreteSectionApplication",
  "ReinforcedConcreteBeamDetailingVerification",
  "ReinforcedConcreteBeamSectionProvider",
  "ReinforcedConcreteBeamVerification",
  "ReinforcedConcreteColumnApplication",
  "ReinforcedConcreteColumnDetailingVerification",
  "ReinforcedConcreteColumnModel",
  "ReinforcedConcreteColumnVerification",
  "ReinforcedConcreteIsolatedFootingApplication",
  "ReinforcedConcreteIsolatedFootingModel",
  "ReinforcedConcreteIsolatedFootingVerification",
  "ReinforcedConcreteFoundationBeamApplication",
  "ReinforcedConcreteFoundationBeamModel",
  "ReinforcedConcretePlateApplication",
  "ReinforcedConcretePlateModel",
  "ReinforcedConcretePlateVerification",
  "ReinforcedConcretePunchingApplication",
  "ReinforcedConcreteSectionModel",
  "ReinforcedConcreteServiceabilityVerification",
  "ReinforcedConcreteShearVerification",
  "ReinforcedConcreteSectionVerification",
  "ReinforcedConcreteTorsionVerification",
  "ReinforcementBar",
  "SectionFiberDiscretizer",
  "SectionMomentCurvatureCurve",
  "SteelElasticPerfectlyPlasticLaw",
  "SteelElasticLaw",
  "SteelElasticPlasticHardeningLaw",
  "SteelMaterial",
  "SingleBeamAnalysis",
  "SingleBeamFemBuilder",
  "SingleBeamModel",
  "StrainField",
  "StructuralApplication",
  "Support",
  "TSection",
  "VerificationResult",
  "assertExplicitUnitSystem",
  "assertPositiveCheckValue",
  "characteristicValueFromExistingMean",
  "convertUnitProperties",
  "createLongitudinalReinforcementLayout",
  "createNTC2018ConcreteMaterial",
  "createNTC2018ReinforcementSteelMaterial",
  "createElasticBeamSectionProvider",
  "createReinforcedConcreteBeamSectionProvider",
  "createPlateStripSection",
  "createUnitResolver",
  "governingCheck",
  "getRcPunchingDesignCodeManifest",
  "isFinitePositive",
  "isResultStatus",
  "integrateFootingPressureStrip",
  "normalizeUnitSystem",
  "normalizeExistingMaterialKnowledgeLevel",
  "normalizeNTC2018StructuralBehavior",
  "normalizeSectionRotation",
  "principalSecondMoments",
  "resolveExistingMaterialState",
  "resolveBeamSupportPreset",
  "resolvePunchingTransferFromJointActions",
  "resolvePrincipalSectionFrame",
  "selectNTC2018OverstrengthFactors",
  "splitPrincipalActions",
  "round",
  "rotatePlateMoments",
  "rotatePlateShear",
  "rotateSecondMoments",
  "calculateSectionMassProperties",
  "calculateEn1992AnchorageLength",
  "calculateEn1992DesignBondStrength",
  "calculateEn1992LocalBearingResistance",
  "calculateEn1992ShrinkageCurvature",
  "uniqueStrings",
  "utilizationCheck",
  "verifyBeamSectionActions",
  "verifyPlateBending",
  "verifyPlateServiceability",
  "verifyPlateShear",
  "verifyPlateSlenderness",
  "verifyPunching",
  "woodArmer",
  "NTC2018_SHEAR_WALL_REFERENCES",
  "NTC2018_WALL_SYSTEM_REFERENCES",
  "WALL_BIAXIAL_REFERENCE",
  "computeMixedSystemWallShearEnvelope",
  "computeWallBoundaryLength",
  "computeWallCapacityShear",
  "computeWallConfinementOmegaWd",
  "computeWallCriticalZoneHeight",
  "computeWallEffectiveFlangeWidth",
  "computeWallMomentShift",
  "computeWeaklyReinforcedWallAxialDemandRange",
  "computeWeaklyReinforcedWallShearDemand",
  "createCouplingBeamAssessment",
  "createWallHeightSystemAssessment",
  "createWallSectionAssessment",
  "verifyWallBiaxialBending",
  "verifyWallBoundaryConfinement",
  "verifyWallCurvatureDuctility",
  "verifyWallGeneralDetailing",
  "verifyWallShear",
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

void test("the migrated runtime exports exactly the declared public subset", () => {
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

  const typescriptIdentityResolver = TypeScriptApi.createUnitResolver(null);
  const javascriptIdentityResolver = createJavaScriptResolver(null);
  assert.equal(
    typescriptIdentityResolver.length === typescriptIdentityResolver.area,
    javascriptIdentityResolver.length === javascriptIdentityResolver.area,
  );
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
