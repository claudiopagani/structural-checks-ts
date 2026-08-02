// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/norms/ntc2018/reinforced-concrete/ntc2018BeamColumnJoint.js.
import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_CHAPTER_7_4_REFERENCES } from "../normativeReferences.js";

const JOINT_TYPES = new Set(["internal", "external"]);
const TENSION_METHODS = new Set(["diagonal-tension", "post-cracking-truss"]);

export type Ntc2018JointType = "internal" | "external";
export type Ntc2018JointTensionMethod = string;

export interface Ntc2018JointConfinementRatios {
  readonly positiveX?: number;
  readonly negativeX?: number;
  readonly positiveZ?: number;
  readonly negativeZ?: number;
  readonly [key: string]: number | undefined;
}

export interface Ntc2018JointOverlapRatios {
  readonly x?: number;
  readonly z?: number;
  readonly [key: string]: number | undefined;
}

export interface Ntc2018JointConfinementInput {
  readonly faceCoverageRatios?: Ntc2018JointConfinementRatios;
  readonly oppositeBeamOverlapRatios?: Ntc2018JointOverlapRatios;
}

export interface Ntc2018JointEffectiveWidthInput {
  readonly columnWidth: number;
  readonly beamWidth: number;
  readonly columnDepth: number;
}

export interface Ntc2018JointShearDemandInput {
  readonly jointType: Ntc2018JointType;
  readonly gammaRd: number;
  readonly topReinforcementArea: number;
  readonly bottomReinforcementArea: number;
  readonly reinforcementDesignStrength: number;
  readonly columnShearAbove: number;
}

export interface Ntc2018JointCompressionCapacityInput {
  readonly jointType: Ntc2018JointType;
  readonly fck: number;
  readonly fcd: number;
  readonly normalizedAxialForce: number;
  readonly effectiveJointWidth: number;
  readonly columnLongitudinalLayerDistance: number;
}

export interface Ntc2018JointTensionReinforcementInput {
  readonly method: string;
  readonly jointType: Ntc2018JointType;
  readonly jointShearDemand: number;
  readonly effectiveJointWidth: number;
  readonly columnLongitudinalLayerDistance: number;
  readonly beamLongitudinalLayerDistance: number;
  readonly normalizedAxialForce: number;
  readonly fcd: number;
  readonly fctd: number;
  readonly gammaRd: number;
  readonly topReinforcementArea: number;
  readonly bottomReinforcementArea: number;
  readonly reinforcementDesignStrength: number;
}

function display(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "object") return Object.prototype.toString.call(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") return value.toString();
  return Object.prototype.toString.call(value);
}

function positive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

function nonNegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative.`);
  }

  return value;
}

export function ntc2018JointOverstrengthFactor(ductilityClass: unknown): number {
  const normalized =
    ductilityClass == null
      ? ""
      : display(ductilityClass).trim().toUpperCase().replaceAll('"', "").replaceAll("-", "");

  if (["CDA", "A"].includes(normalized)) {
    return 1.2;
  }

  if (["CDB", "B"].includes(normalized)) {
    return 1.1;
  }

  throw new Error(`Unsupported NTC 2018 ductility class: ${String(ductilityClass)}.`);
}

export function calculateNTC2018EffectiveJointWidth({
  columnWidth,
  beamWidth,
  columnDepth,
}: Ntc2018JointEffectiveWidthInput): number {
  positive(columnWidth, "columnWidth");
  positive(beamWidth, "beamWidth");
  positive(columnDepth, "columnDepth");

  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.3.1
  return Math.min(
    Math.max(columnWidth, beamWidth),
    Math.min(columnWidth, beamWidth) + columnDepth / 2,
  );
}

export function classifyNTC2018JointConfinement({
  faceCoverageRatios = {},
  oppositeBeamOverlapRatios = {},
}: Ntc2018JointConfinementInput = {}) {
  const faceKeys = ["positiveX", "negativeX", "positiveZ", "negativeZ"];
  const overlapKeys = ["x", "z"];
  const missing = [
    ...faceKeys.filter((key) => !Number.isFinite(faceCoverageRatios[key])),
    ...overlapKeys
      .filter((key) => !Number.isFinite(oppositeBeamOverlapRatios[key]))
      .map((key) => `overlap-${key}`),
  ];

  if (missing.length > 0) {
    throw new Error(
      `Joint confinement classification requires all face and overlap ratios; missing: ${missing.join(", ")}.`,
    );
  }

  const allFacesCovered = faceKeys.every((key) => {
    const ratio = faceCoverageRatios[key];
    return typeof ratio === "number" && ratio >= 0.75;
  });
  const bothPairsOverlap = overlapKeys.every((key) => {
    const ratio = oppositeBeamOverlapRatios[key];
    return typeof ratio === "number" && ratio >= 0.75;
  });

  return {
    classification: allFacesCovered && bothPairsOverlap ? "fully-confined" : "not-fully-confined",
    fullyConfined: allFacesCovered && bothPairsOverlap,
    allFacesCovered,
    bothPairsOverlap,
    threshold: 0.75,
    faceCoverageRatios: { ...faceCoverageRatios },
    oppositeBeamOverlapRatios: { ...oppositeBeamOverlapRatios },
    metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.jointGeometry]),
  };
}

export function calculateNTC2018JointShearDemand({
  jointType,
  gammaRd,
  topReinforcementArea,
  bottomReinforcementArea,
  reinforcementDesignStrength,
  columnShearAbove,
}: Ntc2018JointShearDemandInput) {
  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  positive(gammaRd, "gammaRd");
  nonNegative(topReinforcementArea, "topReinforcementArea");
  nonNegative(bottomReinforcementArea, "bottomReinforcementArea");
  positive(reinforcementDesignStrength, "reinforcementDesignStrength");

  if (!Number.isFinite(columnShearAbove)) {
    throw new Error("columnShearAbove must be finite.");
  }

  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.3.1
  const reinforcementArea =
    jointType === "internal"
      ? topReinforcementArea + bottomReinforcementArea
      : topReinforcementArea;
  const beamForce = gammaRd * reinforcementArea * reinforcementDesignStrength;

  return {
    demand: Math.abs(beamForce - columnShearAbove),
    beamForce,
    columnShearAbove,
    reinforcementArea,
    equation: jointType === "internal" ? "NTC2018-7.4.7" : "NTC2018-7.4.6",
    metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint]),
  };
}

export function calculateNTC2018JointCompressionCapacity({
  jointType,
  fck,
  fcd,
  normalizedAxialForce,
  effectiveJointWidth,
  columnLongitudinalLayerDistance,
}: Ntc2018JointCompressionCapacityInput) {
  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  positive(fck, "fck");
  positive(fcd, "fcd");
  nonNegative(normalizedAxialForce, "normalizedAxialForce");
  positive(effectiveJointWidth, "effectiveJointWidth");
  positive(columnLongitudinalLayerDistance, "columnLongitudinalLayerDistance");
  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.3.1
  const alphaJ = jointType === "internal" ? 0.6 : 0.48;
  const eta = alphaJ * (1 - fck / 250);
  const radicand = eta > 0 ? 1 - normalizedAxialForce / eta : -1;
  const capacity =
    eta > 0 && radicand > 0
      ? eta * fcd * effectiveJointWidth * columnLongitudinalLayerDistance * Math.sqrt(radicand)
      : 0;

  return {
    capacity,
    alphaJ,
    eta,
    radicand,
    equation: "NTC2018-7.4.8-7.4.9",
    metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint]),
  };
}

export function calculateNTC2018JointTensionReinforcement({
  method,
  jointType,
  jointShearDemand,
  effectiveJointWidth,
  columnLongitudinalLayerDistance,
  beamLongitudinalLayerDistance,
  normalizedAxialForce,
  fcd,
  fctd,
  gammaRd,
  topReinforcementArea,
  bottomReinforcementArea,
  reinforcementDesignStrength,
}: Ntc2018JointTensionReinforcementInput) {
  if (!TENSION_METHODS.has(method)) {
    throw new Error(`Unsupported joint tension method: ${method}.`);
  }

  if (!JOINT_TYPES.has(jointType)) {
    throw new Error(`Unsupported jointType: ${jointType}.`);
  }

  nonNegative(jointShearDemand, "jointShearDemand");
  positive(effectiveJointWidth, "effectiveJointWidth");
  positive(columnLongitudinalLayerDistance, "columnLongitudinalLayerDistance");
  positive(beamLongitudinalLayerDistance, "beamLongitudinalLayerDistance");
  nonNegative(normalizedAxialForce, "normalizedAxialForce");
  positive(fcd, "fcd");
  positive(fctd, "fctd");
  positive(gammaRd, "gammaRd");
  nonNegative(topReinforcementArea, "topReinforcementArea");
  nonNegative(bottomReinforcementArea, "bottomReinforcementArea");
  positive(reinforcementDesignStrength, "reinforcementDesignStrength");

  if (method === "post-cracking-truss") {
    const reinforcementArea =
      jointType === "internal"
        ? topReinforcementArea + bottomReinforcementArea
        : bottomReinforcementArea;
    const axialFactor = Math.max(0, 1 - 0.8 * normalizedAxialForce);

    return {
      requiredHorizontalTieForce:
        gammaRd * reinforcementArea * reinforcementDesignStrength * axialFactor,
      axialFactor,
      reinforcementArea,
      shearStress: jointShearDemand / (effectiveJointWidth * columnLongitudinalLayerDistance),
      equation: jointType === "internal" ? "NTC2018-7.4.11" : "NTC2018-7.4.12",
      metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint]),
    };
  }

  const shearStress = jointShearDemand / (effectiveJointWidth * columnLongitudinalLayerDistance);
  const denominator = fctd + normalizedAxialForce * fcd;
  const requiredConfiningStress = Math.max(0, shearStress ** 2 / denominator - fctd);

  return {
    requiredHorizontalTieForce:
      requiredConfiningStress * effectiveJointWidth * beamLongitudinalLayerDistance,
    requiredConfiningStress,
    shearStress,
    denominator,
    equation: "NTC2018-7.4.10",
    metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint]),
  };
}

export const NTC2018_BEAM_COLUMN_JOINT_TYPES = Object.freeze([...JOINT_TYPES]);
export const NTC2018_BEAM_COLUMN_JOINT_TENSION_METHODS = Object.freeze([...TENSION_METHODS]);
