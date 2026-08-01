import {
  createRcServiceSectionSolverContext,
  solveRcServiceSectionState,
} from "../../reinforced-concrete-sections/shared/solveRcServiceSectionState.js";
import {
  DEFAULT_RC_SECTION_UNITS,
  isFinitePositive,
} from "../../reinforced-concrete-sections/shared/rcCommon.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import type { SectionState } from "../../reinforced-concrete-sections/analysis/types.js";
import type { RCServiceStressSolverOptions } from "../../reinforced-concrete-sections/analysis/RCServiceStressSolver.js";

function nowMilliseconds(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function numeric(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface CrackedTransformedProperties {
  centroid: number;
  inertia: number;
  reinforcementFirstMoment: number;
}

export function calculateCrackedTransformedProperties({
  section,
  state,
  modularRatio,
}: {
  section: ReinforcedConcreteSection;
  state: SectionState | null | undefined;
  modularRatio: number;
}): CrackedTransformedProperties | null {
  const concreteFibers = (state?.concrete?.fibers ?? []).filter(
    (fiber) => Math.abs(numeric(fiber.stress)) > 1e-12,
  );
  const bars = section.getReinforcementBars();
  const concreteArea = concreteFibers.reduce((sum, fiber) => sum + numeric(fiber.area), 0);
  const steelTransformedArea = bars.reduce((sum, bar) => sum + modularRatio * bar.area, 0);
  const totalArea = concreteArea + steelTransformedArea;

  if (!isFinitePositive(totalArea)) {
    return null;
  }

  const centroid =
    (concreteFibers.reduce((sum, fiber) => sum + numeric(fiber.area) * numeric(fiber.y), 0) +
      bars.reduce((sum, bar) => sum + modularRatio * bar.area * numeric(bar.y), 0)) /
    totalArea;
  const inertia =
    concreteFibers.reduce(
      (sum, fiber) => sum + numeric(fiber.area) * (numeric(fiber.y) - centroid) ** 2,
      0,
    ) +
    bars.reduce((sum, bar) => sum + modularRatio * bar.area * (numeric(bar.y) - centroid) ** 2, 0);
  const reinforcementFirstMoment = bars.reduce(
    (sum, bar) => sum + bar.area * (numeric(bar.y) - centroid),
    0,
  );

  return isFinitePositive(inertia) ? { centroid, inertia, reinforcementFirstMoment } : null;
}

export interface SectionMomentCurvatureCurveMeshOptions {
  targetFiberCount?: number;
}

export type SectionMomentCurvatureCurveSolverOptions = RCServiceStressSolverOptions;

export interface SectionMomentCurvatureState {
  m: number;
  kappa: number;
  kappaUncracked: number;
  kappaCracked: number;
  eiSec: number;
  zeta: number;
  cracked: boolean;
  converged: boolean;
  crackedSection?: CrackedTransformedProperties | null;
}

export interface SectionMomentCurvatureCurveOptions {
  section: ReinforcedConcreteSection;
  reinforcementMaterial: SteelMaterial;
  effectiveModularRatio: number;
  mesh?: SectionMomentCurvatureCurveMeshOptions;
  solver?: SectionMomentCurvatureCurveSolverOptions;
  mcr: number;
  mcrPositive?: number;
  mcrNegative?: number;
  grossInertia: number;
  concreteModulus: number;
  beta?: number;
  momentSamples?: number;
  maxMomentFactor?: number;
  initialMaxMoment?: number | null;
  axialForce?: number;
  units?: { force: "N" | "kN" | "MN"; length: "m" | "dm" | "cm" | "mm" } | null;
  symmetric?: boolean;
}

export interface SectionMomentCurvatureCurveMetrics {
  buildElapsedMs: number;
  sectionSolveCount: number;
  sectionSolveFailureCount: number;
  lookupCount: number;
  pointCountPerBranch: number;
  totalTablePointCount: number;
  maxAbsMoment: number;
}

export class SectionMomentCurvatureCurve {
  readonly units: NonNullable<SectionMomentCurvatureCurveOptions["units"]>;

  private readonly section: ReinforcedConcreteSection;
  private readonly reinforcementMaterial: SteelMaterial;
  private readonly effectiveModularRatio: number;
  private readonly meshOptions: { targetFiberCount: number };
  private readonly solverOptions: { tolerance: number; maxIterations: number };
  private readonly mcrPositive: number | null;
  private readonly mcrNegative: number | null;
  private readonly grossInertia: number;
  private readonly concreteModulus: number;
  private readonly beta: number;
  private readonly axialForce: number;
  private readonly symmetric: boolean;
  private positiveTable: SectionMomentCurvatureState[] = [];
  private negativeTable: SectionMomentCurvatureState[] = [];
  private maxAbsM = 0;
  private buildElapsedMs = 0;
  private sectionSolveCount = 0;
  private sectionSolveFailureCount = 0;
  private lookupCountInternal = 0;

  public constructor({
    section,
    reinforcementMaterial,
    effectiveModularRatio,
    mesh = {},
    solver = {},
    mcr,
    mcrPositive = mcr,
    mcrNegative = mcr,
    grossInertia,
    concreteModulus,
    beta = 1,
    momentSamples = 100,
    maxMomentFactor = 1.5,
    initialMaxMoment = null,
    axialForce = 0,
    units = null,
    symmetric = false,
  }: SectionMomentCurvatureCurveOptions) {
    if (!section) {
      throw new Error("SectionMomentCurvatureCurve requires a section.");
    }
    if (!isFinitePositive(effectiveModularRatio)) {
      throw new Error("SectionMomentCurvatureCurve requires a positive effectiveModularRatio.");
    }
    if (!isFinitePositive(grossInertia)) {
      throw new Error("SectionMomentCurvatureCurve requires a positive grossInertia.");
    }
    if (!isFinitePositive(concreteModulus)) {
      throw new Error("SectionMomentCurvatureCurve requires a positive concreteModulus.");
    }

    this.section = section;
    this.reinforcementMaterial = reinforcementMaterial;
    this.effectiveModularRatio = effectiveModularRatio;
    this.meshOptions = { targetFiberCount: mesh.targetFiberCount ?? 100 };
    this.solverOptions = {
      tolerance: solver.tolerance ?? 1e-2,
      maxIterations: solver.maxIterations ?? 50,
    };
    this.mcrPositive = isFinitePositive(mcrPositive) ? mcrPositive : null;
    this.mcrNegative = isFinitePositive(mcrNegative) ? mcrNegative : null;
    this.grossInertia = grossInertia;
    this.concreteModulus = concreteModulus;
    this.beta = beta;
    this.axialForce = Number.isFinite(axialForce) ? axialForce : 0;
    this.units = units ?? section.units ?? section.metadata.unitSystem ?? DEFAULT_RC_SECTION_UNITS;
    this.symmetric = symmetric;

    const buildStartedAt = nowMilliseconds();
    this.build({ momentSamples, maxMomentFactor, initialMaxMoment });
    this.buildElapsedMs = nowMilliseconds() - buildStartedAt;
  }

  public lookupEI(moment: number): number {
    return this.lookupState(moment).eiSec;
  }

  public lookupKappa(moment: number): number {
    return this.lookupState(moment).kappa;
  }

  public lookupState(moment: number): SectionMomentCurvatureState {
    this.lookupCountInternal += 1;
    return this.lookup(moment);
  }

  public get pointCount(): number {
    return Math.max(this.positiveTable.length, this.negativeTable.length);
  }

  public get maxAbsMoment(): number {
    return this.maxAbsM;
  }

  public get grossEI(): number {
    return this.grossEIValue;
  }

  public get lookupCount(): number {
    return this.lookupCountInternal;
  }

  public get metrics(): SectionMomentCurvatureCurveMetrics {
    return {
      buildElapsedMs: this.buildElapsedMs,
      sectionSolveCount: this.sectionSolveCount,
      sectionSolveFailureCount: this.sectionSolveFailureCount,
      lookupCount: this.lookupCountInternal,
      pointCountPerBranch: this.pointCount,
      totalTablePointCount: this.positiveTable.length + this.negativeTable.length,
      maxAbsMoment: this.maxAbsM,
    };
  }

  private get grossEIValue(): number {
    return this.concreteModulus * this.grossInertia;
  }

  private build({
    momentSamples,
    maxMomentFactor,
    initialMaxMoment,
  }: {
    momentSamples: number;
    maxMomentFactor: number;
    initialMaxMoment: number | null;
  }): void {
    const effectiveSampleCount = Math.max(10, momentSamples);
    const finiteThresholds = [this.mcrPositive, this.mcrNegative].filter(isFinitePositive);
    const firstCrackingThreshold =
      finiteThresholds.length > 0 ? Math.min(...finiteThresholds) : null;
    const maxM = isFinitePositive(initialMaxMoment)
      ? isFinitePositive(firstCrackingThreshold) && initialMaxMoment <= firstCrackingThreshold
        ? initialMaxMoment
        : initialMaxMoment * maxMomentFactor
      : null;

    const context = createRcServiceSectionSolverContext({
      section: this.section,
      reinforcementMaterial: this.reinforcementMaterial,
      mesh: this.meshOptions,
      solver: this.solverOptions,
      modularRatio: this.effectiveModularRatio,
    });
    const resolvedMaxM = maxM ?? this.estimateMaxMoment(context);
    const sampleMoments: number[] = [];

    for (let index = 0; index <= effectiveSampleCount; index += 1) {
      const t = index / effectiveSampleCount;
      sampleMoments.push(resolvedMaxM * Math.sqrt(t));
    }

    const roundedSampleMoments = sampleMoments.map((value) => Number(value.toPrecision(10)));
    const exactCrackingThresholds = [this.mcrPositive, this.mcrNegative].filter(
      (value): value is number => isFinitePositive(value) && value <= resolvedMaxM,
    );
    const unique = [...new Set([...roundedSampleMoments, ...exactCrackingThresholds])].sort(
      (left, right) => left - right,
    );

    this.positiveTable = unique.map((moment) => this.solvePoint(context, moment));
    this.negativeTable = this.symmetric
      ? this.positiveTable.map((entry) => ({
          ...entry,
          kappa: -entry.kappa,
          kappaUncracked: -entry.kappaUncracked,
          kappaCracked: -entry.kappaCracked,
        }))
      : unique.map((moment) => this.solvePoint(context, -moment));
    this.maxAbsM = resolvedMaxM;
  }

  private estimateMaxMoment(
    context: ReturnType<typeof createRcServiceSectionSolverContext>,
  ): number {
    const referenceMcr = Math.max(this.mcrPositive ?? 0, this.mcrNegative ?? 0);
    const guessedM = referenceMcr ? referenceMcr * 4 : this.grossEIValue * 0.01;
    const testM = Math.max(guessedM, referenceMcr ? referenceMcr * 3 : 1);
    const solved = this.solvePoint(context, testM);

    if (solved.converged) {
      return testM * 1.5;
    }

    return referenceMcr ? referenceMcr * 6 : this.grossEIValue * 0.005;
  }

  private solvePoint(
    context: ReturnType<typeof createRcServiceSectionSolverContext>,
    signedM: number,
  ): SectionMomentCurvatureState {
    const absM = Math.abs(signedM);
    const selectedMcr = signedM >= 0 ? this.mcrPositive : this.mcrNegative;

    if (absM === 0) {
      return {
        m: 0,
        kappa: 0,
        kappaUncracked: 0,
        kappaCracked: 0,
        eiSec: this.grossEIValue,
        zeta: 0,
        cracked: false,
        converged: true,
      };
    }

    const uncrackedKappa = signedM / this.grossEIValue;
    const isCracked = selectedMcr !== null && isFinitePositive(selectedMcr) && absM > selectedMcr;

    if (!isCracked) {
      return {
        m: absM,
        kappa: uncrackedKappa,
        kappaUncracked: uncrackedKappa,
        kappaCracked: uncrackedKappa,
        eiSec: this.grossEIValue,
        zeta: 0,
        cracked: false,
        converged: true,
      };
    }

    this.sectionSolveCount += 1;
    const result = solveRcServiceSectionState({
      section: this.section,
      reinforcementMaterial: this.reinforcementMaterial,
      concreteMesh: context.mesh,
      serviceSolver: context.serviceSolver,
      concreteLaw: context.concreteLaw,
      steelLaw: context.steelLaw,
      solver: this.solverOptions,
      modularRatio: this.effectiveModularRatio,
      actions: {
        nEd: this.axialForce,
        mxEd: signedM,
        myEd: 0,
      },
    });
    const solved = result.solved;

    if (!solved.converged) {
      this.sectionSolveFailureCount += 1;
    }

    const crackedKappa = solved.converged
      ? Math.sign(signedM || 1) * Math.abs(solved.strainField.kappaZ)
      : uncrackedKappa;
    const crackedProperties = solved.converged
      ? calculateCrackedTransformedProperties({
          section: this.section,
          state: solved.state,
          modularRatio: this.effectiveModularRatio,
        })
      : null;
    const zeta = isFinitePositive(selectedMcr)
      ? Math.max(0, 1 - this.beta * (selectedMcr / absM) ** 2)
      : 1;
    const meanKappa = zeta * crackedKappa + (1 - zeta) * uncrackedKappa;
    const rawEiSec =
      isFinitePositive(Math.abs(meanKappa)) &&
      (!isFinitePositive(selectedMcr) || absM / selectedMcr > 0.01)
        ? absM / Math.abs(meanKappa)
        : this.grossEIValue;
    const eiSec = Math.min(rawEiSec, this.grossEIValue);

    return {
      m: absM,
      kappa: meanKappa,
      kappaUncracked: uncrackedKappa,
      kappaCracked: crackedKappa,
      eiSec,
      zeta,
      cracked: true,
      converged: solved.converged,
      crackedSection: crackedProperties,
    };
  }

  private lookup(moment: number): SectionMomentCurvatureState {
    const absM = Math.abs(moment);
    const table = moment >= 0 ? this.positiveTable : this.negativeTable;
    const selectedMcr = moment >= 0 ? this.mcrPositive : this.mcrNegative;

    if (isFinitePositive(selectedMcr) && absM <= selectedMcr) {
      const kappa = moment / this.grossEIValue;
      return {
        m: absM,
        kappa,
        kappaUncracked: kappa,
        kappaCracked: kappa,
        eiSec: this.grossEIValue,
        zeta: 0,
        cracked: false,
        converged: true,
        crackedSection: null,
      };
    }

    const first = table[0];
    if (!first) {
      throw new Error("SectionMomentCurvatureCurve has no tabulated points.");
    }
    if (absM <= first.m) {
      return { ...first };
    }

    const last = table[table.length - 1];
    if (!last) {
      throw new Error("SectionMomentCurvatureCurve has no final tabulated point.");
    }
    if (absM >= last.m) {
      const direction = last.kappa >= 0 ? 1 : -1;
      return {
        ...last,
        m: absM,
        kappa: last.kappa + direction * ((absM - last.m) / last.eiSec),
        eiSec: last.eiSec,
      };
    }

    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      const candidate = table[mid];
      if (candidate && candidate.m <= absM) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const left = table[lo];
    const right = table[hi];
    if (!left || !right) {
      throw new Error("SectionMomentCurvatureCurve interpolation points are unavailable.");
    }
    const t = (absM - left.m) / (right.m - left.m);

    return {
      m: absM,
      kappa: left.kappa + t * (right.kappa - left.kappa),
      kappaUncracked: left.kappaUncracked + t * (right.kappaUncracked - left.kappaUncracked),
      kappaCracked: left.kappaCracked + t * (right.kappaCracked - left.kappaCracked),
      eiSec: left.eiSec + t * (right.eiSec - left.eiSec),
      zeta: left.zeta + t * (right.zeta - left.zeta),
      cracked: left.cracked || right.cracked,
      converged: left.converged && right.converged,
      crackedSection:
        left.crackedSection && right.crackedSection
          ? {
              centroid:
                left.crackedSection.centroid +
                t * (right.crackedSection.centroid - left.crackedSection.centroid),
              inertia:
                left.crackedSection.inertia +
                t * (right.crackedSection.inertia - left.crackedSection.inertia),
              reinforcementFirstMoment:
                left.crackedSection.reinforcementFirstMoment +
                t *
                  (right.crackedSection.reinforcementFirstMoment -
                    left.crackedSection.reinforcementFirstMoment),
            }
          : (left.crackedSection ?? right.crackedSection ?? null),
    };
  }
}
