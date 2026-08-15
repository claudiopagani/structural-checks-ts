import type {
  RigidBlock2D,
  RigidBlockInterface2D,
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "./types.js";
import { dot2d } from "./vector2d.js";

export interface RigidBlockFiniteDisplacement2D {
  readonly blockId: string;
  readonly translation: RigidBlockVector2D;
  readonly rotation: number;
}

export interface RigidBlockDeformableInterfaceLaw2D {
  readonly normal: {
    readonly elasticModulus: number;
    readonly characteristicLength: number;
    readonly compressiveStrength: number | null;
    /** Number of returned midpoint samples; it does not control mechanical integration. */
    readonly integrationPointCount: number;
    readonly postCrushingBehavior: "stop-at-onset" | "perfectly-plastic";
  };
  readonly tangential: {
    readonly shearModulus: number;
    readonly characteristicLength: number;
    readonly frictionCoefficient: number;
    readonly cohesion: number;
    readonly dilationAngle: number;
  };
}

export interface RigidBlockDeformableInterfaceState2D {
  /** Joint-resultant plastic slip; the tangential law has one global kinematic variable. */
  readonly plasticSlip: number;
  /** Irreversible normal closure at the returned integration points. */
  readonly plasticClosureByIntegrationPoint: readonly number[];
}

export interface RigidBlockDeformableInterfaceFiberResponse2D {
  readonly index: number;
  /** Coordinate from the joint midpoint, positive toward the extrados. */
  readonly coordinate: number;
  readonly area: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly currentPoint: RigidBlockPoint2D;
  /** Positive in opening and negative in closure. */
  readonly normalGap: number;
  readonly tangentialSlip: number;
  readonly compressionStress: number;
  /** Traction on the right-side body, positive toward the extrados joint axis. */
  readonly shearStress: number;
  readonly frictionCapacity: number;
  readonly plasticSlip: number;
  readonly plasticClosure: number;
  readonly contactActive: boolean;
  readonly sliding: boolean;
  readonly crushing: boolean;
}

export interface RigidBlockDeformableInterfaceAction2D {
  readonly blockId: string;
  readonly force: RigidBlockVector2D;
  /** Generalized counter-clockwise moment conjugate to the block rotation. */
  readonly moment: number;
}

/**
 * Named checks published by the deformable interface law. The literals identify the producing
 * mechanical check; application layers map them onto their own check identifier taxonomy and
 * must never re-derive the quantities.
 */
export type RigidBlockDeformableInterfaceMechanicalCheckId2D =
  | "coulomb-friction"
  | "deformable-interface-compression-strength";

export type RigidBlockDeformableInterfaceMechanicalCheckStatus2D =
  | "pass"
  | "fail"
  | "not-verifiable";

export interface RigidBlockDeformableInterfaceMechanicalCheck2D {
  readonly criterion: RigidBlockDeformableInterfaceMechanicalCheckId2D;
  readonly demand: number;
  readonly capacity: number;
  readonly utilizationRatio: number | null;
  readonly status: RigidBlockDeformableInterfaceMechanicalCheckStatus2D;
}

export interface RigidBlockDeformableInterfaceChecks2D {
  /**
   * Coulomb shear check of the tangential law. The deformable law always assigns a tangential
   * Coulomb law, so this check is always produced; the status is `not-verifiable` only when the
   * friction capacity is zero and no utilization can be formed.
   */
  readonly friction: RigidBlockDeformableInterfaceMechanicalCheck2D | null;
  /**
   * Finite-compression-strength check of the normal law. Null when no finite compression
   * strength is assigned. The demand is the maximum unclipped trial compression that the
   * crushing-onset test compares with the assigned strength, so the check reflects the actual
   * implemented law rather than the clipped stress distribution.
   */
  readonly compression: RigidBlockDeformableInterfaceMechanicalCheck2D | null;
}

export interface RigidBlockDeformableInterfaceEvaluation2D {
  readonly interfaceId: string;
  /** Local ordering is three degrees of freedom for the left block, then the right block. */
  readonly blockIds: readonly string[];
  readonly generalizedForces: readonly number[];
  readonly tangent: readonly (readonly number[])[];
  readonly actions: readonly RigidBlockDeformableInterfaceAction2D[];
  readonly trialState: RigidBlockDeformableInterfaceState2D;
  readonly fibers: readonly RigidBlockDeformableInterfaceFiberResponse2D[];
  readonly currentMidpoint: RigidBlockPoint2D;
  readonly currentChainTangent: RigidBlockVector2D;
  readonly currentJointAxis: RigidBlockVector2D;
  readonly normalForce: number;
  readonly shearForce: number;
  readonly moment: number;
  readonly eccentricity: number | null;
  readonly compressedLength: number;
  readonly maxCompression: number;
  /**
   * Maximum unclipped trial compression: the quantity the crushing-onset test compares with the
   * assigned compressive strength. For the analytic integration it is the exact edge maximum of
   * the trial distribution; for the perfectly-plastic integration it is the maximum over the
   * returned fiber midpoints, matching the fiber-wise crushing-onset test.
   */
  readonly maximumTrialCompression: number;
  /** Compression stress at the intrados edge of the joint. */
  readonly compressionAtIntrados: number;
  /** Compression stress at the extrados edge of the joint. */
  readonly compressionAtExtrados: number;
  readonly frictionUtilization: number | null;
  readonly maximumOpening: number;
  readonly maximumClosure: number;
  readonly maximumAbsoluteSlip: number;
  readonly contactActive: boolean;
  readonly sliding: boolean;
  readonly crushing: boolean;
  /** Mechanical checks produced where the law is evaluated; consumers copy, never recompute. */
  readonly checks: RigidBlockDeformableInterfaceChecks2D;
  /** Closed-normal/closed-stick derivative selection at the nonsmooth N = V = 0 vertex. */
  readonly coincidentClosedStickPredictor: boolean;
  readonly tangentMethod:
    | "central-finite-difference-of-analytic-generalized-forces"
    | "central-finite-difference-of-fiber-integrated-generalized-forces";
}

export interface EvaluateRigidBlockDeformableInterface2DInput {
  readonly geometry: RigidBlockInterface2D;
  readonly left: {
    readonly block: RigidBlock2D;
    readonly displacement: RigidBlockFiniteDisplacement2D;
  } | null;
  readonly right: {
    readonly block: RigidBlock2D;
    readonly displacement: RigidBlockFiniteDisplacement2D;
  } | null;
  readonly law: RigidBlockDeformableInterfaceLaw2D;
  readonly committedState?: RigidBlockDeformableInterfaceState2D | null;
  readonly finiteDifferenceStep?: number;
  readonly computeTangent?: boolean;
}

interface LocalBody {
  readonly side: "left" | "right";
  readonly block: RigidBlock2D;
  readonly displacement: RigidBlockFiniteDisplacement2D;
}

interface ForceEvaluation {
  readonly generalizedForces: number[];
  readonly trialState: RigidBlockDeformableInterfaceState2D;
  readonly fibers: RigidBlockDeformableInterfaceFiberResponse2D[];
  readonly currentMidpoint: RigidBlockPoint2D;
  readonly currentChainTangent: RigidBlockVector2D;
  readonly currentJointAxis: RigidBlockVector2D;
  readonly normalForce: number;
  readonly shearForce: number;
  readonly moment: number;
  readonly compressedLength: number;
  readonly maxCompression: number;
  readonly maximumTrialCompression: number;
  readonly compressionAtIntrados: number;
  readonly compressionAtExtrados: number;
  readonly frictionUtilization: number | null;
  readonly maximumOpening: number;
  readonly maximumClosure: number;
  readonly maximumAbsoluteSlip: number;
  readonly contactActive: boolean;
  readonly sliding: boolean;
  readonly crushing: boolean;
  readonly checks: RigidBlockDeformableInterfaceChecks2D;
}

interface NormalFiberEvaluation {
  readonly index: number;
  readonly coordinate: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly currentPoint: RigidBlockPoint2D;
  readonly normalGap: number;
  readonly tangentialSlip: number;
  readonly compressionStress: number;
  readonly contactActive: boolean;
  readonly crushing: boolean;
  readonly plasticClosure: number;
}

interface PointKinematics {
  readonly referencePoint: RigidBlockPoint2D;
  readonly currentPoint: RigidBlockPoint2D;
  readonly normalGap: number;
  readonly tangentialSlip: number;
  readonly normalB: readonly number[];
  readonly tangentialB: readonly number[];
}

interface NormalContactIntegral {
  /** Integral of compression stress over the joint coordinate. */
  readonly stressIntegral: number;
  /** First moment of compression stress about the joint midpoint. */
  readonly stressFirstMoment: number;
  readonly compressedLength: number;
  readonly maximumCompression: number;
  readonly maximumTrialCompression: number;
  readonly compressionAtIntrados: number;
  readonly compressionAtExtrados: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  const resolved = finite(value, label);
  if (resolved <= 0) throw new Error(`${label} must be positive.`);
  return resolved;
}

function rotate(vector: RigidBlockVector2D, angle: number): RigidBlockVector2D {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * vector.x - sine * vector.y,
    y: sine * vector.x + cosine * vector.y,
  };
}

function perpendicular(vector: RigidBlockVector2D): RigidBlockVector2D {
  return { x: -vector.y, y: vector.x };
}

function add(left: RigidBlockPoint2D, right: RigidBlockVector2D): RigidBlockPoint2D {
  return { x: left.x + right.x, y: left.y + right.y };
}

function subtract(left: RigidBlockPoint2D, right: RigidBlockPoint2D): RigidBlockVector2D {
  return { x: left.x - right.x, y: left.y - right.y };
}

function scale(vector: RigidBlockVector2D, factor: number): RigidBlockVector2D {
  return { x: factor * vector.x, y: factor * vector.y };
}

function transformedPoint(
  point: RigidBlockPoint2D,
  block: RigidBlock2D,
  displacement: RigidBlockFiniteDisplacement2D,
): RigidBlockPoint2D {
  return add(
    add(block.centroid, displacement.translation),
    rotate(subtract(point, block.centroid), displacement.rotation),
  );
}

function localBodies(input: EvaluateRigidBlockDeformableInterface2DInput): LocalBody[] {
  if (input.left === null && input.right === null) {
    throw new Error(
      `Deformable interface ${input.geometry.id} requires at least one adjacent block.`,
    );
  }
  const bodies: LocalBody[] = [];
  if (input.left !== null) bodies.push({ side: "left", ...input.left });
  if (input.right !== null) bodies.push({ side: "right", ...input.right });
  for (const body of bodies) {
    if (body.displacement.blockId !== body.block.id) {
      throw new Error(
        `Deformable interface ${input.geometry.id} has inconsistent block displacement ordering.`,
      );
    }
  }
  return bodies;
}

function withLocalDofIncrement(
  bodies: readonly LocalBody[],
  localDof: number,
  increment: number,
): LocalBody[] {
  const bodyIndex = Math.floor(localDof / 3);
  const component = localDof % 3;
  return bodies.map((body, index) => {
    if (index !== bodyIndex) return body;
    return {
      ...body,
      displacement: {
        ...body.displacement,
        translation: {
          x: body.displacement.translation.x + (component === 0 ? increment : 0),
          y: body.displacement.translation.y + (component === 1 ? increment : 0),
        },
        rotation: body.displacement.rotation + (component === 2 ? increment : 0),
      },
    };
  });
}

function validateLaw(
  geometry: RigidBlockInterface2D,
  law: RigidBlockDeformableInterfaceLaw2D,
): void {
  positive(geometry.length, `${geometry.id}.length`);
  positive(geometry.outOfPlaneWidth, `${geometry.id}.outOfPlaneWidth`);
  positive(law.normal.elasticModulus, `${geometry.id}.normal.elasticModulus`);
  positive(law.normal.characteristicLength, `${geometry.id}.normal.characteristicLength`);
  positive(law.tangential.shearModulus, `${geometry.id}.tangential.shearModulus`);
  positive(law.tangential.characteristicLength, `${geometry.id}.tangential.characteristicLength`);
  if (!Number.isInteger(law.normal.integrationPointCount) || law.normal.integrationPointCount < 2) {
    throw new Error(
      `${geometry.id}.normal.integrationPointCount must be an integer not smaller than two.`,
    );
  }
  if (law.normal.compressiveStrength !== null) {
    positive(law.normal.compressiveStrength, `${geometry.id}.normal.compressiveStrength`);
  }
  if (
    law.normal.postCrushingBehavior !== "stop-at-onset" &&
    law.normal.postCrushingBehavior !== "perfectly-plastic"
  ) {
    throw new Error(`${geometry.id}.normal.postCrushingBehavior is not supported.`);
  }
  if (
    law.normal.postCrushingBehavior === "perfectly-plastic" &&
    law.normal.compressiveStrength === null
  ) {
    throw new Error(
      `${geometry.id}.normal perfectly-plastic crushing requires compressiveStrength.`,
    );
  }
  if (
    !Number.isFinite(law.tangential.frictionCoefficient) ||
    law.tangential.frictionCoefficient < 0
  ) {
    throw new Error(
      `${geometry.id}.tangential.frictionCoefficient must be finite and non-negative.`,
    );
  }
  if (!Number.isFinite(law.tangential.cohesion) || law.tangential.cohesion < 0) {
    throw new Error(`${geometry.id}.tangential.cohesion must be finite and non-negative.`);
  }
  if (Math.abs(law.tangential.dilationAngle) > 1e-14) {
    throw new Error(
      `${geometry.id} nonlinear interface currently supports only non-associated Coulomb flow with zero dilation.`,
    );
  }
}

function clippedStress(value: number, lower: number | null, upper: number | null): number {
  const lowerClipped = lower === null ? value : Math.max(lower, value);
  return upper === null ? lowerClipped : Math.min(upper, lowerClipped);
}

/**
 * Integrates a linearly varying trial compression exactly after no-tension and optional crushing
 * clipping. The only breakpoints are the zero-pressure and crushing-front coordinates.
 */
function integrateNormalContact(
  intercept: number,
  slope: number,
  jointLength: number,
  lower: number | null,
  upper: number | null,
): NormalContactIntegral {
  const start = -jointLength / 2;
  const end = jointLength / 2;
  const breakpoints = [start, end];
  if (slope !== 0) {
    for (const limit of [0, lower, upper]) {
      if (limit === null) continue;
      const coordinate = (limit - intercept) / slope;
      if (coordinate > start && coordinate < end) breakpoints.push(coordinate);
    }
  }
  breakpoints.sort((left, right) => left - right);
  const uniqueBreakpoints = breakpoints.filter(
    (value, index) =>
      index === 0 || Math.abs(value - breakpoints[index - 1]!) > 1e-14 * jointLength,
  );
  let stressIntegral = 0;
  let stressFirstMoment = 0;
  let compressedLength = 0;

  for (let index = 0; index < uniqueBreakpoints.length - 1; index += 1) {
    const left = uniqueBreakpoints[index]!;
    const right = uniqueBreakpoints[index + 1]!;
    const midpoint = (left + right) / 2;
    const midpointTrial = intercept + slope * midpoint;
    const midpointStress = clippedStress(midpointTrial, lower, upper);
    const constantBranch =
      (lower !== null && midpointTrial <= lower) || (upper !== null && midpointTrial >= upper);
    const squaredDifference = right * right - left * left;
    if (constantBranch) {
      stressIntegral += midpointStress * (right - left);
      stressFirstMoment += (midpointStress * squaredDifference) / 2;
    } else {
      stressIntegral += intercept * (right - left) + (slope * squaredDifference) / 2;
      stressFirstMoment +=
        (intercept * squaredDifference) / 2 +
        (slope * (right * right * right - left * left * left)) / 3;
    }
    if (midpointStress > 0) compressedLength += right - left;
  }

  const trialAtStart = intercept + slope * start;
  const trialAtEnd = intercept + slope * end;
  const compressionAtIntrados = Math.max(0, clippedStress(trialAtStart, lower, upper));
  const compressionAtExtrados = Math.max(0, clippedStress(trialAtEnd, lower, upper));
  return {
    stressIntegral,
    stressFirstMoment,
    compressedLength,
    maximumCompression: Math.max(compressionAtIntrados, compressionAtExtrados),
    maximumTrialCompression: Math.max(trialAtStart, trialAtEnd),
    compressionAtIntrados,
    compressionAtExtrados,
  };
}

function evaluateForces(
  input: EvaluateRigidBlockDeformableInterface2DInput,
  bodies: readonly LocalBody[],
  committedState: RigidBlockDeformableInterfaceState2D,
  closedContactNormalTangentPredictor = false,
  includeFibers = true,
): ForceEvaluation {
  const { geometry, law } = input;
  const localSize = 3 * bodies.length;
  const generalizedForces = new Array<number>(localSize).fill(0);
  const fiberCount = law.normal.integrationPointCount;
  const fiberLength = geometry.length / fiberCount;
  const fiberArea = fiberLength * geometry.outOfPlaneWidth;
  const interfaceArea = geometry.length * geometry.outOfPlaneWidth;
  const normalStiffness = law.normal.elasticModulus / law.normal.characteristicLength;
  const resultantShearStiffness =
    (law.tangential.shearModulus / law.tangential.characteristicLength) * interfaceArea;
  const leftBody = bodies.find((body) => body.side === "left") ?? null;
  const rightBody = bodies.find((body) => body.side === "right") ?? null;
  const hasTwoBodies = leftBody !== null && rightBody !== null;
  let frameRotation = 0;
  if (leftBody !== null && rightBody !== null) {
    frameRotation = (leftBody.displacement.rotation + rightBody.displacement.rotation) / 2;
  }
  const chainTangent = rotate(geometry.chainTangent, frameRotation);
  const jointAxis = rotate(geometry.jointAxis, frameRotation);
  const chainTangentDerivative = perpendicular(chainTangent);
  const jointAxisDerivative = perpendicular(jointAxis);
  const pointKinematics = (coordinate: number): PointKinematics => {
    const referencePoint = add(geometry.midpoint, scale(geometry.jointAxis, coordinate));
    const pointLeft =
      leftBody === null
        ? referencePoint
        : transformedPoint(referencePoint, leftBody.block, leftBody.displacement);
    const pointRight =
      rightBody === null
        ? referencePoint
        : transformedPoint(referencePoint, rightBody.block, rightBody.displacement);
    const separation = subtract(pointRight, pointLeft);
    const normalGap = dot2d(separation, chainTangent);
    const tangentialSlip = dot2d(separation, jointAxis);
    const normalB = new Array<number>(localSize).fill(0);
    const tangentialB = new Array<number>(localSize).fill(0);

    for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
      const body = bodies[bodyIndex]!;
      const sideSign = body.side === "right" ? 1 : -1;
      const frameRate = hasTwoBodies ? 0.5 : 0;
      const rotatedRadius = rotate(
        subtract(referencePoint, body.block.centroid),
        body.displacement.rotation,
      );
      const rotationSeparationDerivative = scale(perpendicular(rotatedRadius), sideSign);
      const base = 3 * bodyIndex;
      normalB[base] = sideSign * chainTangent.x;
      normalB[base + 1] = sideSign * chainTangent.y;
      normalB[base + 2] =
        dot2d(rotationSeparationDerivative, chainTangent) +
        frameRate * dot2d(separation, chainTangentDerivative);
      tangentialB[base] = sideSign * jointAxis.x;
      tangentialB[base + 1] = sideSign * jointAxis.y;
      tangentialB[base + 2] =
        dot2d(rotationSeparationDerivative, jointAxis) +
        frameRate * dot2d(separation, jointAxisDerivative);
    }
    return {
      referencePoint,
      currentPoint: scale(add(pointLeft, pointRight), 0.5),
      normalGap,
      tangentialSlip,
      normalB,
      tangentialB,
    };
  };

  const center = pointKinematics(0);
  const unitCoordinate = pointKinematics(1);
  const normalGapSlope = unitCoordinate.normalGap - center.normalGap;
  const normalBSlopes = center.normalB.map(
    (value, index) => unitCoordinate.normalB[index]! - value,
  );
  const jointStart = -geometry.length / 2;
  const jointEnd = geometry.length / 2;
  const normalFibers: NormalFiberEvaluation[] = [];
  let normalForce = 0;
  let moment = 0;
  let compressedLength = 0;
  let maximumCompression = 0;
  let maximumTrialCompression = 0;
  let compressionAtIntrados: number;
  let compressionAtExtrados: number;
  let crushing = false;
  let trialPlasticClosures = [...committedState.plasticClosureByIntegrationPoint];
  const usesPlasticCrushingIntegration =
    law.normal.postCrushingBehavior === "perfectly-plastic" &&
    law.normal.compressiveStrength !== null;

  if (usesPlasticCrushingIntegration) {
    if (
      trialPlasticClosures.length !== 0 &&
      trialPlasticClosures.length !== law.normal.integrationPointCount
    ) {
      throw new Error(
        `${geometry.id}.committedState.plasticClosureByIntegrationPoint has an incompatible length.`,
      );
    }
    if (trialPlasticClosures.length === 0) {
      trialPlasticClosures = new Array<number>(law.normal.integrationPointCount).fill(0);
    }
    for (let index = 0; index < fiberCount; index += 1) {
      const coordinate = jointStart + (index + 0.5) * fiberLength;
      const kinematics = pointKinematics(coordinate);
      const committedPlasticClosure = trialPlasticClosures[index]!;
      const normalTrial = normalStiffness * (-kinematics.normalGap - committedPlasticClosure);
      maximumTrialCompression = Math.max(maximumTrialCompression, normalTrial);
      let plasticClosure = committedPlasticClosure;
      if (!closedContactNormalTangentPredictor && normalTrial > law.normal.compressiveStrength) {
        plasticClosure = Math.max(
          committedPlasticClosure,
          -kinematics.normalGap - law.normal.compressiveStrength / normalStiffness,
        );
      }
      trialPlasticClosures[index] = plasticClosure;
      const correctedTrial = normalStiffness * (-kinematics.normalGap - plasticClosure);
      const compressionStress = clippedStress(
        correctedTrial,
        closedContactNormalTangentPredictor ? null : 0,
        law.normal.compressiveStrength,
      );
      const fiberCrushing =
        plasticClosure > 0 ||
        (!closedContactNormalTangentPredictor &&
          normalTrial >= law.normal.compressiveStrength * (1 - 1e-12));
      crushing ||= fiberCrushing;
      normalForce += compressionStress * fiberArea;
      moment += compressionStress * fiberArea * coordinate;
      if (compressionStress > 0) compressedLength += fiberLength;
      maximumCompression = Math.max(maximumCompression, compressionStress);
      for (let dof = 0; dof < localSize; dof += 1) {
        generalizedForces[dof] =
          generalizedForces[dof]! + compressionStress * fiberArea * kinematics.normalB[dof]!;
      }
      if (includeFibers) {
        normalFibers.push({
          index,
          coordinate,
          referencePoint: kinematics.referencePoint,
          currentPoint: kinematics.currentPoint,
          normalGap: kinematics.normalGap,
          tangentialSlip: kinematics.tangentialSlip,
          compressionStress,
          contactActive: compressionStress > 0,
          crushing: fiberCrushing,
          plasticClosure,
        });
      }
    }
    const compressionAtEdge = (coordinate: number, plasticClosure: number) => {
      const kinematics = pointKinematics(coordinate);
      return Math.max(
        0,
        clippedStress(
          normalStiffness * (-kinematics.normalGap - plasticClosure),
          closedContactNormalTangentPredictor ? null : 0,
          law.normal.compressiveStrength,
        ),
      );
    };
    compressionAtIntrados = compressionAtEdge(jointStart, trialPlasticClosures[0]!);
    compressionAtExtrados = compressionAtEdge(jointEnd, trialPlasticClosures.at(-1)!);
    maximumCompression = Math.max(maximumCompression, compressionAtIntrados, compressionAtExtrados);
  } else {
    const normalIntegral = integrateNormalContact(
      -normalStiffness * center.normalGap,
      -normalStiffness * normalGapSlope,
      geometry.length,
      closedContactNormalTangentPredictor ? null : 0,
      law.normal.compressiveStrength,
    );
    normalForce = normalIntegral.stressIntegral * geometry.outOfPlaneWidth;
    moment = normalIntegral.stressFirstMoment * geometry.outOfPlaneWidth;
    compressedLength = normalIntegral.compressedLength;
    maximumCompression = normalIntegral.maximumCompression;
    maximumTrialCompression = normalIntegral.maximumTrialCompression;
    compressionAtIntrados = normalIntegral.compressionAtIntrados;
    compressionAtExtrados = normalIntegral.compressionAtExtrados;
    for (let dof = 0; dof < localSize; dof += 1) {
      generalizedForces[dof] =
        geometry.outOfPlaneWidth *
        (normalIntegral.stressIntegral * center.normalB[dof]! +
          normalIntegral.stressFirstMoment * normalBSlopes[dof]!);
    }
    crushing =
      !closedContactNormalTangentPredictor &&
      law.normal.compressiveStrength !== null &&
      maximumTrialCompression >= law.normal.compressiveStrength * (1 - 1e-12);
  }

  const totalFrictionCapacity = Math.max(
    0,
    law.tangential.cohesion * interfaceArea + law.tangential.frictionCoefficient * normalForce,
  );
  const shearTrial =
    -resultantShearStiffness * (center.tangentialSlip - committedState.plasticSlip);
  const sliding =
    Math.abs(shearTrial) > totalFrictionCapacity + 1e-12 * Math.max(1, totalFrictionCapacity);
  const shearForce = sliding ? Math.sign(shearTrial) * totalFrictionCapacity : shearTrial;
  const trialPlasticSlip = sliding
    ? center.tangentialSlip + shearForce / resultantShearStiffness
    : committedState.plasticSlip;
  const uniformShearStress = shearForce / interfaceArea;
  const uniformFrictionCapacity = totalFrictionCapacity / interfaceArea;

  for (let dof = 0; dof < localSize; dof += 1) {
    generalizedForces[dof] = generalizedForces[dof]! + shearForce * center.tangentialB[dof]!;
  }

  const startKinematics = pointKinematics(jointStart);
  const endKinematics = pointKinematics(jointEnd);
  const maximumOpening = Math.max(0, startKinematics.normalGap, endKinematics.normalGap);
  const maximumClosure = Math.max(0, -startKinematics.normalGap, -endKinematics.normalGap);
  const maximumAbsoluteSlip = Math.max(
    Math.abs(startKinematics.tangentialSlip),
    Math.abs(endKinematics.tangentialSlip),
  );
  if (includeFibers && !usesPlasticCrushingIntegration) {
    for (let index = 0; index < fiberCount; index += 1) {
      const coordinate = jointStart + (index + 0.5) * fiberLength;
      const kinematics = pointKinematics(coordinate);
      const normalTrial = -normalStiffness * kinematics.normalGap;
      const compressionStress = clippedStress(
        normalTrial,
        closedContactNormalTangentPredictor ? null : 0,
        law.normal.compressiveStrength,
      );
      const fiberCrushing =
        !closedContactNormalTangentPredictor &&
        law.normal.compressiveStrength !== null &&
        normalTrial >= law.normal.compressiveStrength * (1 - 1e-12);
      normalFibers.push({
        index,
        coordinate,
        referencePoint: kinematics.referencePoint,
        currentPoint: kinematics.currentPoint,
        normalGap: kinematics.normalGap,
        tangentialSlip: kinematics.tangentialSlip,
        compressionStress,
        contactActive: compressionStress > 0,
        crushing: fiberCrushing,
        plasticClosure: 0,
      });
    }
  }
  const fibers: RigidBlockDeformableInterfaceFiberResponse2D[] = normalFibers.map((fiber) => ({
    ...fiber,
    area: fiberArea,
    shearStress: uniformShearStress,
    frictionCapacity: uniformFrictionCapacity,
    plasticSlip: trialPlasticSlip,
    sliding,
  }));

  const frictionUtilization =
    totalFrictionCapacity > 0 ? Math.abs(shearForce) / totalFrictionCapacity : null;
  // The compression check is produced here, where the strength limit is actually applied:
  // the demand is the unclipped trial that the crushing-onset test compares with the assigned
  // strength, and the status reflects reaching the limit in the current state. Developed
  // plastic crushing (perfectly-plastic) below the current limit keeps the check at pass; the
  // `crushing` flag remains the historical/developed-plasticity state.
  const compressionCheck: RigidBlockDeformableInterfaceMechanicalCheck2D | null =
    law.normal.compressiveStrength === null
      ? null
      : {
          criterion: "deformable-interface-compression-strength",
          demand: maximumTrialCompression,
          capacity: law.normal.compressiveStrength,
          utilizationRatio: maximumTrialCompression / law.normal.compressiveStrength,
          status:
            maximumTrialCompression >= law.normal.compressiveStrength * (1 - 1e-12)
              ? "fail"
              : "pass",
        };
  return {
    generalizedForces,
    trialState: {
      plasticSlip: trialPlasticSlip,
      plasticClosureByIntegrationPoint: trialPlasticClosures,
    },
    fibers,
    currentMidpoint: center.currentPoint,
    currentChainTangent: chainTangent,
    currentJointAxis: jointAxis,
    normalForce,
    shearForce,
    moment,
    compressedLength,
    maxCompression: maximumCompression,
    maximumTrialCompression,
    compressionAtIntrados,
    compressionAtExtrados,
    frictionUtilization,
    maximumOpening,
    maximumClosure,
    maximumAbsoluteSlip,
    contactActive: normalForce > 0,
    sliding,
    crushing,
    checks: {
      friction: {
        criterion: "coulomb-friction",
        demand: Math.abs(shearForce),
        capacity: totalFrictionCapacity,
        utilizationRatio: frictionUtilization,
        status: frictionUtilization === null ? "not-verifiable" : sliding ? "fail" : "pass",
      },
      compression: compressionCheck,
    },
  };
}

export function createRigidBlockDeformableInterfaceState2D(): RigidBlockDeformableInterfaceState2D {
  return { plasticSlip: 0, plasticClosureByIntegrationPoint: [] };
}

export function evaluateRigidBlockDeformableInterface2D(
  input: EvaluateRigidBlockDeformableInterface2DInput,
): RigidBlockDeformableInterfaceEvaluation2D {
  validateLaw(input.geometry, input.law);
  const bodies = localBodies(input);
  const committedState = input.committedState ?? createRigidBlockDeformableInterfaceState2D();
  finite(committedState.plasticSlip, `${input.geometry.id}.committedState.plasticSlip`);
  for (const [index, closure] of committedState.plasticClosureByIntegrationPoint.entries()) {
    if (!Number.isFinite(closure) || closure < 0) {
      throw new Error(
        `${input.geometry.id}.committedState.plasticClosureByIntegrationPoint[${index}] must be finite and non-negative.`,
      );
    }
  }
  const baseline = evaluateForces(input, bodies, committedState);
  const localSize = baseline.generalizedForces.length;
  const tangent =
    input.computeTangent === false
      ? []
      : Array.from({ length: localSize }, () => new Array<number>(localSize).fill(0));
  const relativeStep = positive(
    input.finiteDifferenceStep ?? 1e-7,
    `${input.geometry.id}.finiteDifferenceStep`,
  );
  const coincidentClosedStickPredictor =
    !baseline.contactActive &&
    baseline.maximumOpening <= 1e-12 * Math.max(1, input.geometry.length) &&
    baseline.maximumClosure <= 1e-12 * Math.max(1, input.geometry.length);
  const tangentInput = coincidentClosedStickPredictor
    ? {
        ...input,
        law: {
          ...input.law,
          tangential: {
            ...input.law.tangential,
            cohesion:
              100 *
              (input.law.tangential.shearModulus / input.law.tangential.characteristicLength) *
              relativeStep *
              Math.max(1, input.geometry.length),
          },
        },
      }
    : input;
  for (let column = 0; column < (input.computeTangent === false ? 0 : localSize); column += 1) {
    const component = column % 3;
    const step = component === 2 ? relativeStep : relativeStep * Math.max(1, input.geometry.length);
    const plus = evaluateForces(
      tangentInput,
      withLocalDofIncrement(bodies, column, step),
      committedState,
      coincidentClosedStickPredictor,
      false,
    );
    const minus = evaluateForces(
      tangentInput,
      withLocalDofIncrement(bodies, column, -step),
      committedState,
      coincidentClosedStickPredictor,
      false,
    );
    for (let row = 0; row < localSize; row += 1) {
      tangent[row]![column] =
        (plus.generalizedForces[row]! - minus.generalizedForces[row]!) / (2 * step);
    }
  }

  const actions = bodies.map(
    (body, index): RigidBlockDeformableInterfaceAction2D => ({
      blockId: body.block.id,
      force: {
        x: baseline.generalizedForces[3 * index]!,
        y: baseline.generalizedForces[3 * index + 1]!,
      },
      moment: baseline.generalizedForces[3 * index + 2]!,
    }),
  );
  return {
    interfaceId: input.geometry.id,
    blockIds: bodies.map((body) => body.block.id),
    generalizedForces: baseline.generalizedForces,
    tangent,
    actions,
    trialState: baseline.trialState,
    fibers: baseline.fibers,
    currentMidpoint: baseline.currentMidpoint,
    currentChainTangent: baseline.currentChainTangent,
    currentJointAxis: baseline.currentJointAxis,
    normalForce: baseline.normalForce,
    shearForce: baseline.shearForce,
    moment: baseline.moment,
    eccentricity: baseline.normalForce > 0 ? baseline.moment / baseline.normalForce : null,
    compressedLength: baseline.compressedLength,
    maxCompression: baseline.maxCompression,
    maximumTrialCompression: baseline.maximumTrialCompression,
    compressionAtIntrados: baseline.compressionAtIntrados,
    compressionAtExtrados: baseline.compressionAtExtrados,
    frictionUtilization: baseline.frictionUtilization,
    maximumOpening: baseline.maximumOpening,
    maximumClosure: baseline.maximumClosure,
    maximumAbsoluteSlip: baseline.maximumAbsoluteSlip,
    contactActive: baseline.contactActive,
    sliding: baseline.sliding,
    crushing: baseline.crushing,
    checks: baseline.checks,
    coincidentClosedStickPredictor,
    tangentMethod:
      input.law.normal.postCrushingBehavior === "perfectly-plastic" &&
      input.law.normal.compressiveStrength !== null
        ? "central-finite-difference-of-fiber-integrated-generalized-forces"
        : "central-finite-difference-of-analytic-generalized-forces",
  };
}
