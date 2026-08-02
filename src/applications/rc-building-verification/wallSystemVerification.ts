// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import {
  collectConcurrentSectionCutStates,
  projectWallSectionCutStatesToResistanceAxes,
} from "../../domain/fem/index.js";
import type {
  ConcurrentFemGlobalResponses,
  ResistanceMappedWall,
  ResistanceSectionCutState,
} from "../../domain/fem/index.js";
import type {
  FemStructuralWall,
  FemUnitSystem,
  GlobalFemAnalysisContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import type { VerificationCheck } from "../../core/results/VerificationResult.js";
import type {
  Ntc2018StructuralBehavior,
  Ntc2018StructuralType,
} from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import type {
  CouplingBeamAssessmentInput,
  WallGeneralDetailingInput,
} from "../../norms/ntc2018/reinforced-concrete/wallSystemChecks.js";
import { NTC2018_STRUCTURAL_BEHAVIOR } from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import {
  createCouplingBeamAssessment,
  createWallHeightSystemAssessment,
  verifyWallGeneralDetailing,
} from "../../norms/ntc2018/reinforced-concrete/wallSystemChecks.js";

type RcCheck = VerificationCheck & { id?: string };
type StrictRcCheck = RcCheck & { id: string; ok: boolean };

export interface WallSystemData {
  readonly systemType: string;
  readonly redistributionApplied: boolean;
  readonly additionalChecks: readonly RcCheck[];
  readonly couplingBeamInputs: readonly CouplingBeamAssessmentInput[];
  readonly dissipativeSectionCutIds?: readonly string[] | null;
  readonly detailingInput?: WallGeneralDetailingInput | null;
}

export type WallSystemMappedWall = ResistanceMappedWall &
  Pick<FemStructuralWall, "shellElementIds" | "storeyIds">;

export interface WallSystemStateVerifierOutcome {
  readonly [key: string]: unknown;
  readonly flexure?: RcCheck;
  readonly shear?: RcCheck;
  readonly axialCompression?: RcCheck;
  readonly ductility?: RcCheck;
  readonly outputs?: unknown;
}

export interface WallSystemVerificationContext {
  readonly behavior: Ntc2018StructuralBehavior | null;
  readonly structuralType?: Ntc2018StructuralType | null;
  readonly q: number | null;
  readonly q0?: number | null;
  readonly kr?: number | null;
  readonly units?: FemUnitSystem | null;
  readonly analysis?: GlobalFemAnalysisContract | null;
  readonly globalFem?: Record<string, unknown> | null;
}

export interface WallSectionStateVerifierInput {
  readonly wall: WallSystemMappedWall;
  readonly data: WallSystemData;
  readonly state: ResistanceSectionCutState;
  readonly context: WallSystemVerificationContext;
}

export type WallSectionStateVerifier = (
  input: WallSectionStateVerifierInput,
) => WallSystemStateVerifierOutcome;

export interface WallSystemDemandSet {
  readonly globalResponses?: ConcurrentFemGlobalResponses | null;
}

export interface WallSystemVerificationInput {
  readonly walls: readonly WallSystemMappedWall[];
  readonly wallSystemData?: Readonly<Record<string, WallSystemData>> | null | undefined;
  readonly wallSectionStateVerifier?: WallSectionStateVerifier | null | undefined;
  readonly demandSet?: WallSystemDemandSet | null | undefined;
  readonly context: WallSystemVerificationContext;
}

export interface WallSystemVerificationResult {
  readonly wallId?: string;
  readonly status: "not-implemented" | "ok" | "not-verified" | "failed";
  readonly complete: boolean;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly checks: readonly RcCheck[];
  readonly [key: string]: unknown;
}

interface WallStateAssessment extends Record<string, unknown> {
  readonly wallId: string;
  readonly sectionCutId: string;
  readonly reference: unknown;
  readonly complete: boolean;
  readonly status: "not-implemented" | "ok" | "not-verified" | "failed";
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly checks: readonly StrictRcCheck[];
  readonly outputs?: unknown;
}

function isCheck(value: unknown): value is RcCheck {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCheckArray(value: unknown): value is readonly RcCheck[] {
  return Array.isArray(value);
}

function isCouplingBeamInputArray(value: unknown): value is readonly CouplingBeamAssessmentInput[] {
  return Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function strictCheck(
  value: RcCheck,
  id: string,
  metadata: Record<string, unknown>,
): StrictRcCheck | null {
  if (typeof value.ok !== "boolean") return null;
  return {
    ...value,
    id: typeof value.id === "string" ? value.id : id,
    ok: value.ok,
    metadata: {
      ...(typeof value.metadata === "object" &&
      value.metadata !== null &&
      !Array.isArray(value.metadata)
        ? value.metadata
        : {}),
      ...metadata,
    },
  };
}

function normalizeStateAssessment({
  wall,
  state,
  outcome,
  behavior,
  dissipativeSectionCutIds,
}: {
  readonly wall: WallSystemMappedWall;
  readonly state: ResistanceSectionCutState;
  readonly outcome: WallSystemStateVerifierOutcome;
  readonly behavior: Ntc2018StructuralBehavior | null;
  readonly dissipativeSectionCutIds: readonly string[];
}): WallStateAssessment {
  const dissipative = behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const inDissipativeZone = dissipative && dissipativeSectionCutIds.includes(state.sectionCutId);
  const required = [
    "flexure",
    "shear",
    ...(dissipative ? ["axialCompression"] : []),
    ...(inDissipativeZone ? ["ductility"] : []),
  ];
  const missing = required.filter(
    (name) => !isCheck(outcome[name]) || typeof outcome[name].ok !== "boolean",
  );
  const checks = required
    .filter((name) => !missing.includes(name))
    .map((name) => {
      const candidate = outcome[name];
      return isCheck(candidate)
        ? strictCheck(candidate, `wall-${name}-${wall.id}-${state.sectionCutId}`, {
            wallId: wall.id,
            sectionCutId: state.sectionCutId,
            reference: state.reference,
          })
        : null;
    })
    .filter((item): item is StrictRcCheck => item !== null);
  return {
    wallId: wall.id,
    sectionCutId: state.sectionCutId,
    reference: state.reference,
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

function requiredWallSystemChecks({
  data,
  behavior,
  context,
}: {
  readonly data: WallSystemData;
  readonly behavior: Ntc2018StructuralBehavior | null;
  readonly context: WallSystemVerificationContext;
}): string[] {
  const allowedTypes = ["wall", "mixed", "coupled-wall", "weakly-reinforced"];
  if (!allowedTypes.includes(data.systemType)) {
    throw new Error(`systemType must be one of ${allowedTypes.join(", ")}.`);
  }
  if (typeof data.redistributionApplied !== "boolean") {
    throw new Error("redistributionApplied must be boolean.");
  }
  if (!isCheckArray(data.additionalChecks)) {
    throw new Error("additionalChecks must be an array.");
  }
  const dissipative = behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
  const required = [
    ...(dissipative
      ? ["wall-moment-envelope", "wall-shear-amplification", "wall-boundary-detailing"]
      : []),
    ...(data.systemType === "mixed" ? ["wall-mixed-system-shear-envelope"] : []),
    ...(data.systemType === "weakly-reinforced"
      ? ["wall-weakly-reinforced-shear-amplification", "wall-out-of-plane-stability"]
      : []),
    ...(data.systemType === "weakly-reinforced" && context.q != null && context.q > 2
      ? ["wall-weakly-reinforced-axial-dynamic"]
      : []),
    ...(data.redistributionApplied ? ["wall-seismic-demand-redistribution"] : []),
  ];
  const supplied = new Map(
    data.additionalChecks
      .filter((item): item is RcCheck & { id: string } => typeof item.id === "string")
      .map((item) => [item.id, item] as const),
  );
  const missing = required.filter((id) => typeof supplied.get(id)?.ok !== "boolean");
  if (
    data.additionalChecks.some(
      (item) => typeof item.id !== "string" || typeof item.ok !== "boolean",
    )
  ) {
    missing.push("valid-additional-checks");
  }
  return [...new Set(missing)];
}

/**
 * Run wall-height verification over every mapped section cut and every
 * concurrent FEM state. The injected section verifier supplies chapter-4
 * capacities; this orchestrator owns completeness and chapter-7 aggregation.
 */
export function runWallSystemVerifications({
  walls,
  wallSystemData,
  wallSectionStateVerifier,
  demandSet,
  context,
}: WallSystemVerificationInput): WallSystemVerificationResult[] {
  const results: WallSystemVerificationResult[] = [];
  for (const wall of walls ?? []) {
    const data = wallSystemData?.[wall.id];
    if (data == null || typeof wallSectionStateVerifier !== "function") {
      results.push({
        wallId: wall.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [
          ...(data == null ? [`wallSystemData.${wall.id}`] : []),
          ...(typeof wallSectionStateVerifier !== "function" ? ["wallSectionStateVerifier"] : []),
        ],
        checks: [],
      });
      continue;
    }
    if (!isCouplingBeamInputArray(data.couplingBeamInputs)) {
      results.push({
        wallId: wall.id,
        status: "not-implemented",
        complete: false,
        ok: false,
        missing: [`wallSystemData.${wall.id}.couplingBeamInputs`],
        checks: [],
      });
      continue;
    }

    try {
      const sourceStates = collectConcurrentSectionCutStates({
        sectionCutIds: wall.sectionCutIds,
        ...(demandSet?.globalResponses === undefined
          ? {}
          : { globalResponses: demandSet.globalResponses }),
      });
      const states = projectWallSectionCutStatesToResistanceAxes({
        wall,
        states: sourceStates,
      });
      const dissipativeSectionCutIds = data.dissipativeSectionCutIds ?? [];
      if (!Array.isArray(dissipativeSectionCutIds)) {
        throw new Error("dissipativeSectionCutIds must be an array.");
      }
      const dissipative = context.behavior !== NTC2018_STRUCTURAL_BEHAVIOR.NON_DISSIPATIVE;
      const missingSystemChecks = requiredWallSystemChecks({
        data,
        behavior: context.behavior,
        context,
      });
      if (dissipative && dissipativeSectionCutIds.length === 0) {
        missingSystemChecks.push("dissipativeSectionCutIds");
      }
      if (data.systemType === "coupled-wall" && data.couplingBeamInputs.length === 0) {
        missingSystemChecks.push("couplingBeamInputs");
      }
      if (missingSystemChecks.length > 0) {
        results.push({
          wallId: wall.id,
          status: "not-implemented",
          complete: false,
          ok: false,
          missing: [...new Set(missingSystemChecks)],
          checks: data.additionalChecks,
          sourceStateCount: sourceStates.length,
          resistanceStateCount: states.length,
        });
        continue;
      }
      const stateAssessments = states.map((state) => {
        try {
          const outcome = wallSectionStateVerifier({
            wall,
            data,
            state,
            context,
          });
          return normalizeStateAssessment({
            wall,
            state,
            outcome,
            behavior: context.behavior,
            dissipativeSectionCutIds,
          });
        } catch (error) {
          return {
            wallId: wall.id,
            sectionCutId: state.sectionCutId,
            reference: state.reference,
            complete: false,
            status: "failed",
            ok: false,
            missing: [],
            reason: errorMessage(error),
            checks: [],
          };
        }
      });
      const couplingBeamAssessments = data.couplingBeamInputs.map((input) =>
        createCouplingBeamAssessment(input),
      );
      const diagonalRequired = couplingBeamAssessments.some(
        (item) => item.procedure === "diagonal-X",
      );
      const detailingAssessment =
        data.detailingInput == null
          ? null
          : verifyWallGeneralDetailing({
              ...data.detailingInput,
              diagonalCouplingReinforcementRequired: diagonalRequired,
            });
      const assessment = createWallHeightSystemAssessment({
        wallId: wall.id,
        expectedSectionCutIds: wall.sectionCutIds,
        sectionStateAssessments: stateAssessments,
        detailingAssessment,
        couplingBeamAssessments,
        additionalChecks: data.additionalChecks,
      });
      results.push({
        ...assessment,
        wallId: wall.id,
        sourceStateCount: sourceStates.length,
        resistanceStateCount: states.length,
      });
    } catch (error) {
      results.push({
        wallId: wall.id,
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
