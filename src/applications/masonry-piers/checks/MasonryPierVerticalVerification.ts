import { VerificationResult } from "../../../core/results/VerificationResult.js";
import { governingCheck, round, utilizationCheck } from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import type { VerificationCheck } from "../../../core/results/VerificationResult.js";
import { MasonryPierModel } from "../models/MasonryPierModel.js";

const PHI_ECCENTRICITY_VALUES = [0, 0.5, 1.0, 1.5, 2.0];
const PHI_SLENDERNESS_VALUES = [0, 5, 10, 15, 20];
const PHI_TABLE: ReadonlyArray<ReadonlyArray<number | null>> = [
  [1.0, 0.74, 0.59, 0.44, 0.33],
  [0.97, 0.71, 0.55, 0.39, 0.27],
  [0.86, 0.61, 0.45, 0.27, 0.16],
  [0.69, 0.48, 0.32, 0.17, null],
  [0.53, 0.36, 0.23, null, null],
];

interface MasonryPierVerticalVerificationOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}

interface MasonryPierVerticalVerificationInput {
  model?: MasonryPierModel | ConstructorParameters<typeof MasonryPierModel>[0] | null;
}

interface FiniteCheckInput {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  metadata?: Record<string, unknown>;
}

type MasonryPierCheck = VerificationCheck & {
  id: string;
  demand: number | null;
  capacity: number | null;
  utilizationRatio: number | null;
};

interface Interval {
  lowerIndex: number;
  upperIndex: number;
}

function isFiniteNumber(value: number | null): value is number {
  return Number.isFinite(value);
}

function resolveModel(
  input: MasonryPierModel | ConstructorParameters<typeof MasonryPierModel>[0],
): MasonryPierModel {
  return input instanceof MasonryPierModel ? input : new MasonryPierModel(input);
}

function finiteCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
}: FiniteCheckInput): MasonryPierCheck {
  const utilizationRatio =
    Number.isFinite(capacity) && capacity > 0 ? Math.abs(demand) / capacity : null;
  return {
    id,
    description,
    demand: round(Math.abs(demand)),
    capacity: round(capacity),
    utilizationRatio: round(utilizationRatio),
    ok:
      typeof utilizationRatio === "number" &&
      Number.isFinite(utilizationRatio) &&
      utilizationRatio <= 1,
    metadata,
  };
}

function locateInterval(
  values: readonly number[],
  target: number,
  { allowExtrapolation = false }: { allowExtrapolation?: boolean } = {},
): Interval | null {
  if (!Number.isFinite(target)) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) return null;

  if (target < first || target > last) {
    if (!allowExtrapolation) return null;
    if (target < first) return { lowerIndex: 0, upperIndex: 1 };
    return { lowerIndex: values.length - 2, upperIndex: values.length - 1 };
  }
  for (let index = 0; index < values.length - 1; index += 1) {
    const lower = values[index];
    const upper = values[index + 1];
    if (lower === undefined || upper === undefined) continue;
    if (target >= lower && target <= upper) {
      return { lowerIndex: index, upperIndex: index + 1 };
    }
  }
  return { lowerIndex: values.length - 2, upperIndex: values.length - 1 };
}

function interpolate1D(
  xValues: readonly number[],
  yValues: ReadonlyArray<number | null>,
  x: number,
  { allowExtrapolation = false }: { allowExtrapolation?: boolean } = {},
): number | null {
  const interval = locateInterval(xValues, x, { allowExtrapolation });
  if (!interval) return null;
  const x1 = xValues[interval.lowerIndex];
  const x2 = xValues[interval.upperIndex];
  if (x1 === undefined || x2 === undefined) return null;
  const y1 = yValues[interval.lowerIndex];
  const y2 = yValues[interval.upperIndex];
  if (
    typeof y1 !== "number" ||
    !Number.isFinite(y1) ||
    typeof y2 !== "number" ||
    !Number.isFinite(y2)
  ) {
    return null;
  }
  if (Math.abs(x2 - x1) <= 1e-12) return y1;
  const t = (x - x1) / (x2 - x1);
  return y1 + t * (y2 - y1);
}

function interpolatePhi(
  lambda: number,
  m: number,
  { allowExtrapolation = false }: { allowExtrapolation?: boolean } = {},
): number | null {
  const lambdaInterval = locateInterval(PHI_SLENDERNESS_VALUES, lambda, {
    allowExtrapolation,
  });
  if (!lambdaInterval) return null;
  const lambda1 = PHI_SLENDERNESS_VALUES[lambdaInterval.lowerIndex];
  const lambda2 = PHI_SLENDERNESS_VALUES[lambdaInterval.upperIndex];
  const row1 = PHI_TABLE[lambdaInterval.lowerIndex];
  const row2 = PHI_TABLE[lambdaInterval.upperIndex];
  if (lambda1 === undefined || lambda2 === undefined || row1 === undefined || row2 === undefined) {
    return null;
  }
  const phiAtLambda1 = interpolate1D(PHI_ECCENTRICITY_VALUES, row1, m, {
    allowExtrapolation,
  });
  const phiAtLambda2 = interpolate1D(PHI_ECCENTRICITY_VALUES, row2, m, {
    allowExtrapolation,
  });
  if (
    typeof phiAtLambda1 !== "number" ||
    !Number.isFinite(phiAtLambda1) ||
    typeof phiAtLambda2 !== "number" ||
    !Number.isFinite(phiAtLambda2)
  ) {
    return null;
  }
  if (Math.abs(lambda2 - lambda1) <= 1e-12) return phiAtLambda1;
  const t = (lambda - lambda1) / (lambda2 - lambda1);
  return phiAtLambda1 + t * (phiAtLambda2 - phiAtLambda1);
}

export class MasonryPierVerticalVerification {
  public code: string;
  public metadata: Record<string, unknown>;

  public constructor({
    code = "NTC2018",
    metadata = {},
  }: MasonryPierVerticalVerificationOptions = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  public verify({ model }: MasonryPierVerticalVerificationInput = {}): VerificationResult {
    const resolvedModel = resolveModel(model ?? {});
    const warnings: string[] = [];
    const assumptions = [
      "Vertical masonry-pier verification is solved from known section resultants; no standalone FEM analysis is required because no transverse distributed load is assumed along the member axis.",
      "Phi reduction factors are interpolated linearly from the articulated-wall tabulated values of NTC 2018 / Circolare 2019, with no extrapolation unless explicitly enabled.",
      "The in-plane reduction factor is evaluated with lambda = 0 and m = 6 e/L, consistently with the legacy workflow used in the reference MATLAB routine.",
    ];
    const gammaM = resolvedModel.resolvedGammaM();
    if (typeof gammaM !== "number" || !Number.isFinite(gammaM) || gammaM <= 0) {
      throw new Error(
        "MasonryPierVerticalVerification requires a positive design.gammaM (or material metadata gammaM).",
      );
    }
    const fm = resolvedModel.resolveMaterialProperty("fm");
    if (typeof fm !== "number" || !Number.isFinite(fm) || fm <= 0) {
      throw new Error(
        "MasonryPierVerticalVerification requires a masonry material with finite compressive strength fm.",
      );
    }
    const compressionForce = resolvedModel.compressiveAxialForce();
    if (!Number.isFinite(compressionForce) || compressionForce <= 0) {
      return new VerificationResult({
        applicationId: "masonry-piers",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary:
          "Masonry pier vertical verification could not be completed because the axial load is not compressive for the selected sign convention.",
        warnings: [
          "The current simplified masonry-pier compression workflow requires a strictly positive compressive axial force.",
        ],
        metadata: { code: this.code, modelId: resolvedModel.id, ...this.metadata },
      });
    }
    const rho = resolvedModel.resolvedLateralRestraintFactor();
    const h0 = rho * resolvedModel.geometry.height;
    const ea = resolvedModel.resolvedConstructionEccentricity();
    const ev = resolvedModel.actions.outOfPlaneMoment / compressionForce;
    const eLFromMoment = resolvedModel.actions.inPlaneMoment / compressionForce;
    const e1 = Math.abs(resolvedModel.actions.outOfPlaneVerticalLoadEccentricity) + ea;
    const e2 = e1 / 2 + Math.abs(ev);
    const eL =
      Math.abs(resolvedModel.actions.inPlaneVerticalLoadEccentricity) + Math.abs(eLFromMoment);
    const thickness = resolvedModel.geometry.thickness;
    const length = resolvedModel.geometry.length;
    const m1 = (6 * e1) / thickness;
    const m2 = (6 * e2) / thickness;
    const mL = (6 * eL) / length;
    const lambda = h0 / thickness;
    const phi1 = interpolatePhi(lambda, m1, {
      allowExtrapolation: resolvedModel.design.allowExtrapolation,
    });
    const phi2 = interpolatePhi(lambda, m2, {
      allowExtrapolation: resolvedModel.design.allowExtrapolation,
    });
    const phiL = interpolatePhi(0, mL, {
      allowExtrapolation: resolvedModel.design.allowExtrapolation,
    });
    const confidenceFactor = resolvedModel.resolvedConfidenceFactor();
    const fd = fm / gammaM / confidenceFactor;
    const unitWeight = resolvedModel.resolvedUnitWeight();
    const selfWeight =
      typeof unitWeight === "number" && Number.isFinite(unitWeight) && unitWeight > 0
        ? unitWeight * resolvedModel.geometry.length * resolvedModel.geometry.height * thickness
        : 0;
    if (typeof unitWeight !== "number" || !Number.isFinite(unitWeight) || unitWeight <= 0) {
      warnings.push(
        "Self-weight was set to zero because no finite masonry unit weight w was available on the model or material.",
      );
    }
    const preliminaryChecks: MasonryPierCheck[] = [
      finiteCheck({
        id: "masonry-pier-slenderness",
        description: "Conventional slenderness limit lambda <= 20",
        demand: lambda,
        capacity: 20,
        metadata: { lambda },
      }),
      finiteCheck({
        id: "masonry-pier-eccentricity-out-of-plane-1",
        description: "Out-of-plane eccentricity limit e1 <= t / 3",
        demand: e1,
        capacity: thickness / 3,
        metadata: { e1, thickness },
      }),
      finiteCheck({
        id: "masonry-pier-eccentricity-out-of-plane-2",
        description: "Out-of-plane eccentricity limit e2 <= t / 3",
        demand: e2,
        capacity: thickness / 3,
        metadata: { e2, thickness },
      }),
      finiteCheck({
        id: "masonry-pier-eccentricity-in-plane",
        description: "In-plane eccentricity limit eL <= L / 3",
        demand: eL,
        capacity: length / 3,
        metadata: { eL, length },
      }),
    ];
    if (!isFiniteNumber(phi1) || !isFiniteNumber(phi2) || !isFiniteNumber(phiL)) {
      warnings.push(
        "At least one Phi reduction factor could not be evaluated because lambda or m falls outside the tabulated admissible domain, or the corresponding cell is not defined.",
      );
    }
    const checks: MasonryPierCheck[] = [...preliminaryChecks];
    if (isFiniteNumber(phi1) && isFiniteNumber(phiL)) {
      const nEd1 = compressionForce + selfWeight;
      const fdrid1 = phi1 * phiL * fd;
      const nRd1 = fdrid1 * length * thickness;
      checks.push(
        utilizationCheck({
          id: "masonry-pier-compression-stage-1",
          description: "Vertical compression verification with full self-weight contribution",
          demand: nEd1,
          capacity: nRd1,
          metadata: {
            fd: round(fd),
            fdrid: round(fdrid1),
            phi: round(phi1),
            phiL: round(phiL),
            selfWeight: round(selfWeight),
            stage: 1,
          },
        }),
      );
    }
    if (isFiniteNumber(phi2) && isFiniteNumber(phiL)) {
      const nEd2 = compressionForce + selfWeight / 2;
      const fdrid2 = phi2 * phiL * fd;
      const nRd2 = fdrid2 * length * thickness;
      checks.push(
        utilizationCheck({
          id: "masonry-pier-compression-stage-2",
          description: "Vertical compression verification with half self-weight contribution",
          demand: nEd2,
          capacity: nRd2,
          metadata: {
            fd: round(fd),
            fdrid: round(fdrid2),
            phi: round(phi2),
            phiL: round(phiL),
            selfWeight: round(selfWeight),
            stage: 2,
          },
        }),
      );
    }
    const governing = governingCheck(checks);
    const hasCompressionCheck = checks.some(
      (check) =>
        check.id === "masonry-pier-compression-stage-1" ||
        check.id === "masonry-pier-compression-stage-2",
    );
    return new VerificationResult({
      applicationId: "masonry-piers",
      status:
        hasCompressionCheck && checks.every((check) => check.ok === true)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Vertical NTC 2018 verification of a masonry pier under axial load, eccentricities and in-plane bending moment.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        geometry: {
          ...resolvedModel.geometry,
          grossArea: round(resolvedModel.grossArea()),
          inPlaneInertia: round(resolvedModel.inPlaneInertia()),
        },
        material: {
          fm: round(fm),
          gammaM: round(gammaM),
          confidenceFactor: round(confidenceFactor),
          fd: round(fd),
          unitWeight: round(unitWeight),
        },
        eccentricities: {
          ea: round(ea),
          ev: round(ev),
          e1: round(e1),
          e2: round(e2),
          eL: round(eL),
          inPlaneMomentEccentricity: round(eLFromMoment),
          m1: round(m1),
          m2: round(m2),
          mL: round(mL),
        },
        stability: {
          rho: round(rho),
          h0: round(h0),
          lambda: round(lambda),
          phi1: round(phi1),
          phi2: round(phi2),
          phiL: round(phiL),
        },
        actions: {
          compressionForce: round(compressionForce),
          selfWeight: round(selfWeight),
          outOfPlaneMoment: round(resolvedModel.actions.outOfPlaneMoment),
          inPlaneMoment: round(resolvedModel.actions.inPlaneMoment),
        },
        governing:
          governing == null
            ? null
            : {
                id: governing.id,
                utilizationRatio: governing.utilizationRatio,
                demand: governing.demand,
                capacity: governing.capacity,
              },
      },
      warnings,
      assumptions,
      metadata: {
        code: this.code,
        modelId: resolvedModel.id,
        reductionTableScheme: resolvedModel.design.reductionTableScheme,
        ...this.metadata,
      },
    });
  }
}
