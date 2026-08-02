// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import {
  collectConcurrentSurfaceResultantStates,
  projectSlabResultantStatesToResistanceAxes,
} from "../../domain/fem/index.js";
import type {
  ConcurrentFemSurfaceDemand,
  ResistanceMappedSlab,
  ResistanceShellResultantState,
} from "../../domain/fem/index.js";
import type {
  FemPunchingConnection,
  FemSignConventions,
  FemUnitSystem,
  GlobalFemAnalysisContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import type { VerificationCheck } from "../../core/results/VerificationResult.js";

type RcCheck = VerificationCheck & { readonly id?: string; readonly ok?: boolean };

export interface SlabSystemData extends Record<string, unknown> {
  readonly limitStateByReference?: Readonly<Record<string, string | null>>;
  readonly seismicReferenceKeys?: readonly string[] | null;
  readonly detailingChecks: readonly RcCheck[];
  readonly punchingRequired: boolean;
  readonly punchingNotApplicableReason?: string | null;
  readonly diaphragmRequired: boolean;
  readonly diaphragmNotApplicableReason?: string | null;
}

export interface SlabSystemContext {
  readonly analysis?: GlobalFemAnalysisContract | null;
  readonly behavior?: string | null;
  readonly structuralType?: string | null;
  readonly q?: number | null;
  readonly q0?: number | null;
  readonly kr?: number | null;
  readonly units?: FemUnitSystem | null;
  readonly globalFem?: Record<string, unknown> | null;
}

export interface SlabSystemDemandSet {
  readonly units?: FemUnitSystem | null;
  readonly signConventions?: FemSignConventions | null;
  readonly surfaceDemands?: readonly ConcurrentFemSurfaceDemand[];
}

export interface SlabStateVerifierInput {
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly data: SlabSystemData;
  readonly state: ResistanceShellResultantState;
  readonly limitState: string | null;
  readonly context: SlabSystemContext;
}

export interface SlabStateVerifierOutcome {
  readonly [key: string]: unknown;
  readonly bending?: RcCheck;
  readonly oneWayShear?: RcCheck;
  readonly stress?: RcCheck;
  readonly cracking?: RcCheck;
  readonly deflection?: RcCheck;
  readonly outputs?: unknown;
}

export type SlabStateVerifier = (input: SlabStateVerifierInput) => SlabStateVerifierOutcome;

export interface PunchingVerifierInput {
  readonly connection: FemPunchingConnection;
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly data: SlabSystemData;
  readonly demandSet: SlabSystemDemandSet | null | undefined;
  readonly context: SlabSystemContext;
}

export interface PunchingVerifierOutcome {
  readonly assessedCombinationIds?: readonly string[];
  readonly checks?: readonly RcCheck[];
  readonly outputs?: unknown;
}

export type PunchingVerifier = (input: PunchingVerifierInput) => PunchingVerifierOutcome;

export interface DiaphragmStateVerifierInput {
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly data: SlabSystemData;
  readonly state: ResistanceShellResultantState;
  readonly designActions: Record<string, number>;
  readonly context: SlabSystemContext;
}

export interface DiaphragmStateVerifierOutcome {
  readonly capacityChecks?: readonly unknown[];
}

export type DiaphragmStateVerifier = (
  input: DiaphragmStateVerifierInput,
) => DiaphragmStateVerifierOutcome;

export interface SlabSystemVerificationInput {
  readonly slabs: readonly (ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] })[];
  readonly slabSystemData?: Readonly<Record<string, SlabSystemData>> | null | undefined;
  readonly slabStateVerifier?: SlabStateVerifier | null | undefined;
  readonly punchingConnections?: readonly FemPunchingConnection[] | undefined;
  readonly punchingVerifier?: PunchingVerifier | null | undefined;
  readonly diaphragmStateVerifier?: DiaphragmStateVerifier | null | undefined;
  readonly demandSet?: SlabSystemDemandSet | null | undefined;
  readonly context: SlabSystemContext;
}

export interface SlabSystemVerificationResult {
  readonly slabId: string;
  readonly status: "not-implemented" | "not-applicable" | "ok" | "not-verified" | "failed";
  readonly complete: boolean;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly checks: readonly RcCheck[];
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCheck(value: unknown): value is RcCheck {
  return isRecord(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
import {
  amplifyNTC2018DiaphragmActions,
  createDiaphragmAssessment,
} from "../../norms/ntc2018/reinforced-concrete/ntc2018Diaphragm.js";

function referenceLimitState(
  reference: ResistanceShellResultantState["reference"],
  analysis: GlobalFemAnalysisContract | null | undefined,
  data: SlabSystemData,
): string | null {
  if (reference?.combinationId != null) {
    const combination = analysis?.combinations?.find((item) => item.id === reference.combinationId);
    if (combination) return combination.limitState;
  }
  const key = JSON.stringify(reference ?? {});
  return data.limitStateByReference?.[key] ?? null;
}

function isSeismicReference(
  reference: ResistanceShellResultantState["reference"],
  analysis: GlobalFemAnalysisContract | null | undefined,
  data: SlabSystemData,
): boolean {
  if (reference?.combinationId != null) {
    const combination = analysis?.combinations?.find((item) => item.id === reference.combinationId);
    const cases = new Map((analysis?.loadCases ?? []).map((item) => [item.id, item]));
    if (
      combination?.terms?.some((term) => cases.get(term.loadCaseId)?.nature?.startsWith("seismic"))
    ) {
      return true;
    }
  }
  const key = JSON.stringify(reference ?? {});
  return data.seismicReferenceKeys?.includes(key) ?? false;
}

function normalizeSlabState({
  slab,
  state,
  outcome,
  limitState,
}: {
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly state: ResistanceShellResultantState;
  readonly outcome: SlabStateVerifierOutcome;
  readonly limitState: string | null;
}): SlabSystemVerificationResult {
  const required =
    limitState === "ultimate"
      ? ["bending", "oneWayShear"]
      : limitState === "serviceability"
        ? ["stress", "cracking", "deflection"]
        : [];
  const missing = [
    ...(required.length === 0 ? ["recognized-limit-state"] : []),
    ...required.filter((name) => {
      const candidate = outcome[name];
      return !isCheck(candidate) || typeof candidate.ok !== "boolean";
    }),
  ];
  const checks = required
    .filter((name) => {
      const candidate = outcome[name];
      return isCheck(candidate) && typeof candidate.ok === "boolean";
    })
    .map((name) => {
      const candidate = outcome[name];
      if (!isCheck(candidate) || typeof candidate.ok !== "boolean") return null;
      const existingMetadata = candidate.metadata;
      return {
        ...candidate,
        id:
          typeof candidate.id === "string"
            ? candidate.id
            : `slab-${name}-${slab.id}-${state.shellElementId}`,
        ok: candidate.ok,
        metadata: {
          ...(isRecord(existingMetadata) ? existingMetadata : {}),
          slabId: slab.id,
          shellElementId: state.shellElementId,
          reference: state.reference,
        },
      };
    })
    .filter((item) => item !== null);
  return {
    slabId: slab.id,
    shellElementId: state.shellElementId,
    reference: state.reference,
    limitState,
    complete: missing.length === 0,
    status:
      missing.length > 0
        ? "not-implemented"
        : checks.every((item) => item.ok)
          ? "ok"
          : "not-verified",
    ok: missing.length === 0 && checks.every((item) => item.ok),
    missing,
    checks,
    outputs: outcome?.outputs ?? null,
  };
}

function verifyPunchingForSlab({
  slab,
  data,
  punchingConnections,
  punchingVerifier,
  demandSet,
  context,
}: {
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly data: SlabSystemData;
  readonly punchingConnections: readonly FemPunchingConnection[] | undefined;
  readonly punchingVerifier: PunchingVerifier | null | undefined;
  readonly demandSet: SlabSystemDemandSet | null | undefined;
  readonly context: SlabSystemContext;
}): Record<string, unknown> & {
  readonly status: SlabSystemVerificationResult["status"];
  readonly complete: boolean;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly connections: readonly Record<string, unknown>[];
  readonly checks: readonly RcCheck[];
} {
  if (typeof data.punchingRequired !== "boolean") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: ["punchingRequired"],
      connections: [],
      checks: [],
    };
  }
  if (!data.punchingRequired) {
    const reason = data.punchingNotApplicableReason;
    const complete = typeof reason === "string" && reason.length > 0;
    return {
      status: complete ? "not-applicable" : "not-implemented",
      complete,
      ok: complete,
      reason: complete ? reason : null,
      missing: complete ? [] : ["punchingNotApplicableReason"],
      connections: [],
      checks: [],
    };
  }
  const connections = (punchingConnections ?? []).filter((item) => item.slabId === slab.id);
  if (connections.length === 0 || typeof punchingVerifier !== "function") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: [
        ...(connections.length === 0 ? [`punchingConnections for ${slab.id}`] : []),
        ...(typeof punchingVerifier !== "function" ? ["punchingVerifier"] : []),
      ],
      connections: [],
      checks: [],
    };
  }
  const requiredCombinationIds = (context.analysis?.combinations ?? [])
    .filter((item) => item.limitState === "ultimate")
    .map((item) => item.id);
  const results = connections.map((connection) => {
    try {
      const outcome = punchingVerifier({
        connection,
        slab,
        data,
        demandSet,
        context,
      });
      const assessed = outcome?.assessedCombinationIds ?? [];
      const missingCombinations = requiredCombinationIds.filter((id) => !assessed.includes(id));
      const checks = outcome.checks ?? [];
      const checksValid = checks.length > 0 && checks.every((item) => typeof item.ok === "boolean");
      const complete = missingCombinations.length === 0 && checksValid;
      return {
        connectionId: connection.id,
        status: complete
          ? checks.every((item) => item.ok === true)
            ? "ok"
            : "not-verified"
          : "not-implemented",
        complete,
        ok: complete && checks.every((item) => item.ok === true),
        missingCombinationIds: missingCombinations,
        checks,
        outputs: outcome?.outputs ?? null,
      };
    } catch (error) {
      return {
        connectionId: connection.id,
        status: "failed",
        complete: false,
        ok: false,
        reason: errorMessage(error),
        checks: [],
      };
    }
  });
  const complete = results.every((item) => item.complete);
  const ok = complete && results.every((item) => item.ok);
  return {
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    missing: [],
    connections: results,
    checks: results.flatMap((item) => item.checks),
  };
}

function verifyDiaphragmForSlab({
  slab,
  data,
  states,
  diaphragmStateVerifier,
  context,
}: {
  readonly slab: ResistanceMappedSlab & { readonly diaphragmIds: readonly string[] };
  readonly data: SlabSystemData;
  readonly states: readonly ResistanceShellResultantState[];
  readonly diaphragmStateVerifier: DiaphragmStateVerifier | null | undefined;
  readonly context: SlabSystemContext;
}): Record<string, unknown> & {
  readonly status: SlabSystemVerificationResult["status"];
  readonly complete: boolean;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly stateAssessments: readonly Record<string, unknown>[];
  readonly checks: readonly RcCheck[];
} {
  if (typeof data.diaphragmRequired !== "boolean") {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: ["diaphragmRequired"],
      stateAssessments: [],
      checks: [],
    };
  }
  if (!data.diaphragmRequired) {
    const reason = data.diaphragmNotApplicableReason;
    const complete = typeof reason === "string" && reason.length > 0;
    return {
      status: complete ? "not-applicable" : "not-implemented",
      complete,
      ok: complete,
      reason: complete ? reason : null,
      missing: complete ? [] : ["diaphragmNotApplicableReason"],
      stateAssessments: [],
      checks: [],
    };
  }
  if (
    !Array.isArray(slab.diaphragmIds) ||
    slab.diaphragmIds.length === 0 ||
    typeof diaphragmStateVerifier !== "function"
  ) {
    return {
      status: "not-implemented",
      complete: false,
      ok: false,
      missing: [
        ...(!(slab.diaphragmIds?.length > 0) ? ["slab.diaphragmIds"] : []),
        ...(typeof diaphragmStateVerifier !== "function" ? ["diaphragmStateVerifier"] : []),
      ],
      stateAssessments: [],
      checks: [],
    };
  }
  const seismicStates = states.filter((state) =>
    isSeismicReference(state.reference, context.analysis, data),
  );
  const stateAssessments = seismicStates.map((state) => {
    const analysisActions = {
      Nx: state.resistanceResultants.Nx,
      Ny: state.resistanceResultants.Ny,
      Nxy: state.resistanceResultants.Nxy,
    };
    const amplified = amplifyNTC2018DiaphragmActions({
      analysisActions,
    });
    try {
      const outcome = diaphragmStateVerifier({
        slab,
        data,
        state,
        designActions: amplified.designActions,
        context,
      });
      return createDiaphragmAssessment({
        diaphragmId: slab.diaphragmIds.join("+"),
        analysisActions,
        capacityChecks: outcome.capacityChecks ?? [],
      });
    } catch (error) {
      return {
        status: "failed",
        complete: false,
        allChecksOk: false,
        reason: errorMessage(error),
        checks: [],
      };
    }
  });
  const complete = stateAssessments.length > 0 && stateAssessments.every((item) => item.complete);
  const ok = complete && stateAssessments.every((item) => item.allChecksOk);
  return {
    status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
    complete,
    ok,
    missing: seismicStates.length === 0 ? ["seismic shell-resultant states"] : [],
    stateAssessments,
    checks: stateAssessments.flatMap((item) => item.checks),
  };
}

export function runSlabSystemVerifications({
  slabs,
  slabSystemData,
  slabStateVerifier,
  punchingConnections,
  punchingVerifier,
  diaphragmStateVerifier,
  demandSet,
  context,
}: SlabSystemVerificationInput): SlabSystemVerificationResult[] {
  const results: SlabSystemVerificationResult[] = [];
  for (const slab of slabs ?? []) {
    const data = slabSystemData?.[slab.id];
    if (data == null || typeof slabStateVerifier !== "function") {
      results.push({
        slabId: slab.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null ? [`slabSystemData.${slab.id}`] : []),
          ...(typeof slabStateVerifier !== "function" ? ["slabStateVerifier"] : []),
        ],
        checks: [],
      });
      continue;
    }
    try {
      const demand = demandSet?.surfaceDemands?.find((item) => item.id === slab.id);
      const sourceStates = demand ? collectConcurrentSurfaceResultantStates(demand) : [];
      const states = projectSlabResultantStatesToResistanceAxes({
        slab,
        states: sourceStates,
      });
      const stateAssessments = states.map((state) => {
        const limitState = referenceLimitState(state.reference, context.analysis, data);
        try {
          const outcome = slabStateVerifier({
            slab,
            data,
            state,
            limitState,
            context,
          });
          return normalizeSlabState({
            slab,
            state,
            outcome,
            limitState,
          });
        } catch (error) {
          return {
            slabId: slab.id,
            shellElementId: state.shellElementId,
            reference: state.reference,
            limitState,
            status: "failed",
            complete: false,
            ok: false,
            missing: [],
            reason: errorMessage(error),
            checks: [],
          };
        }
      });
      const detailingChecks = data.detailingChecks;
      const detailingComplete =
        detailingChecks.length > 0 &&
        detailingChecks.every((item) => typeof item?.ok === "boolean");
      const punching = verifyPunchingForSlab({
        slab,
        data,
        punchingConnections,
        punchingVerifier,
        demandSet,
        context,
      });
      const diaphragm = verifyDiaphragmForSlab({
        slab,
        data,
        states,
        diaphragmStateVerifier,
        context,
      });
      const complete =
        states.length > 0 &&
        stateAssessments.every((item) => item.complete) &&
        detailingComplete &&
        punching.complete &&
        diaphragm.complete;
      const checks = [
        ...stateAssessments.flatMap((item) => item.checks),
        ...detailingChecks,
        ...punching.checks,
        ...diaphragm.checks,
      ];
      const ok = complete && checks.every((item) => item.ok === true);
      results.push({
        slabId: slab.id,
        status: complete ? (ok ? "ok" : "not-verified") : "not-implemented",
        complete,
        ok,
        missing: [
          ...(states.length === 0 ? ["shell-resultant states"] : []),
          ...(!detailingComplete ? ["detailingChecks"] : []),
          ...(punching.complete ? [] : punching.missing),
          ...(diaphragm.complete ? [] : diaphragm.missing),
        ],
        sourceStateCount: sourceStates.length,
        resistanceStateCount: states.length,
        stateAssessments,
        detailingChecks,
        punching,
        diaphragm,
        checks,
      });
    } catch (error) {
      results.push({
        slabId: slab.id,
        status: "failed",
        complete: false,
        ok: false,
        missing: [],
        reason: errorMessage(error),
        checks: [],
      });
    }
  }
  return results;
}
