import {
  RCBiaxialDomainBuilder,
  type BiaxialCompressedSide,
} from "../reinforced-concrete-sections/analysis/RCBiaxialDomainBuilder.js";
import { SectionFiberDiscretizer } from "../reinforced-concrete-sections/analysis/SectionFiberDiscretizer.js";
import { ConcreteParabolaRectangleLaw } from "../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import { SteelElasticPerfectlyPlasticLaw } from "../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";
import type { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import { rayPolygonCapacity } from "../../domain/math/rayPolygonCapacity.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";

export const WALL_BIAXIAL_REFERENCE =
  "NTC 2018 § 4.1.2.3.9, § 7.4.4.5.1 (Presso-flessione biassiale)";

function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive; got ${String(value)}.`);
  }
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite; got ${String(value)}.`);
  }
  return value;
}

function integerAtLeast(value: unknown, minimum: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}; got ${String(value)}.`);
  }
  return value;
}

export interface WallBiaxialBendingInput {
  section?: ReinforcedConcreteSection | null;
  axialForce?: number;
  momentX?: number;
  momentY?: number;
  concreteDesignStrength?: number;
  reinforcementDesignStrength?: number;
  concreteEc2?: number;
  concreteEcu?: number;
  steelElasticModulus?: number;
  steelUltimateStrain?: number;
  targetFiberCount?: number;
  angleCount?: number;
  compressedSide?: BiaxialCompressedSide;
}

export function verifyWallBiaxialBending({
  section,
  axialForce,
  momentX,
  momentY,
  concreteDesignStrength,
  reinforcementDesignStrength,
  concreteEc2 = 0.002,
  concreteEcu = 0.0035,
  steelElasticModulus = 200000,
  steelUltimateStrain = 0.01,
  targetFiberCount = 400,
  angleCount = 64,
  compressedSide = "positive",
}: WallBiaxialBendingInput = {}) {
  if (section == null) {
    throw new Error("section is required for wall biaxial verification.");
  }
  const nEd = finite(axialForce, "axialForce");
  const mxEd = finite(momentX, "momentX");
  const myEd = finite(momentY, "momentY");
  const fcd = positive(concreteDesignStrength, "concreteDesignStrength");
  const fyd = positive(reinforcementDesignStrength, "reinforcementDesignStrength");
  const resolvedFiberCount = integerAtLeast(targetFiberCount, 1, "targetFiberCount");
  const resolvedAngleCount = integerAtLeast(angleCount, 4, "angleCount");
  const demand = Math.hypot(mxEd, myEd);
  const theta = demand > 0 ? Math.atan2(myEd, mxEd) : null;

  const concreteFibers = new SectionFiberDiscretizer().discretize(section, {
    targetCount: resolvedFiberCount,
  }).fibers;
  const concreteLaw = new ConcreteParabolaRectangleLaw({
    fcd,
    ec2: concreteEc2,
    ecu: concreteEcu,
  });
  const steelLaw = new SteelElasticPerfectlyPlasticLaw({
    Es: steelElasticModulus,
    fyd,
    esu: steelUltimateStrain,
  });
  const domain = new RCBiaxialDomainBuilder().buildAtAxialLoad({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    nEd,
    angleCount: resolvedAngleCount,
    compressedSide,
  });
  const converged = domain.points.every(
    (point) =>
      point.converged === true &&
      Number.isFinite(point.MxRd) &&
      Number.isFinite(point.MyRd) &&
      Number.isFinite(point.axialResidual),
  );
  const maximumAbsoluteAxialResidual = Math.max(
    ...domain.points.map((point) => Math.abs(point.axialResidual)).filter(Number.isFinite),
    0,
  );
  const rayCapacity = rayPolygonCapacity(
    domain.points.map((point) => ({
      x: point.MxRd,
      y: point.MyRd,
    })),
    mxEd,
    myEd,
  );
  const capacity = Number.isFinite(rayCapacity.capacityNorm) ? rayCapacity.capacityNorm : null;
  const utilizationRatio = Number.isFinite(rayCapacity.utilizationRatio)
    ? rayCapacity.utilizationRatio
    : null;
  const ok = converged && utilizationRatio != null && utilizationRatio <= 1;
  return {
    ok,
    utilizationRatio,
    demand,
    capacity,
    theta,
    axialResidual: maximumAbsoluteAxialResidual,
    converged,
    angleCount: resolvedAngleCount,
    intersection:
      rayCapacity.intersection == null
        ? null
        : {
            momentX: rayCapacity.intersection.x,
            momentY: rayCapacity.intersection.y,
            segmentIndex: rayCapacity.intersection.segmentIndex,
            segmentParameter: rayCapacity.intersection.segmentParameter,
          },
    check: "wall-biaxial-bending",
    reference: WALL_BIAXIAL_REFERENCE,
    metadata: withNormativeReferences({}, [
      NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce,
      NTC2018_RC_CHAPTER_7_4_REFERENCES.wall,
    ]),
  };
}
