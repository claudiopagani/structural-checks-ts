// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import {
  collectConcurrentSupportReactionStates,
  projectFoundationReactionStatesToResistanceAxes,
} from "../../domain/fem/index.js";
import type {
  ConcurrentFemGlobalResponses,
  ResistanceMappedFoundation,
  ResistanceSupportReactionState,
} from "../../domain/fem/index.js";
import type {
  FemSignConventions,
  FemUnitSystem,
  GlobalFemAnalysisContract,
} from "../../domain/fem/contracts/FemContractTypes.js";

type RcCheck = Record<string, unknown> & { readonly id?: string; readonly ok?: boolean };
type FoundationCheck = RcCheck & { readonly id: string; readonly ok: boolean };

export interface FoundationSystemData extends Record<string, unknown> {
  readonly localVerificationModelId?: string;
}

export interface FoundationVerifierInput {
  readonly foundation: ResistanceMappedFoundation & { readonly type: string };
  readonly data: FoundationSystemData;
  readonly demand: {
    readonly schema: "strutture-js/rc-foundation-fem-demand-context";
    readonly version: 0;
    readonly units: FemUnitSystem | null;
    readonly signConventions: FemSignConventions | null;
    readonly concurrentReactionStates: Readonly<
      ReturnType<typeof collectConcurrentSupportReactionStates>
    >;
    readonly concurrentResistanceReactionStates: readonly ResistanceSupportReactionState[];
    readonly groupedResistanceReactionStates: readonly FoundationReactionStateGroup[];
  };
  readonly context: FoundationSystemVerificationContext;
}

export interface FoundationVerifierOutcome {
  readonly [key: string]: unknown;
  readonly assessedCombinationIds?: readonly string[];
  readonly structural?: RcCheck;
  readonly geotechnicalUltimate?: RcCheck;
  readonly serviceability?: RcCheck;
  readonly supportConnection?: RcCheck;
  readonly seismicFoundation?: RcCheck;
  readonly outputs?: unknown;
}

export type FoundationVerifier = (input: FoundationVerifierInput) => FoundationVerifierOutcome;

export interface FoundationSystemDemandSet {
  readonly units?: FemUnitSystem | null;
  readonly signConventions?: FemSignConventions | null;
  readonly globalResponses?: ConcurrentFemGlobalResponses | null;
}

export interface FoundationSystemVerificationContext {
  readonly analysis?: GlobalFemAnalysisContract | null;
  readonly behavior?: string | null;
  readonly structuralType?: string | null;
  readonly q?: number | null;
  readonly q0?: number | null;
  readonly kr?: number | null;
  readonly units?: FemUnitSystem | null;
}

export interface FoundationReactionStateGroup {
  readonly reference: ResistanceSupportReactionState["reference"];
  readonly reactions: readonly ResistanceSupportReactionState[];
  readonly complete: boolean;
  readonly missingSupportNodeIds: readonly string[];
}

export interface FoundationSystemVerificationInput {
  readonly foundations: readonly (ResistanceMappedFoundation & { readonly type: string })[];
  readonly foundationSystemData?: Readonly<Record<string, FoundationSystemData>> | null | undefined;
  readonly foundationVerifier?: FoundationVerifier | null | undefined;
  readonly demandSet?: FoundationSystemDemandSet | null | undefined;
  readonly context: FoundationSystemVerificationContext;
}

export interface FoundationSystemVerificationResult {
  readonly foundationId: string;
  readonly foundationType?: string;
  readonly status: "not-implemented" | "ok" | "not-verified" | "failed";
  readonly complete: boolean;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly checks: readonly RcCheck[];
  readonly [key: string]: unknown;
}

function groupReactionStates(
  states: readonly ResistanceSupportReactionState[],
  supportNodeIds: readonly string[],
): FoundationReactionStateGroup[] {
  const groups = new Map<
    string,
    {
      reference: ResistanceSupportReactionState["reference"];
      reactions: ResistanceSupportReactionState[];
    }
  >();
  for (const state of states) {
    const key = JSON.stringify(state.reference ?? {});
    if (!groups.has(key)) {
      groups.set(key, {
        reference: state.reference,
        reactions: [],
      });
    }
    const group = groups.get(key);
    if (group === undefined) {
      throw new Error(`Unable to group foundation reaction state ${key}.`);
    }
    group.reactions.push(state);
  }
  return [...groups.values()].map((group) => {
    const supplied = new Set(group.reactions.map((state) => state.nodeId));
    const missingSupportNodeIds = supportNodeIds.filter((nodeId) => !supplied.has(nodeId));
    return {
      ...group,
      complete: missingSupportNodeIds.length === 0,
      missingSupportNodeIds,
    };
  });
}

function hasSeismicCombinations(analysis: GlobalFemAnalysisContract | null | undefined): boolean {
  const cases = new Map((analysis?.loadCases ?? []).map((item) => [item.id, item]));
  return (analysis?.combinations ?? []).some((combination) =>
    combination.terms?.some((term) => cases.get(term.loadCaseId)?.nature?.startsWith("seismic")),
  );
}

function isCheck(value: unknown): value is RcCheck {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runFoundationSystemVerifications({
  foundations,
  foundationSystemData,
  foundationVerifier,
  demandSet,
  context,
}: FoundationSystemVerificationInput): FoundationSystemVerificationResult[] {
  const results: FoundationSystemVerificationResult[] = [];
  for (const foundation of foundations ?? []) {
    const data = foundationSystemData?.[foundation.id];
    if (data == null || typeof foundationVerifier !== "function") {
      results.push({
        foundationId: foundation.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null ? [`foundationSystemData.${foundation.id}`] : []),
          ...(typeof foundationVerifier !== "function" ? ["foundationVerifier"] : []),
        ],
        checks: [],
      });
      continue;
    }
    try {
      const sourceStates = foundation.supportNodeIds.flatMap((nodeId) =>
        collectConcurrentSupportReactionStates({
          nodeId,
          ...(demandSet?.globalResponses === undefined
            ? {}
            : { globalResponses: demandSet.globalResponses }),
        }),
      );
      const resistanceStates = projectFoundationReactionStatesToResistanceAxes({
        foundation,
        states: sourceStates,
      });
      const groupedStates = groupReactionStates(resistanceStates, foundation.supportNodeIds);
      const expectedCombinationIds = (context.analysis?.combinations ?? []).map((item) => item.id);
      const outcome = foundationVerifier({
        foundation,
        data,
        demand: {
          schema: "strutture-js/rc-foundation-fem-demand-context",
          version: 0,
          units: demandSet?.units ?? null,
          signConventions: demandSet?.signConventions ?? null,
          concurrentReactionStates: sourceStates,
          concurrentResistanceReactionStates: resistanceStates,
          groupedResistanceReactionStates: groupedStates,
        },
        context,
      });
      const requiredFamilies = [
        "structural",
        "geotechnicalUltimate",
        "serviceability",
        "supportConnection",
        ...(hasSeismicCombinations(context.analysis) ? ["seismicFoundation"] : []),
      ];
      const missingFamilies = requiredFamilies.filter((name) => {
        const candidate = outcome[name];
        return !isCheck(candidate) || typeof candidate.ok !== "boolean";
      });
      const assessedCombinationIds = outcome?.assessedCombinationIds ?? [];
      const missingCombinationIds = expectedCombinationIds.filter(
        (id) => !assessedCombinationIds.includes(id),
      );
      const checks = requiredFamilies
        .map((name): FoundationCheck | null => {
          const candidate = outcome[name];
          if (!isCheck(candidate) || typeof candidate.ok !== "boolean") return null;
          const existingMetadata = candidate.metadata;
          return {
            ...candidate,
            id:
              typeof candidate.id === "string"
                ? candidate.id
                : `foundation-${name}-${foundation.id}`,
            ok: candidate.ok,
            metadata: {
              ...(typeof existingMetadata === "object" &&
              existingMetadata !== null &&
              !Array.isArray(existingMetadata)
                ? existingMetadata
                : {}),
              foundationId: foundation.id,
              foundationType: foundation.type,
            },
          };
        })
        .filter((item): item is FoundationCheck => item !== null);
      const complete =
        sourceStates.length > 0 &&
        groupedStates.every((group) => group.complete) &&
        missingFamilies.length === 0 &&
        missingCombinationIds.length === 0;
      const ok = complete && checks.every((item) => item.ok);
      const status: FoundationSystemVerificationResult["status"] = complete
        ? ok
          ? "ok"
          : "not-verified"
        : "not-implemented";
      results.push({
        foundationId: foundation.id,
        foundationType: foundation.type,
        status,
        complete,
        ok,
        missing: [...(sourceStates.length === 0 ? ["reaction states"] : []), ...missingFamilies],
        missingCombinationIds,
        sourceStateCount: sourceStates.length,
        resistanceStateCount: resistanceStates.length,
        groupedResistanceReactionStates: groupedStates,
        checks,
        outputs: outcome?.outputs ?? null,
      });
    } catch (error) {
      results.push({
        foundationId: foundation.id,
        foundationType: foundation.type,
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
