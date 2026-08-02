import test from "node:test";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GLOBAL_FEM_READINESS_ASSESSMENTS,
  GlobalFemPostProcessingApplication,
  classifyGlobalFemStructuralEntities,
  evaluateGlobalFemVerificationReadiness,
  extractGlobalFemDemands,
  normalizeGlobalFemClassificationPolicy,
} from "../dist/index.js";
import type {
  GlobalFemClassificationPolicy,
  GlobalFemClassificationPolicyInput,
  GlobalFemClassificationRequest,
  GlobalFemDemandExtractionRequest,
  GlobalFemPostProcessingInput,
  GlobalFemStructuralClassificationProposal,
  GlobalFemVerificationReadinessReport,
  GlobalFemVerificationReadinessRequest,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type AssertExtends<T extends U, U> = T;

type PublicFunctionsAreTyped = [
  AssertFalse<IsAny<typeof normalizeGlobalFemClassificationPolicy>>,
  AssertFalse<IsAny<typeof classifyGlobalFemStructuralEntities>>,
  AssertFalse<IsAny<typeof extractGlobalFemDemands>>,
  AssertFalse<IsAny<typeof evaluateGlobalFemVerificationReadiness>>,
  AssertFalse<IsAny<GlobalFemPostProcessingApplication["run"]>>,
];

type PublicResultsAreUseful = [
  AssertExtends<
    ReturnType<typeof normalizeGlobalFemClassificationPolicy>,
    GlobalFemClassificationPolicy
  >,
  AssertExtends<
    ReturnType<typeof classifyGlobalFemStructuralEntities>,
    GlobalFemStructuralClassificationProposal
  >,
  AssertExtends<
    ReturnType<typeof evaluateGlobalFemVerificationReadiness>,
    GlobalFemVerificationReadinessReport
  >,
  AssertExtends<
    NonNullable<Parameters<typeof classifyGlobalFemStructuralEntities>[0]>,
    GlobalFemClassificationRequest
  >,
  AssertExtends<
    NonNullable<Parameters<typeof extractGlobalFemDemands>[0]>,
    GlobalFemDemandExtractionRequest
  >,
  AssertExtends<
    NonNullable<Parameters<typeof evaluateGlobalFemVerificationReadiness>[0]>,
    GlobalFemVerificationReadinessRequest
  >,
  AssertExtends<
    NonNullable<Parameters<GlobalFemPostProcessingApplication["run"]>[0]>,
    GlobalFemPostProcessingInput
  >,
];

const policyInput: GlobalFemClassificationPolicyInput = {
  line: { maximumBeamInclinationDegrees: 30 },
};
const classificationRequest: GlobalFemClassificationRequest = { policy: policyInput };
const demandRequest: GlobalFemDemandExtractionRequest = {};
const readinessRequest: GlobalFemVerificationReadinessRequest = {
  profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.DEMAND_ONLY,
  requestedAssessments: [GLOBAL_FEM_READINESS_ASSESSMENTS.GENERIC_DEMANDS],
};
const applicationInput: GlobalFemPostProcessingInput = {
  profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  requestedAssessments: [GLOBAL_FEM_READINESS_ASSESSMENTS.SEMANTIC_DEMANDS],
};

void classificationRequest;
void demandRequest;
void readinessRequest;
void applicationInput;
void GlobalFemPostProcessingApplication;
void classifyGlobalFemStructuralEntities;
void evaluateGlobalFemVerificationReadiness;
void extractGlobalFemDemands;
void normalizeGlobalFemClassificationPolicy;
void (null as unknown as PublicFunctionsAreTyped);
void (null as unknown as PublicResultsAreUseful);
void test("global FEM postprocessing declarations support typed consumers", () => {
  // Compile-time assertions above are the test.
});
