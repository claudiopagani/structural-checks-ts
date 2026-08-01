import {
  VerificationResult,
  type VerificationCheck,
} from "../../core/results/VerificationResult.js";
import { governingCheck, isFinitePositive, round } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { rayPolygonCapacity } from "../../domain/math/rayPolygonCapacity.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";
import { selectNTC2018OverstrengthFactors } from "../../norms/ntc2018/reinforced-concrete/structuralBehavior.js";
import { ReinforcedConcreteSectionVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";
import type { RcShearVerificationData } from "../reinforced-concrete-sections/checks/shear/types.js";
import { ReinforcedConcreteSectionModel } from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import { ReinforcedConcreteColumnDetailingVerification } from "./ReinforcedConcreteColumnDetailingVerification.js";
import type { ReinforcedConcreteColumnModel } from "./ReinforcedConcreteColumnModel.js";
import type { ReinforcedConcreteColumnVerificationOptions } from "./types.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" } as const);
const EPS = 1e-9;

interface ColumnMemberCheck extends VerificationCheck {
  id: string;
  description: string;
  demand: number | null;
  capacity: number | null;
  utilizationRatio: number | null;
  ok: boolean;
  metadata: Record<string, unknown>;
}

interface ResolvedColumnAxis {
  id: "mx" | "my";
  inertia: number | null;
  effectiveLength: number;
  radiusOfGyration: number | null;
  slenderness: number | null;
  lambdaLimit: number;
  slendernessRatio: number;
  secondOrderRequired: boolean;
  secondOrderIncluded: boolean;
  firstOrderMoment: number;
  firstOrderWithImperfection: number;
  imperfectionEccentricity: number;
  nominalRigidity: number | null;
  criticalLoad: number | null;
  magnificationFactor: number;
  stableForMagnification: boolean;
  generatedTotalMoment: number | null;
  totalMoment: number | null;
  designMoment: number;
  check: ColumnMemberCheck;
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function seismicBehavior(ductilityClass: string | null | undefined): "cd-a" | "cd-b" {
  const normalized = String(ductilityClass ?? "")
    .toUpperCase()
    .replaceAll('"', "")
    .replaceAll("-", "");
  if (normalized === "CDA" || normalized === "A") return "cd-a";
  if (normalized === "CDB" || normalized === "B") return "cd-b";
  throw new Error(`Unsupported NTC 2018 ductility class: ${ductilityClass ?? ""}.`);
}

function compressionFrom(nEd: number, convention: string): number {
  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative" || convention === "tension-positive") {
    return Math.max(-nEd, 0);
  }

  throw new Error(`Unsupported compression sign convention: ${convention}.`);
}

function resolveAxis({
  id,
  inertia,
  concreteArea,
  effectiveLength,
  firstOrderMoment,
  totalMoment,
  secondOrderFlag,
  compression,
  lambdaLimit,
  nominalRigidity,
  momentDistributionFactor,
  includeImperfectionWhenMomentIsZero,
  memberLength,
}: {
  id: "mx" | "my";
  inertia: number | null;
  concreteArea: number;
  effectiveLength: number;
  firstOrderMoment: number;
  totalMoment: number | null;
  secondOrderFlag: boolean;
  compression: number;
  lambdaLimit: number;
  nominalRigidity: number | null;
  momentDistributionFactor: number;
  includeImperfectionWhenMomentIsZero: boolean;
  memberLength: number;
}): ResolvedColumnAxis {
  const radiusOfGyration =
    isFinitePositive(inertia) && concreteArea > 0 ? Math.sqrt(inertia / concreteArea) : null;
  const slenderness = radiusOfGyration ? effectiveLength / radiusOfGyration : null;
  const secondOrderRequired =
    compression > 0 &&
    isFiniteNumber(slenderness) &&
    isFiniteNumber(lambdaLimit) &&
    slenderness > lambdaLimit;
  const explicitTotal = isFiniteNumber(totalMoment);
  const imperfectionEccentricity =
    includeImperfectionWhenMomentIsZero && compression > 0 && Math.abs(firstOrderMoment) <= EPS
      ? memberLength / 300
      : 0;
  const firstOrderWithImperfection =
    firstOrderMoment + (firstOrderMoment < 0 ? -1 : 1) * compression * imperfectionEccentricity;
  const criticalLoad = isFinitePositive(nominalRigidity)
    ? (Math.PI ** 2 * nominalRigidity) / effectiveLength ** 2
    : null;
  const stableForMagnification = isFiniteNumber(criticalLoad) && criticalLoad > compression;
  const magnificationFactor =
    secondOrderRequired && stableForMagnification
      ? 1 + momentDistributionFactor / (criticalLoad / compression - 1)
      : 1;
  const generatedTotalMoment =
    secondOrderRequired && stableForMagnification
      ? firstOrderWithImperfection * magnificationFactor
      : null;
  const secondOrderIncluded =
    !secondOrderRequired ||
    explicitTotal ||
    secondOrderFlag === true ||
    isFiniteNumber(generatedTotalMoment);
  const designMoment = explicitTotal
    ? totalMoment
    : isFiniteNumber(generatedTotalMoment)
      ? generatedTotalMoment
      : firstOrderWithImperfection;
  const ratio =
    isFiniteNumber(slenderness) && isFiniteNumber(lambdaLimit) && lambdaLimit > 0
      ? slenderness / lambdaLimit
      : 0;

  return {
    id,
    inertia,
    effectiveLength,
    radiusOfGyration,
    slenderness,
    lambdaLimit,
    slendernessRatio: ratio,
    secondOrderRequired,
    secondOrderIncluded,
    firstOrderMoment,
    firstOrderWithImperfection,
    imperfectionEccentricity,
    nominalRigidity,
    criticalLoad,
    magnificationFactor,
    stableForMagnification,
    generatedTotalMoment,
    totalMoment: explicitTotal ? totalMoment : null,
    designMoment,
    check: {
      id: `rc-column-second-order-${id}`,
      description: `Second-order treatment for column ${id} bending component`,
      demand: round(slenderness),
      capacity: round(lambdaLimit),
      utilizationRatio: round(ratio),
      ok: secondOrderIncluded,
      metadata: withNormativeReferences(
        {
          reference: "NTC2018-4.1.41-4.1.42",
          screeningExceeded: secondOrderRequired,
          secondOrderIncluded,
          momentSource: explicitTotal
            ? "explicit-total"
            : isFiniteNumber(generatedTotalMoment)
              ? "generated-ntc2018-nominal-stiffness"
              : secondOrderFlag === true
                ? "input-declared-inclusive"
                : "first-order-screened",
        },
        [
          NTC2018_RC_CHAPTER_4_REFERENCES.columnSlenderness,
          ...(isFiniteNumber(nominalRigidity)
            ? [NTC2018_RC_CHAPTER_4_REFERENCES.nominalStiffness]
            : []),
        ],
      ),
    },
  };
}

function asColumnMemberCheck(check: VerificationCheck): ColumnMemberCheck {
  return check as ColumnMemberCheck;
}

export class ReinforcedConcreteColumnVerification {
  code: string;
  metadata: Record<string, unknown>;

  constructor({
    code = "NTC2018",
    metadata = {},
  }: ReinforcedConcreteColumnVerificationOptions = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model: ReinforcedConcreteColumnModel | null | undefined): VerificationResult {
    if (!model?.section || !model.concreteMaterial) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC column verification requires a section and concrete material.",
        warnings: ["Column verification was not run because required inputs are missing."],
        metadata: { code: this.code, ...this.metadata },
      });
    }

    const concreteSection = model.section.concreteSection ?? model.section;
    const concreteArea = concreteSection.area;
    const fcd = model.concreteMaterial.fcd;

    if (!isFinitePositive(concreteArea) || !isFinitePositive(fcd)) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "RC column stability parameters are incomplete.",
        warnings: ["A positive concrete area and design concrete strength fcd are required."],
        metadata: {
          code: this.code,
          missingParameters: ["concreteArea", "fcd"],
          ...this.metadata,
        },
      });
    }

    const compression = compressionFrom(
      model.actions.nEd,
      model.stability.compressionSignConvention,
    );
    // NTC 2018 § 4.1.2.3.9.2, formulas [4.1.41]-[4.1.43].
    const normalizedAxialForce = compression / (concreteArea * fcd);
    const lambdaLimit =
      normalizedAxialForce > 0 ? 25 / Math.sqrt(normalizedAxialForce) : Number.POSITIVE_INFINITY;
    const creepCoefficient = model.stability.creepCoefficient;
    const gammaCE = model.stability.gammaCE ?? 1.2;
    const concreteElasticModulus = model.concreteMaterial.elasticModulus;
    const concreteDesignModulus = isFinitePositive(concreteElasticModulus)
      ? concreteElasticModulus / gammaCE
      : null;
    // NTC 2018 § 4.1.2.3.9.3, formula [4.1.44].
    const rigidityFactor =
      isFiniteNumber(creepCoefficient) && creepCoefficient >= 0
        ? 0.3 / (1 + 0.5 * creepCoefficient)
        : null;
    const nominalRigidityFor = (inertia: number | null): number | null =>
      model.stability.secondOrderMethod === "ntc2018-nominal-stiffness" &&
      isFiniteNumber(rigidityFactor) &&
      isFiniteNumber(concreteDesignModulus) &&
      isFinitePositive(inertia)
        ? rigidityFactor * concreteDesignModulus * inertia
        : null;
    const sharedSecondOrderFlag = model.stability.designMomentsIncludeSecondOrder === true;
    const axisMx = resolveAxis({
      id: "mx",
      inertia: concreteSection.inertiaY,
      concreteArea,
      effectiveLength: model.stability.effectiveLengthMx,
      firstOrderMoment: model.actions.mxEd,
      totalMoment: model.actions.mxEdTotal,
      secondOrderFlag: model.stability.mxIncludesSecondOrder ?? sharedSecondOrderFlag,
      compression,
      lambdaLimit,
      nominalRigidity: nominalRigidityFor(concreteSection.inertiaY),
      momentDistributionFactor: model.stability.momentDistributionFactor,
      includeImperfectionWhenMomentIsZero: model.stability.includeImperfectionWhenMomentIsZero,
      memberLength: model.length,
    });
    const axisMy = resolveAxis({
      id: "my",
      inertia: concreteSection.inertiaZ,
      concreteArea,
      effectiveLength: model.stability.effectiveLengthMy,
      firstOrderMoment: model.actions.myEd,
      totalMoment: model.actions.myEdTotal,
      secondOrderFlag: model.stability.myIncludesSecondOrder ?? sharedSecondOrderFlag,
      compression,
      lambdaLimit,
      nominalRigidity: nominalRigidityFor(concreteSection.inertiaZ),
      momentDistributionFactor: model.stability.momentDistributionFactor,
      includeImperfectionWhenMomentIsZero: model.stability.includeImperfectionWhenMomentIsZero,
      memberLength: model.length,
    });
    const axes = [axisMx, axisMy];
    const unresolvedAxes = axes.filter(
      (axis) => axis.secondOrderRequired && !axis.secondOrderIncluded,
    );
    const baseOutputs = {
      columnId: model.id,
      nEd: round(model.actions.nEd),
      compression: round(compression),
      concreteArea: round(concreteArea),
      fcd: round(fcd),
      normalizedAxialForce: round(normalizedAxialForce, 9),
      lambdaLimit: round(lambdaLimit),
      secondOrder: {
        method: model.stability.secondOrderMethod,
        creepCoefficient,
        gammaCE,
        concreteDesignModulus: round(concreteDesignModulus),
        rigidityFactor: round(rigidityFactor),
      },
      axes: Object.fromEntries(
        axes.map((axis) => [
          axis.id,
          {
            inertia: round(axis.inertia),
            effectiveLength: round(axis.effectiveLength),
            radiusOfGyration: round(axis.radiusOfGyration),
            slenderness: round(axis.slenderness),
            slendernessRatio: round(axis.slendernessRatio),
            secondOrderRequired: axis.secondOrderRequired,
            secondOrderIncluded: axis.secondOrderIncluded,
            firstOrderMoment: round(axis.firstOrderMoment),
            firstOrderWithImperfection: round(axis.firstOrderWithImperfection),
            imperfectionEccentricity: round(axis.imperfectionEccentricity),
            nominalRigidity: round(axis.nominalRigidity),
            criticalLoad: round(axis.criticalLoad),
            magnificationFactor: round(axis.magnificationFactor),
            stableForMagnification: axis.stableForMagnification,
            generatedTotalMoment: round(axis.generatedTotalMoment),
            totalMoment: round(axis.totalMoment),
            designMoment: round(axis.designMoment),
            secondOrderMethod: axis.secondOrderRequired ? model.stability.secondOrderMethod : null,
          },
        ]),
      ),
    };

    if (unresolvedAxes.length > 0) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-columns",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "RC column is slender and requires design moments including second-order effects.",
        checks: axes.map((axis) => axis.check),
        outputs: baseOutputs,
        warnings: [
          `Second-order moments are missing for: ${unresolvedAxes.map((axis) => axis.id).join(", ")}.`,
          "Provide a non-negative stability.creepCoefficient to generate moments with the NTC 2018 nominal stiffness, or supply explicit total moments from an adequate analysis.",
        ],
        assumptions: [
          "The NTC 2018 single-column slenderness screening is applied independently to the two section bending components.",
        ],
        metadata: withNormativeReferences(
          {
            code: this.code,
            method: "ntc2018-4.1.2.3.9.2-screening-and-4.1.44",
            unresolvedAxes: unresolvedAxes.map((axis) => axis.id),
            ...this.metadata,
          },
          [
            NTC2018_RC_CHAPTER_4_REFERENCES.columnSlenderness,
            NTC2018_RC_CHAPTER_4_REFERENCES.nominalStiffness,
          ],
        ),
      });
    }

    const sectionModel = new ReinforcedConcreteSectionModel({
      id: `${model.id}-design-section`,
      section: model.section,
      materials: {
        concreteMaterial: model.concreteMaterial,
        ...(model.reinforcementMaterial
          ? { reinforcementMaterial: model.reinforcementMaterial }
          : {}),
      },
      analysisType: "uls-biaxial-domain",
      analysisSettings: {
        angleCount: model.stability.biaxialAngleCount ?? 64,
      },
      mesh: model.mesh,
      solver: model.solver,
      actions: {
        nEd: model.actions.nEd,
        mxEd: axisMx.designMoment,
        myEd: axisMy.designMoment,
      },
      units: INTERNAL_UNITS,
      metadata: {
        sourceColumnId: model.id,
      },
    });
    const sectionResult = new ReinforcedConcreteSectionVerification({
      code: this.code,
    }).verify(sectionModel);
    const sectionPoints =
      (sectionResult.outputs.points as { MxRd: number; MyRd: number }[] | undefined) ?? [];
    const capacity = rayPolygonCapacity(
      sectionPoints.map((point) => ({
        x: point.MxRd,
        y: point.MyRd,
      })),
      axisMx.designMoment,
      axisMy.designMoment,
    );
    const resistanceCheck: ColumnMemberCheck = {
      id: "rc-column-biaxial-resistance",
      description: "Column biaxial bending resistance at the assigned axial force",
      demand: round(capacity.demandNorm),
      capacity: round(capacity.capacityNorm),
      utilizationRatio: round(capacity.utilizationRatio),
      ok:
        sectionResult.status === RESULT_STATUS.OK &&
        isFiniteNumber(capacity.utilizationRatio) &&
        capacity.utilizationRatio <= 1,
      metadata: withNormativeReferences(
        {
          method: "fiber-domain-ray-intersection",
          mxEd: round(axisMx.designMoment),
          myEd: round(axisMy.designMoment),
          intersection: capacity.intersection
            ? {
                mxRd: round(capacity.intersection.x),
                myRd: round(capacity.intersection.y),
                segmentIndex: capacity.intersection.segmentIndex,
              }
            : null,
        },
        [NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce],
      ),
    };
    const capacityDesign = model.shear?.capacityDesign;
    const seismicGammaRd = model.detailing?.seismic?.enabled
      ? selectNTC2018OverstrengthFactors({
          behavior: seismicBehavior(model.detailing.seismic.ductilityClass),
        }).columnShear
      : 1;
    const shearResults: Record<string, RcShearVerificationData> = {};
    const shearAxes = [
      ["x", model.shear?.x, model.actions.vxEd, axisMx.designMoment],
      ["y", model.shear?.y, model.actions.vyEd, axisMy.designMoment],
    ] as const;

    for (const [axisId, shear, action, moment] of shearAxes) {
      if (!shear) continue;
      const endMoments = capacityDesign?.[axisId === "x" ? "endMomentsX" : "endMomentsY"] ?? [];
      const capacityDesignShear =
        endMoments.length > 0 && capacityDesign
          ? (seismicGammaRd * endMoments.reduce((sum, value) => sum + Math.abs(value), 0)) /
            capacityDesign.clearLength
          : 0;
      const analysisShear = Math.abs(shear.vEd ?? action ?? 0);
      const vEd = Math.max(analysisShear, capacityDesignShear);
      const result = new ReinforcedConcreteShearVerification({
        code: this.code,
      }).verifySectionActions({
        nEd: model.actions.nEd,
        vEd,
        mEd: moment,
        section: model.section,
        concreteMaterial: model.concreteMaterial,
        reinforcementMaterial: model.reinforcementMaterial ?? null,
        shear,
        units: INTERNAL_UNITS,
      });
      result.checks = result.checks.map((rawCheck) => {
        const check = asColumnMemberCheck(rawCheck);
        const checkMetadata = check.metadata ?? {};
        return {
          ...check,
          id: `${check.id}-${axisId}`,
          metadata: withNormativeReferences(
            {
              ...checkMetadata,
              axis: axisId,
              analysisShear: round(analysisShear),
              capacityDesignShear: round(capacityDesignShear),
              gammaRd: seismicGammaRd,
              reference: capacityDesignShear > 0 ? "NTC2018-7.4.5" : checkMetadata.reference,
            },
            capacityDesignShear > 0 ? [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign] : [],
          ),
        };
      });
      shearResults[axisId] = result;
    }

    const detailingResult = model.detailing
      ? new ReinforcedConcreteColumnDetailingVerification({
          code: this.code,
        }).verify({ model, compression, normalizedAxialForce })
      : null;
    const checks: ColumnMemberCheck[] = [
      ...axes.map((axis) => axis.check),
      resistanceCheck,
      ...Object.values(shearResults).flatMap((result) => result.checks.map(asColumnMemberCheck)),
      ...(detailingResult?.checks.map(asColumnMemberCheck) ?? []),
    ];
    const governing = governingCheck(checks);
    const componentStatuses = [
      sectionResult.status,
      ...Object.values(shearResults).map((result) => result.status),
      ...(detailingResult ? [detailingResult.status] : []),
    ];
    const ok =
      checks.every((check) => check.ok === true) &&
      componentStatuses.every((status) => status === RESULT_STATUS.OK);

    return new VerificationResult({
      applicationId: "reinforced-concrete-columns",
      status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "RC column NTC 2018 slenderness screening and biaxial section resistance verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        ...baseOutputs,
        designActions: {
          nEd: round(model.actions.nEd),
          mxEd: round(axisMx.designMoment),
          myEd: round(axisMy.designMoment),
        },
        sectionResult: sectionResult.toJSON(),
        shear: Object.fromEntries(
          Object.entries(shearResults).map(([axis, result]) => [axis, result]),
        ),
        detailing: detailingResult?.toJSON() ?? null,
      },
      warnings: [
        ...sectionResult.warnings,
        ...Object.values(shearResults).flatMap((result) => result.warnings),
        ...(detailingResult?.warnings ?? []),
        ...(!model.shear
          ? ["Column shear was not checked because no shear contract was supplied."]
          : []),
        ...(!model.detailing
          ? [
              "Column reinforcement, confinement and ductility were not checked because no detailing contract was supplied.",
            ]
          : []),
      ],
      assumptions: [
        ...sectionResult.assumptions,
        ...Object.values(shearResults).flatMap((result) => result.assumptions),
        ...(detailingResult?.assumptions ?? []),
        ...(capacityDesign
          ? [
              "The two capacity-design end moments for each checked axis are explicitly declared as already reduced by the beam/column hierarchy ratios at the corresponding joints, as required before applying Eq. [7.4.5].",
            ]
          : []),
        "Compression is negative by default; change stability.compressionSignConvention explicitly when required.",
        "mxEd is paired with concreteSection.inertiaY and myEd with concreteSection.inertiaZ, following the existing RC section action convention.",
        "Explicit total moments are assumed to include imperfections, cracking, creep and second-order effects; generated moments use the documented NTC nominal-stiffness isolated-member method.",
      ],
      metadata: withNormativeReferences(
        {
          code: this.code,
          method: "ntc2018-column-stability-resistance-shear-detailing",
          governingCheckId: governing?.id ?? null,
          ...this.metadata,
        },
        [
          NTC2018_RC_CHAPTER_4_REFERENCES.columnSlenderness,
          NTC2018_RC_CHAPTER_4_REFERENCES.nominalStiffness,
          NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce,
          ...(capacityDesign ? [NTC2018_RC_CHAPTER_7_4_REFERENCES.columnCapacityDesign] : []),
        ],
      ),
    });
  }
}
