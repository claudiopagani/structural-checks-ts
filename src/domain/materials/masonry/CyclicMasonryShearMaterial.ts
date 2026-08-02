import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../units/UnitSystem.js";
import {
  createMasonryShearStrengthModel,
  type MasonryShearStrengthModelInput,
} from "./shearStrength/createMasonryShearStrengthModel.js";
import type {
  MasonryShearStrengthContext,
  MasonryShearStrengthEvaluation,
  MasonryShearStrengthModel,
} from "./shearStrength/MohrCoulombModel.js";

const INTERNAL_UNITS = Object.freeze({ force: "kN", length: "m" });
const STATE_VERSION = 1;
const EPS = 1e-14;

type ShearBranch =
  | "initial"
  | "elastic-unloading"
  | "elastic"
  | "hardening"
  | "softening"
  | "residual"
  | "pinched-reloading"
  | `pinched-${"elastic" | "hardening" | "softening" | "residual"}`;

export interface CyclicMasonryShearContext extends MasonryShearStrengthContext {
  deformableHeight?: number;
  effectiveShearArea?: number;
  loadingDirectionHint?: number;
}

export interface CyclicMasonryShearState {
  version: number;
  deformation: number;
  shearStrain: number;
  force: number;
  tangent: number;
  elasticStiffness: number;
  plasticDeformation: number;
  damage: number;
  stiffnessDamage: number;
  strengthDamage: number;
  pinchingFactor: number;
  pinchingActive: boolean;
  pinchingPending: boolean;
  pinchingTarget: number;
  pinchingReversalDeformation: number;
  maxPositiveDeformation: number;
  minNegativeDeformation: number;
  loadingDirection: number;
  reversalCount: number;
  cumulativeWork: number;
  dissipatedEnergy: number;
  capacities: {
    diagonalTension: number;
    sliding: number;
    combined: number;
    residual: number;
  };
  diagonalCrackingIndex: number;
  slidingIndex: number;
  predominantMechanism: "elastic-shear" | "diagonal-tension" | "sliding";
  mechanismsActivated: string[];
  branch: ShearBranch;
}

export interface CyclicMasonryShearPinching {
  enabled: boolean;
  factor: number;
  recoveryRatio: number;
}

export interface CyclicMasonryShearDegradation {
  enabled: boolean;
  ductilityCoefficient: number;
  energyCoefficient: number;
  limit: number;
}

export interface CyclicMasonryShearMaterialOptions {
  id?: string | null;
  units?: UnitSystemInput | null;
  shearModulus?: number | null;
  elasticStiffness?: number | null;
  diagonalTensionModel?: MasonryShearStrengthModelInput | null;
  slidingModel?: MasonryShearStrengthModelInput | null;
  peakShearStrain?: number;
  ultimateShearStrain?: number;
  hardeningRatio?: number;
  residualStrengthRatio?: number;
  residualStrengthMode?: string;
  pinching?: Partial<CyclicMasonryShearPinching>;
  stiffnessDegradation?: Partial<CyclicMasonryShearDegradation>;
  strengthDegradation?: Partial<CyclicMasonryShearDegradation>;
  competitionExponent?: number;
  mechanismActivationRatio?: number;
  numericalTangentRatio?: number;
  metadata?: Record<string, unknown>;
}

export interface CyclicMasonryShearConfiguration extends Record<string, unknown> {
  id: string | null;
  units: UnitSystem;
  shearModulus: number;
  elasticStiffness: number | null;
  diagonalTensionModel: MasonryShearStrengthModel;
  slidingModel: MasonryShearStrengthModel;
  peakShearStrain: number;
  ultimateShearStrain: number;
  hardeningRatio: number;
  residualStrengthRatio: number;
  residualStrengthMode: string;
  pinching: CyclicMasonryShearPinching;
  stiffnessDegradation: CyclicMasonryShearDegradation;
  strengthDegradation: CyclicMasonryShearDegradation;
  competitionExponent: number;
  mechanismActivationRatio: number;
  numericalTangentRatio: number;
  metadata: Record<string, unknown>;
}

export interface CyclicMasonryShearMaterialJson {
  type: string;
  configuration: Omit<CyclicMasonryShearConfiguration, "diagonalTensionModel" | "slidingModel"> & {
    diagonalTensionModel: Record<string, unknown>;
    slidingModel: Record<string, unknown>;
  };
  committedState: CyclicMasonryShearState;
  trialState: CyclicMasonryShearState;
}

function pinchedBranch(branch: BackboneResponse["branch"]): ShearBranch {
  switch (branch) {
    case "elastic":
      return "pinched-elastic";
    case "hardening":
      return "pinched-hardening";
    case "softening":
      return "pinched-softening";
    case "residual":
      return "pinched-residual";
  }
}

function numericValue(value: number | string | undefined): number {
  return typeof value === "number" ? value : Number(value);
}

function serializeModel(model: MasonryShearStrengthModel): Record<string, unknown> {
  const value = model.toJSON?.();
  return value !== null && typeof value === "object" ? { ...value } : { type: "user-defined" };
}

interface CapacityData {
  diagonal: MasonryShearStrengthEvaluation;
  sliding: MasonryShearStrengthEvaluation;
  diagonalTension: number;
  slidingCapacity: number;
  combined: number;
  residual: number;
  strengthDegradationFloors: {
    diagonalTension: number;
    sliding: number;
  };
}

interface BackboneResponse {
  force: number;
  tangent: number;
  yieldDeformation: number;
  peakDeformation: number;
  ultimateDeformation: number;
  branch: "elastic" | "hardening" | "softening" | "residual";
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`CyclicMasonryShearMaterial requires a positive ${label}.`);
  }
}

function assertNonNegative(
  value: number | null | undefined,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`CyclicMasonryShearMaterial requires a non-negative ${label}.`);
  }
}

function assertRatio(value: number | null | undefined, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`CyclicMasonryShearMaterial requires ${label} between 0 and 1.`);
  }
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function directionOf(increment: number, fallback = 0): number {
  return Math.abs(increment) <= EPS ? fallback : Math.sign(increment);
}

function cloneState(state: CyclicMasonryShearState): CyclicMasonryShearState {
  return {
    ...state,
    capacities: { ...state.capacities },
    mechanismsActivated: [...state.mechanismsActivated],
  };
}

/**
 * Coupled cyclic shear law with independent plastic deformation, damage,
 * pinching memory, directional excursions and hysteretic energy.
 */
export class CyclicMasonryShearMaterial {
  readonly id: string | null;
  readonly type: string;
  readonly units: UnitSystem;
  readonly shearModulus: number;
  readonly elasticStiffness: number | null;
  readonly diagonalTensionModel: MasonryShearStrengthModel;
  readonly slidingModel: MasonryShearStrengthModel;
  readonly peakShearStrain: number;
  readonly ultimateShearStrain: number;
  readonly hardeningRatio: number;
  readonly residualStrengthRatio: number;
  readonly residualStrengthMode: string;
  readonly pinching: CyclicMasonryShearPinching;
  readonly stiffnessDegradation: CyclicMasonryShearDegradation;
  readonly strengthDegradation: CyclicMasonryShearDegradation;
  readonly competitionExponent: number;
  readonly mechanismActivationRatio: number;
  readonly numericalTangentRatio: number;
  readonly metadata: Record<string, unknown>;
  private _configuration: CyclicMasonryShearConfiguration;
  private _committedState!: CyclicMasonryShearState;
  private _trialState!: CyclicMasonryShearState;

  constructor({
    id = null,
    units = null,
    shearModulus,
    elasticStiffness = null,
    diagonalTensionModel,
    slidingModel,
    peakShearStrain,
    ultimateShearStrain,
    hardeningRatio = 0,
    residualStrengthRatio,
    residualStrengthMode = "ratio",
    pinching = {},
    stiffnessDegradation = {},
    strengthDegradation = {},
    competitionExponent = 8,
    mechanismActivationRatio = 0.95,
    numericalTangentRatio = 0,
    metadata = {},
  }: CyclicMasonryShearMaterialOptions = {}) {
    assertExplicitUnitSystem(units, "CyclicMasonryShearMaterial");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);

    this.id = id;
    this.type = "cyclic-masonry-shear";
    this.units = resolver.targetUnitSystem;
    this.shearModulus = resolver.stress(shearModulus)!;
    this.elasticStiffness = resolver.translationalStiffness(elasticStiffness);
    this.diagonalTensionModel = createMasonryShearStrengthModel(diagonalTensionModel, {
      role: "diagonal tension",
    });
    this.slidingModel = createMasonryShearStrengthModel(slidingModel, {
      role: "sliding",
    });
    this.peakShearStrain = peakShearStrain!;
    this.ultimateShearStrain = ultimateShearStrain!;
    this.hardeningRatio = hardeningRatio!;
    this.residualStrengthRatio = residualStrengthRatio!;
    this.residualStrengthMode = String(residualStrengthMode).trim().toLowerCase();
    this.pinching = {
      enabled: Boolean(pinching.enabled),
      factor: pinching.factor ?? 1,
      recoveryRatio: pinching.recoveryRatio ?? 1,
    };
    this.stiffnessDegradation = {
      enabled: Boolean(stiffnessDegradation.enabled),
      ductilityCoefficient: stiffnessDegradation.ductilityCoefficient ?? 0,
      energyCoefficient: stiffnessDegradation.energyCoefficient ?? 0,
      limit: stiffnessDegradation.limit ?? 0.95,
    };
    this.strengthDegradation = {
      enabled: Boolean(strengthDegradation.enabled),
      ductilityCoefficient: strengthDegradation.ductilityCoefficient ?? 0,
      energyCoefficient: strengthDegradation.energyCoefficient ?? 0,
      limit: strengthDegradation.limit ?? 1 - (residualStrengthRatio ?? 0),
    };
    this.competitionExponent = competitionExponent;
    this.mechanismActivationRatio = mechanismActivationRatio;
    this.numericalTangentRatio = numericalTangentRatio;
    this.metadata = {
      ...metadata,
      unitSystem: resolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? resolver.sourceUnitSystem,
      parameterStatus: metadata.parameterStatus ?? "user-calibrated",
    };

    assertPositive(this.shearModulus, "shearModulus");
    assertPositive(this.peakShearStrain, "peakShearStrain");
    assertPositive(this.ultimateShearStrain, "ultimateShearStrain");
    assertNonNegative(this.hardeningRatio, "hardeningRatio");
    assertRatio(this.residualStrengthRatio, "residualStrengthRatio");
    if (!new Set(["ratio", "sliding-floor"]).has(this.residualStrengthMode)) {
      throw new Error(
        'CyclicMasonryShearMaterial residualStrengthMode must be "ratio" or "sliding-floor".',
      );
    }
    assertPositive(this.competitionExponent, "competitionExponent");
    assertRatio(this.mechanismActivationRatio, "mechanismActivationRatio");
    assertNonNegative(this.numericalTangentRatio, "numericalTangentRatio");
    assertRatio(this.pinching.factor, "pinching.factor");
    assertPositive(this.pinching.recoveryRatio, "pinching.recoveryRatio");
    assertRatio(this.stiffnessDegradation.limit, "stiffnessDegradation.limit");
    assertRatio(this.strengthDegradation.limit, "strengthDegradation.limit");
    assertNonNegative(
      this.stiffnessDegradation.ductilityCoefficient,
      "stiffnessDegradation.ductilityCoefficient",
    );
    assertNonNegative(
      this.stiffnessDegradation.energyCoefficient,
      "stiffnessDegradation.energyCoefficient",
    );
    assertNonNegative(
      this.strengthDegradation.ductilityCoefficient,
      "strengthDegradation.ductilityCoefficient",
    );
    assertNonNegative(
      this.strengthDegradation.energyCoefficient,
      "strengthDegradation.energyCoefficient",
    );

    if (this.ultimateShearStrain <= this.peakShearStrain) {
      throw new Error("CyclicMasonryShearMaterial requires ultimateShearStrain > peakShearStrain.");
    }

    if (
      this.elasticStiffness != null &&
      (!Number.isFinite(this.elasticStiffness) || this.elasticStiffness <= 0)
    ) {
      throw new Error(
        "CyclicMasonryShearMaterial elasticStiffness must be positive when supplied.",
      );
    }

    this._configuration = this.configuration();
    this.revertToStart();
  }

  configuration(): CyclicMasonryShearConfiguration {
    return {
      id: this.id,
      units: { ...this.units },
      shearModulus: this.shearModulus,
      elasticStiffness: this.elasticStiffness,
      diagonalTensionModel: this.diagonalTensionModel,
      slidingModel: this.slidingModel,
      peakShearStrain: this.peakShearStrain,
      ultimateShearStrain: this.ultimateShearStrain,
      hardeningRatio: this.hardeningRatio,
      residualStrengthRatio: this.residualStrengthRatio,
      residualStrengthMode: this.residualStrengthMode,
      pinching: { ...this.pinching },
      stiffnessDegradation: { ...this.stiffnessDegradation },
      strengthDegradation: { ...this.strengthDegradation },
      competitionExponent: this.competitionExponent,
      mechanismActivationRatio: this.mechanismActivationRatio,
      numericalTangentRatio: this.numericalTangentRatio,
      metadata: { ...this.metadata },
    };
  }

  initialState(): CyclicMasonryShearState {
    return {
      version: STATE_VERSION,
      deformation: 0,
      shearStrain: 0,
      force: 0,
      tangent: 0,
      elasticStiffness: 0,
      plasticDeformation: 0,
      damage: 0,
      stiffnessDamage: 0,
      strengthDamage: 0,
      pinchingFactor: 1,
      pinchingActive: false,
      pinchingPending: false,
      pinchingTarget: 0,
      pinchingReversalDeformation: 0,
      maxPositiveDeformation: 0,
      minNegativeDeformation: 0,
      loadingDirection: 0,
      reversalCount: 0,
      cumulativeWork: 0,
      dissipatedEnergy: 0,
      capacities: {
        diagonalTension: 0,
        sliding: 0,
        combined: 0,
        residual: 0,
      },
      diagonalCrackingIndex: 0,
      slidingIndex: 0,
      predominantMechanism: "elastic-shear",
      mechanismsActivated: [],
      branch: "initial",
    };
  }

  resolveElasticStiffness(context: CyclicMasonryShearContext): number {
    if (Number.isFinite(this.elasticStiffness)) {
      return this.elasticStiffness!;
    }

    const effectiveShearArea = context.effectiveShearArea;
    const deformableHeight = context.deformableHeight;

    assertPositive(effectiveShearArea, "context effectiveShearArea");
    assertPositive(deformableHeight, "context deformableHeight");

    return (this.shearModulus * effectiveShearArea) / deformableHeight;
  }

  smoothMinimum(left: number, right: number): number {
    if (left <= 0 || right <= 0) {
      return 0;
    }

    const exponent = this.competitionExponent;
    return (left ** -exponent + right ** -exponent) ** (-1 / exponent);
  }

  capacities(context: CyclicMasonryShearContext, state: CyclicMasonryShearState): CapacityData {
    const strategyContext = {
      ...context,
      shearDamage: state.damage,
    };
    const diagonal = this.diagonalTensionModel.evaluate(strategyContext);
    const sliding = this.slidingModel.evaluate(strategyContext);
    const commonStrengthFactor = 1 - state.strengthDamage;
    const diagonalCapacityValue = numericValue(diagonal.capacity);
    const slidingCapacityValue = numericValue(sliding.capacity);
    const diagonalFloor = Math.min(
      diagonalCapacityValue,
      Math.max(0, numericValue(diagonal.strengthDegradationFloor ?? 0)),
    );
    const slidingFloor = Math.min(
      slidingCapacityValue,
      Math.max(0, numericValue(sliding.strengthDegradationFloor ?? 0)),
    );
    const preserveSlidingFloor = this.residualStrengthMode === "sliding-floor";
    const diagonalCapacity = preserveSlidingFloor
      ? diagonalFloor + (diagonalCapacityValue - diagonalFloor) * commonStrengthFactor
      : diagonalCapacityValue * commonStrengthFactor;
    const slidingCapacity = preserveSlidingFloor
      ? slidingFloor + (slidingCapacityValue - slidingFloor) * commonStrengthFactor
      : slidingCapacityValue * commonStrengthFactor;
    const diagonalResidual = this.residualStrengthRatio * diagonalCapacity;
    const slidingResidual = Math.max(slidingFloor, this.residualStrengthRatio * slidingCapacity);

    return {
      diagonal,
      sliding,
      diagonalTension: diagonalCapacity,
      slidingCapacity,
      combined: this.smoothMinimum(diagonalCapacity, slidingCapacity),
      residual: this.smoothMinimum(diagonalResidual, slidingResidual),
      strengthDegradationFloors: {
        diagonalTension: diagonalFloor,
        sliding: slidingFloor,
      },
    };
  }

  backbone(
    deformationMagnitude: number,
    capacity: number,
    residualCapacity: number,
    stiffness: number,
    height: number,
  ): BackboneResponse {
    const yieldDeformation = capacity / stiffness;
    const peakDeformation = Math.max(yieldDeformation, this.peakShearStrain * height);
    const ultimateDeformation = Math.max(peakDeformation + EPS, this.ultimateShearStrain * height);
    const peakForce = capacity * (1 + this.hardeningRatio);
    const residualForce =
      this.residualStrengthMode === "sliding-floor"
        ? Math.min(capacity, residualCapacity)
        : this.residualStrengthRatio * capacity;

    if (deformationMagnitude <= yieldDeformation) {
      return {
        force: stiffness * deformationMagnitude,
        tangent: stiffness,
        yieldDeformation,
        peakDeformation,
        ultimateDeformation,
        branch: "elastic",
      };
    }

    if (deformationMagnitude <= peakDeformation) {
      const range = Math.max(peakDeformation - yieldDeformation, EPS);
      const tangent = (peakForce - capacity) / range;
      return {
        force: capacity + tangent * (deformationMagnitude - yieldDeformation),
        tangent,
        yieldDeformation,
        peakDeformation,
        ultimateDeformation,
        branch: "hardening",
      };
    }

    if (deformationMagnitude < ultimateDeformation) {
      const tangent = (residualForce - peakForce) / (ultimateDeformation - peakDeformation);
      return {
        force: peakForce + tangent * (deformationMagnitude - peakDeformation),
        tangent,
        yieldDeformation,
        peakDeformation,
        ultimateDeformation,
        branch: "softening",
      };
    }

    return {
      force: residualForce,
      tangent: this.numericalTangentRatio * stiffness,
      yieldDeformation,
      peakDeformation,
      ultimateDeformation,
      branch: "residual",
    };
  }

  setTrialDeformation(deformation: number, context: CyclicMasonryShearContext = {}): number {
    if (!Number.isFinite(deformation)) {
      throw new Error(
        "CyclicMasonryShearMaterial setTrialDeformation requires a finite deformation.",
      );
    }

    const committed = this._committedState;
    const height = context.deformableHeight;
    assertPositive(height, "context deformableHeight");
    const baseStiffness = this.resolveElasticStiffness(context);
    const increment = deformation - committed.deformation;
    const direction =
      typeof context.loadingDirectionHint === "number" &&
      Number.isFinite(context.loadingDirectionHint) &&
      context.loadingDirectionHint !== 0
        ? Math.sign(context.loadingDirectionHint)
        : directionOf(increment, committed.loadingDirection);
    const reversed =
      committed.loadingDirection !== 0 &&
      direction !== 0 &&
      direction !== committed.loadingDirection;
    const reversalCount = committed.reversalCount + Number(reversed);
    const maxPositiveDeformation = Math.max(committed.maxPositiveDeformation, deformation);
    const minNegativeDeformation = Math.min(committed.minNegativeDeformation, deformation);
    const stiffness = Math.max(
      this.numericalTangentRatio * baseStiffness,
      (1 - committed.stiffnessDamage) * baseStiffness,
    );
    const capacityData = this.capacities(context, committed);
    const envelope = this.backbone(
      Math.abs(deformation),
      capacityData.combined,
      capacityData.residual,
      stiffness,
      height,
    );
    const trialElasticForce = stiffness * (deformation - committed.plasticDeformation);
    let pinchingPending = false;
    let pinchingActive = this.pinching.enabled && (committed.pinchingActive || reversed);
    let pinchingTarget = committed.pinchingTarget;
    let pinchingReversalDeformation = committed.pinchingReversalDeformation;

    if (reversed) {
      pinchingTarget = Math.max(
        Math.abs(maxPositiveDeformation),
        Math.abs(minNegativeDeformation),
        envelope.peakDeformation,
      );
      pinchingReversalDeformation = committed.deformation;
    }

    const reversalSign = Math.sign(pinchingReversalDeformation);
    const passedOrigin =
      reversalSign !== 0 && Math.sign(deformation) !== 0 && Math.sign(deformation) !== reversalSign;
    if (
      pinchingActive &&
      passedOrigin &&
      Math.abs(deformation) >= pinchingTarget * this.pinching.recoveryRatio
    ) {
      pinchingActive = false;
      pinchingPending = false;
    }

    const recoveryDeformation = Math.max(pinchingTarget * this.pinching.recoveryRatio, EPS);
    const unloadingReference = Math.max(Math.abs(pinchingReversalDeformation), EPS);
    const unloadingTowardOrigin =
      pinchingActive &&
      reversalSign !== 0 &&
      (Math.sign(deformation) === reversalSign || deformation === 0);
    const pinchingProgress = unloadingTowardOrigin
      ? clamp(Math.abs(deformation) / unloadingReference)
      : clamp(Math.abs(deformation) / recoveryDeformation);
    const pinchingFactor = pinchingActive
      ? this.pinching.factor + (1 - this.pinching.factor) * pinchingProgress
      : 1;
    const pinchingDerivative =
      pinchingActive && pinchingProgress < 1
        ? ((1 - this.pinching.factor) /
            (unloadingTowardOrigin ? unloadingReference : recoveryDeformation)) *
          Math.sign(deformation || 1)
        : 0;
    const forceLimit = pinchingFactor * envelope.force;
    let force: number;
    let tangent: number;
    let plasticDeformation = committed.plasticDeformation;
    let branch: ShearBranch;

    const pinchedTrialElasticForce = pinchingFactor * trialElasticForce;

    if (Math.abs(pinchedTrialElasticForce) <= forceLimit + EPS) {
      force = pinchingFactor * trialElasticForce;
      tangent = pinchingFactor * stiffness + pinchingDerivative * trialElasticForce;
      branch = pinchingActive ? "pinched-reloading" : "elastic-unloading";
    } else {
      const forceSign = Math.sign(trialElasticForce || deformation || 1);
      force = forceSign * forceLimit;
      tangent = pinchingFactor * envelope.tangent + pinchingDerivative * forceSign * envelope.force;
      plasticDeformation = deformation - force / stiffness;
      branch = pinchingActive ? pinchedBranch(envelope.branch) : envelope.branch;
    }

    const workIncrement = 0.5 * (committed.force + force) * increment;
    const cumulativeWork = committed.cumulativeWork + workIncrement;
    const recoverableEnergy = stiffness > 0 ? force ** 2 / (2 * stiffness) : 0;
    const dissipatedEnergy = Math.max(
      committed.dissipatedEnergy,
      cumulativeWork - recoverableEnergy,
      0,
    );
    const deformationProgress = clamp(
      (Math.abs(deformation) - envelope.yieldDeformation) /
        Math.max(envelope.ultimateDeformation - envelope.yieldDeformation, EPS),
    );
    const energyCapacity = Math.max(capacityData.combined * envelope.ultimateDeformation, EPS);
    const energyProgress = dissipatedEnergy / energyCapacity;
    const stiffnessDamage = this.stiffnessDegradation.enabled
      ? Math.max(
          committed.stiffnessDamage,
          clamp(
            this.stiffnessDegradation.ductilityCoefficient * deformationProgress +
              this.stiffnessDegradation.energyCoefficient * energyProgress,
            0,
            this.stiffnessDegradation.limit,
          ),
        )
      : committed.stiffnessDamage;
    const strengthDamage = this.strengthDegradation.enabled
      ? Math.max(
          committed.strengthDamage,
          clamp(
            this.strengthDegradation.ductilityCoefficient * deformationProgress +
              this.strengthDegradation.energyCoefficient * energyProgress,
            0,
            this.strengthDegradation.limit,
          ),
        )
      : committed.strengthDamage;
    const damage = Math.max(stiffnessDamage, strengthDamage);
    const absoluteForce = Math.abs(force);
    const diagonalCrackingIndex =
      capacityData.diagonalTension > 0
        ? absoluteForce / capacityData.diagonalTension
        : absoluteForce === 0
          ? 0
          : Infinity;
    const slidingIndex =
      capacityData.slidingCapacity > 0
        ? absoluteForce / capacityData.slidingCapacity
        : absoluteForce === 0
          ? 0
          : Infinity;
    const mechanismsActivated = new Set(committed.mechanismsActivated);

    if (diagonalCrackingIndex >= this.mechanismActivationRatio) {
      mechanismsActivated.add("diagonal-tension");
    }

    if (slidingIndex >= this.mechanismActivationRatio) {
      mechanismsActivated.add("sliding");
    }

    const predominantMechanism =
      diagonalCrackingIndex >= slidingIndex ? "diagonal-tension" : "sliding";

    this._trialState = {
      version: STATE_VERSION,
      deformation,
      shearStrain: deformation / height,
      force,
      tangent,
      elasticStiffness: baseStiffness,
      plasticDeformation,
      damage,
      stiffnessDamage,
      strengthDamage,
      pinchingFactor,
      pinchingActive,
      pinchingPending,
      pinchingTarget,
      pinchingReversalDeformation,
      maxPositiveDeformation,
      minNegativeDeformation,
      loadingDirection: direction,
      reversalCount,
      cumulativeWork,
      dissipatedEnergy,
      capacities: {
        diagonalTension: capacityData.diagonalTension,
        sliding: capacityData.slidingCapacity,
        combined: capacityData.combined,
        residual: capacityData.residual,
      },
      diagonalCrackingIndex,
      slidingIndex,
      predominantMechanism,
      mechanismsActivated: [...mechanismsActivated],
      branch,
    };

    return force;
  }

  getForce(): number {
    return this._trialState.force;
  }

  getStress(): number {
    return this.getForce();
  }

  getTangent(): number {
    return this._trialState.tangent;
  }

  getState(): CyclicMasonryShearState {
    return cloneState(this._trialState);
  }

  getCommittedState(): CyclicMasonryShearState {
    return cloneState(this._committedState);
  }

  commitState(): number {
    this._committedState = cloneState(this._trialState);
    return 0;
  }

  revertToLastCommit(): number {
    this._trialState = cloneState(this._committedState);
    return 0;
  }

  revertToStart(): number {
    this._committedState = this.initialState();
    this._trialState = cloneState(this._committedState);
    return 0;
  }

  importState(
    state: CyclicMasonryShearState,
    { committed = true }: { committed?: boolean } = {},
  ): this {
    if (!state || state.version !== STATE_VERSION) {
      throw new Error(`CyclicMasonryShearMaterial requires state version ${STATE_VERSION}.`);
    }

    this._trialState = cloneState(state);

    if (committed) {
      this._committedState = cloneState(state);
    }

    return this;
  }

  clone(): CyclicMasonryShearMaterial {
    const cloned = new CyclicMasonryShearMaterial(this._configuration);
    cloned._committedState = cloneState(this._committedState);
    cloned._trialState = cloneState(this._trialState);
    return cloned;
  }

  toJSON(): CyclicMasonryShearMaterialJson {
    return {
      type: this.type,
      configuration: {
        ...this.configuration(),
        diagonalTensionModel: serializeModel(this.diagonalTensionModel),
        slidingModel: serializeModel(this.slidingModel),
      },
      committedState: this.getCommittedState(),
      trialState: this.getState(),
    };
  }
}
