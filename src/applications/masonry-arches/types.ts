import type { CalculationResult } from "../../core/results/CalculationResult.js";
import type {
  MasonryInterfaceLawInput,
  NormalizedMasonryInterfaceLaw,
} from "../../domain/masonry/interfaces/types.js";
import type { UnitSystem, UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type {
  RigidBlock2D,
  RigidBlockAppliedWrench2D,
  RigidBlockInterface2D,
  RigidBlockMotion2D,
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";

export const MASONRY_ARCH_MODEL_SCHEMA_VERSION = "8.0.0";
export const MASONRY_ARCH_EQUILIBRIUM_RESULT_SCHEMA_VERSION = "10.0.0";
export const MASONRY_ARCH_LIMIT_ANALYSIS_RESULT_SCHEMA_VERSION = "11.0.0";

export type MasonryArchReferenceCurve = "intrados" | "centerline" | "extrados";
export type MasonryArchAngleUnits = "deg" | "rad";
export type MasonryArchDistributionBasis = "horizontal-projection" | "arc-length";
export type MasonryArchLoadApplicationCurve = MasonryArchReferenceCurve;
export type MasonryArchTendonSide = "intrados" | "extrados";

/** Engineering purpose of an analysis, independent from its mechanical model and solver control. */
export type MasonryArchAnalysisObjective = "design-state-check" | "capacity" | "advanced-path";

export type MasonryArchContinuationControlType = "load" | "displacement" | "arc-length";

export type MasonryArchMechanicalResponse =
  | "rigid-plastic-resultant-domain"
  | "deformable-zero-thickness-interfaces";

export type MasonryArchNumericalStrategy =
  | {
      readonly type: "representative-static-equilibrium";
      readonly control: null;
    }
  | {
      readonly type: "direct-static-limit";
      readonly control: null;
    }
  | {
      readonly type: "incremental-continuation";
      readonly control: MasonryArchContinuationControlType;
    };

export type MasonryArchLambdaExcludedQuantity =
  | "initial-tendon-force"
  | "passive-tendon-compatibility-force"
  | "support-reactions"
  | "contact-actions"
  | "deviator-actions"
  | "other-solved-response-quantities";

/** Complete, analysis-local definition of the load proportionality parameter. */
export interface MasonryArchLambdaDefinition {
  readonly active: boolean;
  readonly expression: "F(lambda) = F_fixed + lambda * F_scalable";
  readonly combinationFactorsAppliedBeforePartition: true;
  readonly fixedLoadCaseIds: readonly string[];
  readonly scalableLoadCaseIds: readonly string[];
  readonly baseCombinationFactorsByCaseId: Readonly<Record<string, number>>;
  readonly effectiveLoadFactorsByCaseId: Readonly<Record<string, number | null>>;
  readonly currentValue: number | null;
  readonly lambdaEqualsOneMeaning: string;
  readonly excludedQuantities: readonly MasonryArchLambdaExcludedQuantity[];
}

/** The three independent semantic levels governing one masonry-arch analysis. */
export interface MasonryArchAnalysisDescriptor {
  readonly analysisObjective: MasonryArchAnalysisObjective;
  readonly mechanicalModel: {
    readonly blockModel: "rigid-voussoir-chain";
    readonly interfaceResponse: MasonryArchMechanicalResponse;
    readonly constitutiveResponse: NormalizedMasonryInterfaceLaw["response"];
    readonly kinematics: "reference-geometry" | "finite-rigid-block";
  };
  readonly numericalStrategy: MasonryArchNumericalStrategy;
  readonly lambda: MasonryArchLambdaDefinition;
}

export type MasonryArchObjectiveStatus =
  | "satisfied"
  | "not-satisfied"
  | "not-reached"
  | "not-verifiable";

export interface MasonryArchAnalysisOutcome {
  readonly objective: MasonryArchAnalysisObjective;
  readonly objectiveStatus: MasonryArchObjectiveStatus;
  readonly terminationCategory:
    | "engineering-target"
    | "physical-limit"
    | "numerical-failure"
    | "model-boundary";
  readonly lambdaAtTermination: number | null;
}

export type MasonryArchEngineeringAssessmentStatus = "PASS" | "FAIL" | "INDETERMINATE";

/**
 * Machine-readable engineering question answered by an assessment. These literals are part of the
 * public contract; consumers select on them instead of comparing free-form strings.
 */
export type MasonryArchEngineeringAssessmentQuestion =
  | "does-the-assigned-load-state-admit-a-verified-statically-admissible-equilibrium"
  | "can-reach-lambda-one-with-admissible-equilibrium-and-prescribed-criteria";

export const MASONRY_ARCH_EQUILIBRIUM_ASSESSMENT_QUESTION =
  "does-the-assigned-load-state-admit-a-verified-statically-admissible-equilibrium";
export const MASONRY_ARCH_PATH_ASSESSMENT_QUESTION =
  "can-reach-lambda-one-with-admissible-equilibrium-and-prescribed-criteria";

/**
 * Shared vocabulary of structural phenomena observed or verified during a masonry-arch analysis.
 * Observable, warning, and numerical kinds never fail an engineering check on their own; the
 * physical-limit subset is what the design-state semantics treats as a failed criterion.
 */
export type MasonryArchEventKind =
  | "joint-opened"
  | "joint-closed"
  | "sliding-started"
  | "plastic-sliding"
  | "compression-strength-reached"
  | "crushing"
  | "passive-tendon-activated"
  | "tendon-slackened"
  | "reinforcement-yielded"
  | "reinforcement-rupture"
  | "bonded-layer-capacity-reached"
  | "extrados-contact-active-set-changed"
  | "extrados-contact-invalid"
  | "equilibrium-limit-point"
  | "convergence-lost";

/**
 * A certified global limit point of the primary equilibrium branch: the continuation tangent's
 * load component reverses sign between two consecutive converged states. It is a global branch
 * property, never a local plastic event, and it is always verification-blocking: it prevents
 * reaching the design state on the followed branch. It is deliberately NOT part of
 * `MasonryArchPhysicalLimitEventKind`, so it cannot be enabled or disabled through
 * `designFailureEvents` and is never a local-limit criterion.
 */
export type MasonryArchGlobalBranchEventKind = "equilibrium-limit-point";

/** Event kinds that describe a violated physical or mechanical limit of the assigned model. */
export type MasonryArchPhysicalLimitEventKind =
  | "plastic-sliding"
  | "compression-strength-reached"
  | "crushing"
  | "reinforcement-yielded"
  | "reinforcement-rupture"
  | "bonded-layer-capacity-reached"
  | "extrados-contact-invalid";

/**
 * Event kinds that a design-state path analysis may treat as a failed engineering criterion.
 * Restricted to the physical-limit taxonomy: observable, warning, and numerical-failure event
 * kinds can never be configured as design failures, so a numerical event can never produce a
 * FAIL verdict.
 */
export type MasonryArchDesignFailureEventKind = MasonryArchPhysicalLimitEventKind;

/**
 * Named underlying public checks that can produce a failed engineering criterion. Used to
 * disambiguate criterion kinds that aggregate several checks, for example `reinforcement-rupture`
 * produced by tensile strength or by ultimate strain. The values match the producing checks'
 * `criterion` literals.
 */
export type MasonryArchEngineeringCheckId =
  | "coulomb-friction"
  | "finite-compression-uniform-edge-block"
  | "deformable-interface-compression-strength"
  | "reinforcement-yield-stress"
  | "reinforcement-tensile-strength"
  | "reinforcement-ultimate-strain"
  | "equilibrium-limit-point";

/**
 * Taxonomy of failed engineering criteria. Only conditions that can genuinely make a verification
 * FAIL belong here: the physical-limit event kinds plus the global assigned-state
 * `equilibrium-infeasible` verdict and the certified global `equilibrium-limit-point`.
 * Observable, warning, and numerical event kinds are part of the event taxonomy, never of the
 * failed-criterion taxonomy.
 */
export type MasonryArchEngineeringCriterionKind =
  | MasonryArchPhysicalLimitEventKind
  | "equilibrium-limit-point"
  | "equilibrium-infeasible";

/**
 * One violated structural criterion. Every quantity is reported only when the producing analysis
 * actually knows it; unknown quantities are null and are never inferred from unrelated results.
 */
export interface MasonryArchEngineeringCriterion {
  readonly kind: MasonryArchEngineeringCriterionKind;
  /**
   * Identifies the specific underlying public check that failed when the kind aggregates several
   * checks. Null when the producing analysis publishes no named check for the criterion.
   */
  readonly checkId: MasonryArchEngineeringCheckId | null;
  /** Physical entities involved, for example interface, reinforcement, device, or contact IDs. */
  readonly entityIds: readonly string[];
  /** Load-proportionality parameter at which the criterion was identified; null when not applicable. */
  readonly lambda: number | null;
  readonly demand: number | null;
  readonly capacity: number | null;
  readonly utilizationRatio: number | null;
}

/**
 * Structured engineering verdict shared by the equilibrium and path analyses. The failed criteria
 * identify the violated conditions; the failure mode classifies the global mechanism separately.
 */
export interface MasonryArchEngineeringAssessment {
  /** The engineering question answered by this assessment. */
  readonly question: MasonryArchEngineeringAssessmentQuestion;
  /** Engineering verdict; a numerical process failure is INDETERMINATE, never FAIL. */
  readonly status: MasonryArchEngineeringAssessmentStatus;
  /**
   * Lambda of the load state the verdict refers to: 1 for assigned-state analyses and PASS
   * verdicts, the state where the verdict was decided on FAIL (0 when the fixed state itself
   * fails), and the last verified state when available on INDETERMINATE; null when no such
   * state exists. This is the assessed load state, never a capacity: a design failure whose
   * limit analysis returns lambda = 0.72 still reports 1 here.
   */
  readonly lambda: number | null;
  /** All criteria identified as not satisfied; a FAIL state never selects a single "worst" one. */
  readonly failedCriteria: readonly MasonryArchEngineeringCriterion[];
  /**
   * Global mechanism classification. Describes only a FAIL verdict: null for PASS and
   * INDETERMINATE, a physical mode or "undetermined" for FAIL.
   */
  readonly failureMode: MasonryArchFailureMode | null;
}

/** Load-pattern landmarks. Step identifiers are available only for incremental analyses. */
export interface MasonryArchCapacityLandmarks {
  readonly lambdaFirstLimit: number | null;
  /**
   * Certified global maximum load factor on the primary equilibrium branch. For incremental
   * path analysis this is populated only by a positively certified two-sided branch turn;
   * sampled maxima remain available solely as `convergenceInfo.maximumObservedLambda`.
   */
  readonly lambdaPeak: number | null;
  readonly lambdaTermination: number | null;
  readonly lambdaCollapse: number | null;
  /**
   * Lambda of the first event that makes satisfying the design verification at lambda = 1
   * impossible on the followed primary branch: a certified global equilibrium limit point below
   * one, terminal crushing, reinforcement or bonded-layer failure, or another genuinely
   * design-blocking criterion. It is deliberately distinct from `lambdaFirstLimit`: a first local
   * plastic sliding that redistributes does not move this value. Null when the design state
   * passed, when the verification stopped at the fixed state, or when the process could not
   * certify any blocking event (INDETERMINATE). For capacity-only analyses the design semantics
   * do not apply and the value is null.
   */
  readonly lambdaVerificationLimit: number | null;
  readonly steps: {
    readonly firstLimit: number | null;
    readonly peak: number | null;
    readonly termination: number | null;
    readonly collapse: number | null;
    readonly verificationLimit: number | null;
  };
  readonly collapseDefinition: string | null;
}

export interface CircularMasonryArchProfileInput {
  readonly type: "circular";
}

export interface EllipticalMasonryArchProfileInput {
  readonly type: "elliptical";
  readonly springingAngle: number;
  readonly angleUnits: MasonryArchAngleUnits;
}

export type SimplifiedMasonryArchProfileInput =
  | CircularMasonryArchProfileInput
  | EllipticalMasonryArchProfileInput;

export interface MasonryArchKeystoneInput {
  /** Length measured along the selected reference curve. */
  readonly arcLength: number;
}

export interface SimplifiedSymmetricMasonryArchGeometryInput {
  readonly kind: "simplified-symmetric";
  readonly referenceCurve: MasonryArchReferenceCurve;
  readonly profile: SimplifiedMasonryArchProfileInput;
  readonly span: number;
  readonly rise: number;
  readonly thickness: number;
  readonly outOfPlaneWidth: number;
  readonly voussoirCount: number;
  readonly keystone?: MasonryArchKeystoneInput;
  readonly stationing?: "equal-arc-length";
}

export type MasonryArchGeometryInput = SimplifiedSymmetricMasonryArchGeometryInput;

export interface MasonryArchLoadCaseReference {
  readonly id?: string | null;
}

interface MasonryArchLoadBaseInput {
  readonly id: string;
  readonly loadCaseId?: string;
  readonly loadCase?: MasonryArchLoadCaseReference | null;
}

export interface MasonryArchSelfWeightLoadInput extends MasonryArchLoadBaseInput {
  readonly type: "self-weight";
}

interface MasonryArchDistributedLoadInput extends MasonryArchLoadBaseInput {
  /** Force-per-length components expressed in the declared model units. */
  readonly components: RigidBlockVector2D;
  readonly distributionBasis?: MasonryArchDistributionBasis;
  /** Curve whose `dx` or `ds` measures the distributed-load intensity. */
  readonly distributionCurve?: MasonryArchReferenceCurve;
  readonly applicationCurve?: MasonryArchLoadApplicationCurve;
}

export interface MasonryArchUniformLoadInput extends MasonryArchDistributedLoadInput {
  readonly type: "uniform";
}

export interface MasonryArchPatchLoadInput extends MasonryArchDistributedLoadInput {
  readonly type: "patch";
  readonly startStation: number;
  readonly endStation: number;
}

export interface MasonryArchFillLoadInput extends MasonryArchLoadBaseInput {
  readonly type: "fill";
  /** Fill unit weight in force per volume. */
  readonly unitWeight: number;
  readonly crownCoverDepth?: number;
  readonly startStation?: number;
  readonly endStation?: number;
}

export interface MasonryArchPointLoadInput extends MasonryArchLoadBaseInput {
  readonly type: "point";
  readonly station: number;
  readonly force: RigidBlockVector2D;
  readonly moment?: number;
  readonly applicationCurve?: MasonryArchLoadApplicationCurve;
  readonly targetVoussoirId?: string;
}

export type MasonryArchLoadInput =
  | MasonryArchSelfWeightLoadInput
  | MasonryArchUniformLoadInput
  | MasonryArchPatchLoadInput
  | MasonryArchFillLoadInput
  | MasonryArchPointLoadInput;

export interface MasonryArchMasonryInput {
  /** Masonry unit weight in force per volume. Required when self-weight is present. */
  readonly unitWeight?: number;
}

export interface MasonryArchRigidContactSupportInput {
  readonly type: "rigid-contact";
  readonly interfaceLaw?: MasonryInterfaceLawInput;
}

export interface MasonryArchSupportsInput {
  readonly left?: MasonryArchRigidContactSupportInput;
  readonly right?: MasonryArchRigidContactSupportInput;
}

/**
 * Terminal arch anchor: the tendon ends at a geometrically assigned point of the arch side
 * boundary. The anchor belongs to the voussoir at that station and moves with it; the terminal
 * force is applied to the arch at the anchor location. The left and right stations are
 * independent and are not required to coincide with the springing voussoirs.
 *
 * The library computes only the mechanical action the tendon transmits to the device. Local
 * anchorage resistance and detailing are outside the masonry-arch model.
 */
export interface ArchTerminalArchAnchorInput {
  readonly type: "arch-anchor";
  /**
   * Normalized position along the reinforcement side boundary: 0 at the left springing, 1 at the
   * right springing, measured by side-boundary arc length. `0 <= station <= 1`.
   */
  readonly station: number;
}

/**
 * Intrados external anchor and its real arch-side transfer/deviator station. The fixed global
 * anchor belongs to no voussoir; the stationed transfer device does, moves with the arch, and
 * turns the free branch into the intrados tendon path. Local device resistance is outside this
 * model.
 */
export interface IntradosTerminalExternalAnchorInput {
  readonly type: "external-anchor";
  /** Normalized intrados side-arc station of the physical transfer device. */
  readonly station: number;
  /** Fixed global point of the tendon end, expressed in the declared model units. */
  readonly point: RigidBlockPoint2D;
}

/**
 * Extrados external anchor: the actual fixed global cable endpoint. No contact station or hidden
 * arch-side saddle belongs to this input; cable contact is solved by the unilateral envelope.
 */
export interface ExtradosTerminalExternalAnchorInput {
  readonly type: "external-anchor";
  readonly point: RigidBlockPoint2D;
}

export type IntradosArchReinforcementTerminationInput =
  | ArchTerminalArchAnchorInput
  | IntradosTerminalExternalAnchorInput;

export type ExtradosArchReinforcementTerminationInput =
  | ArchTerminalArchAnchorInput
  | ExtradosTerminalExternalAnchorInput;

/** One arch-side device identified by its normalized side-boundary station. */
export interface ArchStationedDeviceInput {
  /** Normalized position along the side boundary, measured by side-boundary arc length. */
  readonly station: number;
}

/**
 * Interior direction-change devices along the intrados path. Deviators never include the path
 * terminals: with `uniform-count` `n`, deviators are placed at the normalized side stations
 * `1/(n+1), ..., n/(n+1)`, so an odd `n` places one deviator at the crown of a symmetric arch.
 */
export type ArchDeviatorLayoutInput =
  | {
      readonly type: "uniform-count";
      readonly count: number;
    }
  | {
      readonly type: "stations";
      readonly deviators: readonly ArchStationedDeviceInput[];
    };

interface MasonryArchDiscreteReinforcementBaseInput {
  readonly id: string;
  readonly area: number;
  readonly elasticModulus: number;
  /**
   * Assigned initial tendon force: zero defines a passive reinforcement whose force develops from
   * geometric compatibility; positive defines an active (post-tensioned) reinforcement. The
   * initial force is a fixed internal quantity and never participates in the load-proportionality
   * parameter lambda.
   */
  readonly initialForce: number;
  readonly yieldStrength?: number;
  readonly tensileStrength?: number;
  readonly ultimateStrain?: number;
}

export interface IntradosArchReinforcementInput extends MasonryArchDiscreteReinforcementBaseInput {
  readonly side: "intrados";
  readonly topology:
    | {
        readonly type: "open";
        readonly left: IntradosArchReinforcementTerminationInput;
        readonly right: IntradosArchReinforcementTerminationInput;
        /** Interior deviators; defaults to one crown deviator (`uniform-count` 1). */
        readonly deviators?: ArchDeviatorLayoutInput;
      }
    | {
        readonly type: "closed-loop";
        readonly leftReturnDeviator: ArchStationedDeviceInput;
        readonly rightReturnDeviator: ArchStationedDeviceInput;
        /** Interior deviators; defaults to one crown deviator (`uniform-count` 1). */
        readonly deviators?: ArchDeviatorLayoutInput;
      };
}

export interface ExtradosArchReinforcementInput extends MasonryArchDiscreteReinforcementBaseInput {
  readonly side: "extrados";
  readonly topology: {
    readonly type: "open";
    readonly left: ExtradosArchReinforcementTerminationInput;
    readonly right: ExtradosArchReinforcementTerminationInput;
    readonly interaction?: {
      readonly type: "unilateral-contact";
      /** Numerical straight segments used to integrate cable-to-arch contact. */
      readonly segmentCount?: number;
    };
  };
}

export type ArchReinforcementInput =
  | IntradosArchReinforcementInput
  | ExtradosArchReinforcementInput;

export type BondedLayerMaterialFamily = "frcm" | "frp" | "sfrm";

/**
 * Passive zero-thickness layer bonded to one arch boundary. `startStation` and `endStation` bound
 * the EFFECTIVE structural layer: inside the interval the layer is immediately effective at its
 * full assigned capacity under the limit-analysis model, outside it is absent. The user is
 * responsible for already accounting for anchorage/development length, manufacturer or product
 * requirements, mechanical anchoring, and other local bond considerations; the model applies no
 * automatic development, transfer, or end-reduction factor.
 */
export interface BondedLayerReinforcementInput {
  readonly id: string;
  readonly family: BondedLayerMaterialFamily;
  readonly side: "intrados" | "extrados";
  /** Effective tensile area; SFRM is represented by an equivalent membrane area. */
  readonly area: number;
  readonly elasticModulus: number;
  readonly tensileStrength?: number;
  /**
   * Assigned equivalent limiting strain used to derive the axial tensile-force cap
   * `area * elasticModulus * debondingStrain` in the simplified static bonded-layer model. It is
   * not a bond-slip, development-length, interface-shear, peeling, fracture-energy, or physical
   * debonding-propagation model.
   */
  readonly debondingStrain?: number;
  readonly ultimateStrain?: number;
  /**
   * Normalized side-boundary station at which the effective layer starts. Must
   * satisfy `0 <= startStation < endStation <= 1`.
   */
  readonly startStation: number;
  /** Normalized side-boundary station at which the effective layer ends. */
  readonly endStation: number;
}

export interface MasonryArchModelInput {
  readonly id: string;
  readonly units: UnitSystemInput;
  readonly geometry: MasonryArchGeometryInput;
  readonly masonry?: MasonryArchMasonryInput;
  readonly interfaceLaw: MasonryInterfaceLawInput;
  readonly supports?: MasonryArchSupportsInput;
  readonly loads?: readonly MasonryArchLoadInput[];
  readonly reinforcements?: readonly ArchReinforcementInput[];
  readonly bondedLayers?: readonly BondedLayerReinforcementInput[];
  readonly metadata?: Record<string, unknown>;
}

export interface NormalizedCircularMasonryArchProfile {
  readonly type: "circular";
  readonly radius: number;
  readonly center: RigidBlockPoint2D;
  readonly halfAngle: number;
  readonly springingAngle: number;
}

export interface NormalizedEllipticalMasonryArchProfile {
  readonly type: "elliptical";
  readonly semiAxisX: number;
  readonly semiAxisY: number;
  readonly halfParameter: number;
  readonly springingAngle: number;
}

export type NormalizedMasonryArchProfile =
  | NormalizedCircularMasonryArchProfile
  | NormalizedEllipticalMasonryArchProfile;

export interface MasonryArchCurveSample {
  readonly station: number;
  readonly normalizedStation: number;
  readonly intrados: RigidBlockPoint2D;
  readonly centerline: RigidBlockPoint2D;
  readonly extrados: RigidBlockPoint2D;
  readonly referencePoint: RigidBlockPoint2D;
  readonly chainTangent: RigidBlockVector2D;
  readonly outwardNormal: RigidBlockVector2D;
  /** Arc-length derivative of each offset curve with respect to reference-curve arc length. */
  readonly arcLengthJacobian: Readonly<Record<MasonryArchReferenceCurve, number>>;
}

export interface MasonryArchInterfaceGeometry extends RigidBlockInterface2D {
  readonly station: number;
  readonly normalizedStation: number;
  readonly intradosPoint: RigidBlockPoint2D;
  readonly extradosPoint: RigidBlockPoint2D;
}

export interface MasonryArchVoussoirGeometry extends RigidBlock2D {
  readonly startStation: number;
  readonly endStation: number;
  readonly referenceArcLength: number;
  readonly isKeystone: boolean;
}

export interface NormalizedMasonryArchGeometry {
  readonly kind: "simplified-symmetric";
  readonly referenceCurve: MasonryArchReferenceCurve;
  readonly profile: NormalizedMasonryArchProfile;
  readonly span: number;
  readonly rise: number;
  readonly thickness: number;
  readonly outOfPlaneWidth: number;
  readonly totalReferenceArcLength: number;
  readonly voussoirCount: number;
  readonly keystone: {
    readonly present: boolean;
    readonly arcLength: number | null;
    readonly voussoirId: string | null;
  };
  readonly curveSamples: readonly MasonryArchCurveSample[];
  readonly interfaces: readonly MasonryArchInterfaceGeometry[];
  readonly voussoirs: readonly MasonryArchVoussoirGeometry[];
  readonly approximation: {
    readonly polygonArea: number;
    readonly maximumJointLengthDeviation: number;
  };
}

interface NormalizedMasonryArchLoadBase {
  readonly id: string;
  readonly loadCaseId: string;
  readonly type: MasonryArchLoadInput["type"];
}

export interface NormalizedMasonryArchSelfWeightLoad extends NormalizedMasonryArchLoadBase {
  readonly type: "self-weight";
}

export interface NormalizedMasonryArchUniformLoad extends NormalizedMasonryArchLoadBase {
  readonly type: "uniform";
  readonly components: RigidBlockVector2D;
  readonly distributionBasis: MasonryArchDistributionBasis;
  readonly distributionCurve: MasonryArchReferenceCurve;
  readonly applicationCurve: MasonryArchLoadApplicationCurve;
}

export interface NormalizedMasonryArchPatchLoad extends NormalizedMasonryArchLoadBase {
  readonly type: "patch";
  readonly components: RigidBlockVector2D;
  readonly distributionBasis: MasonryArchDistributionBasis;
  readonly distributionCurve: MasonryArchReferenceCurve;
  readonly applicationCurve: MasonryArchLoadApplicationCurve;
  readonly startStation: number;
  readonly endStation: number;
}

export interface NormalizedMasonryArchFillLoad extends NormalizedMasonryArchLoadBase {
  readonly type: "fill";
  readonly unitWeight: number;
  readonly crownCoverDepth: number;
  readonly startStation: number;
  readonly endStation: number;
}

export interface NormalizedMasonryArchPointLoad extends NormalizedMasonryArchLoadBase {
  readonly type: "point";
  readonly station: number;
  readonly force: RigidBlockVector2D;
  readonly moment: number;
  readonly applicationCurve: MasonryArchLoadApplicationCurve;
  readonly targetVoussoirId: string | null;
}

export type NormalizedMasonryArchLoad =
  | NormalizedMasonryArchSelfWeightLoad
  | NormalizedMasonryArchUniformLoad
  | NormalizedMasonryArchPatchLoad
  | NormalizedMasonryArchFillLoad
  | NormalizedMasonryArchPointLoad;

export type NormalizedIntradosArchReinforcementTermination =
  | {
      readonly type: "arch-anchor";
      /** Normalized side-boundary station (0 = left springing, 1 = right springing). */
      readonly station: number;
    }
  | {
      readonly type: "external-anchor";
      /** Normalized station of the arch-side terminal device. */
      readonly station: number;
      readonly point: RigidBlockPoint2D;
    };

export type NormalizedExtradosArchReinforcementTermination =
  | {
      readonly type: "arch-anchor";
      /** Normalized extrados side-arc station (0 = left springing, 1 = right springing). */
      readonly station: number;
    }
  | {
      readonly type: "external-anchor";
      /** Fixed global cable endpoint; the contact boundary is solver state, not input data. */
      readonly point: RigidBlockPoint2D;
    };

/** One arch-side device identified by its normalized side-boundary station. */
export interface NormalizedArchStationedDevice {
  readonly station: number;
}

interface NormalizedArchReinforcementBase {
  readonly id: string;
  readonly area: number;
  readonly elasticModulus: number;
  readonly initialForce: number;
  readonly yieldStrength: number | null;
  readonly tensileStrength: number | null;
  readonly ultimateStrain: number | null;
}

export interface NormalizedIntradosOpenArchReinforcement extends NormalizedArchReinforcementBase {
  readonly side: "intrados";
  readonly topology: {
    readonly type: "open";
    readonly left: NormalizedIntradosArchReinforcementTermination;
    readonly right: NormalizedIntradosArchReinforcementTermination;
    /** Interior deviators, sorted by increasing station; terminals are never deviators. */
    readonly deviators: readonly NormalizedArchStationedDevice[];
  };
}

export interface NormalizedIntradosClosedLoopArchReinforcement
  extends NormalizedArchReinforcementBase {
  readonly side: "intrados";
  readonly topology: {
    readonly type: "closed-loop";
    readonly leftReturnDeviator: NormalizedArchStationedDevice;
    readonly rightReturnDeviator: NormalizedArchStationedDevice;
    /** Interior deviators, sorted by increasing station. */
    readonly deviators: readonly NormalizedArchStationedDevice[];
  };
}

export interface NormalizedExtradosArchReinforcement extends NormalizedArchReinforcementBase {
  readonly side: "extrados";
  readonly topology: {
    readonly type: "open";
    readonly left: NormalizedExtradosArchReinforcementTermination;
    readonly right: NormalizedExtradosArchReinforcementTermination;
    readonly interaction: {
      readonly type: "unilateral-contact";
      readonly segmentCount: number;
    };
  };
}

export type NormalizedArchReinforcement =
  | NormalizedIntradosOpenArchReinforcement
  | NormalizedIntradosClosedLoopArchReinforcement
  | NormalizedExtradosArchReinforcement;

export interface NormalizedBondedLayerReinforcement {
  readonly id: string;
  readonly family: BondedLayerMaterialFamily;
  readonly side: "intrados" | "extrados";
  readonly area: number;
  readonly elasticModulus: number;
  readonly tensileStrength: number | null;
  readonly debondingStrain: number | null;
  readonly ultimateStrain: number | null;
  /** Boundaries of the EFFECTIVE structural layer, measured by side-boundary arc length. */
  readonly startStation: number;
  readonly endStation: number;
  readonly tensileCapacity: number;
  readonly governingCapacityLimit: "tensile-strength" | "debonding-strain" | "ultimate-strain";
}

export interface NormalizedMasonryArchModel {
  readonly schemaVersion: typeof MASONRY_ARCH_MODEL_SCHEMA_VERSION;
  readonly id: string;
  readonly sourceUnits: UnitSystem;
  readonly units: UnitSystem;
  readonly geometry: NormalizedMasonryArchGeometry;
  readonly masonry: {
    readonly unitWeight: number | null;
  };
  readonly interfaceLaw: NormalizedMasonryInterfaceLaw;
  readonly supports: {
    readonly left: {
      readonly type: "rigid-contact";
      readonly interfaceLaw: NormalizedMasonryInterfaceLaw;
    };
    readonly right: {
      readonly type: "rigid-contact";
      readonly interfaceLaw: NormalizedMasonryInterfaceLaw;
    };
  };
  readonly loads: readonly NormalizedMasonryArchLoad[];
  readonly reinforcements: readonly NormalizedArchReinforcement[];
  readonly bondedLayers: readonly NormalizedBondedLayerReinforcement[];
  readonly metadata: Record<string, unknown>;
}

export interface MasonryArchLoadCombinationFactorLike {
  readonly loadCase: MasonryArchLoadCaseReference;
  readonly factor: number;
}

export interface MasonryArchLoadCombinationLike {
  readonly id?: string | null;
  readonly combinationType?: string | null;
  readonly factors: readonly MasonryArchLoadCombinationFactorLike[];
}

export interface AnalyzeMasonryArchEquilibriumOptions {
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  readonly loadFactorsByCaseId?: Readonly<Record<string, number>>;
  readonly equilibriumTolerance?: number;
  readonly hingeTolerance?: number;
  /** Simplex iteration budget for the representative-equilibrium optimization. */
  readonly maxSimplexIterations?: number;
}

export interface AnalyzeMasonryArchLimitOptions {
  readonly loadCombination?: MasonryArchLoadCombinationLike | null;
  /** Load cases whose already-factored contribution is multiplied by lambda. */
  readonly scalableLoadCaseIds: readonly string[];
  readonly equilibriumTolerance?: number;
  readonly hingeTolerance?: number;
  readonly activeConstraintTolerance?: number;
  readonly simplexTolerance?: number;
  readonly maxSimplexIterations?: number;
  readonly nonAssociatedTolerance?: number;
  readonly maxNonAssociatedIterations?: number;
}

export interface MasonryArchBlockDisplacementInput {
  readonly blockId: string;
  /** Translation expressed in `MasonryArchPrescribedConfigurationInput.units.length`. */
  readonly translation: RigidBlockVector2D;
  /** Finite counter-clockwise rotation in radians. */
  readonly rotation: number;
}

export interface MasonryArchPrescribedConfigurationInput {
  readonly units: UnitSystemInput;
  /** Blocks omitted from this array retain their reference configuration. */
  readonly blockDisplacements: readonly MasonryArchBlockDisplacementInput[];
}

export interface NormalizedMasonryArchBlockDisplacement {
  readonly blockId: string;
  readonly translation: RigidBlockVector2D;
  readonly rotation: number;
}

export interface MasonryArchAppliedLoadResult {
  readonly loadId: string;
  readonly loadCaseId: string;
  readonly factor: number;
  readonly resultantForce: RigidBlockVector2D;
  readonly resultantMomentAboutOrigin: number;
}

export interface MasonryArchBlockLoadResult extends RigidBlockAppliedWrench2D {
  readonly sourceLoadIds: readonly string[];
}

export type ArchReinforcementState =
  | "slack"
  | "active-passive"
  | "active-post-tensioned"
  | "yielded"
  | "failed";

export type ArchReinforcementTopologyKind = "open" | "closed-loop";

export type ArchDeviceKind =
  | "terminal-arch-anchor"
  | "external-anchor"
  | "arch-side-terminal"
  | "deviator"
  | "return-deviator";

export type ArchReinforcementSegmentRole =
  | "along-side"
  | "free-terminal-branch"
  | "return-branch"
  | "contact-envelope";

export interface ArchReinforcementSegmentResult {
  readonly index: number;
  /** Reference material location corresponding to the current segment start. */
  readonly referenceStartPoint: RigidBlockPoint2D;
  /** Reference material location corresponding to the current segment end. */
  readonly referenceEndPoint: RigidBlockPoint2D;
  readonly startPoint: RigidBlockPoint2D;
  readonly endPoint: RigidBlockPoint2D;
  /** Normalized side-boundary station of the start point; null at a free external end. */
  readonly startStation: number | null;
  /** Normalized side-boundary station of the end point; null at a free external end. */
  readonly endStation: number | null;
  /**
   * Distance between the two corresponding reference material points. When extrados contact
   * migrates, current segments need not partition `state.referencePath`; the complete constitutive
   * reference length remains `state.referenceLength`.
   */
  readonly referenceLength: number;
  readonly length: number;
  /**
   * Cable tension in this segment. Constant along the whole tendon because deviators are
   * frictionless and the elastic force increment follows the complete path length.
   */
  readonly tension: number;
  /** Geometric role of the segment in the tendon path. */
  readonly role: ArchReinforcementSegmentRole;
}

/**
 * Solver-resolved geometry of one physical reinforcement device. Together with `segments`,
 * `referencePath`, and `path` this is the complete geometry the mechanics actually used; a UI
 * must be able to draw the reinforcement directly from it without a parallel geometry model.
 */
export interface ArchReinforcementDeviceGeometryResult {
  readonly deviceId: string;
  readonly kind: ArchDeviceKind;
  readonly terminationSide: "left" | "right" | null;
  /** Normalized side-boundary station; null for external anchors. */
  readonly station: number | null;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  /** False only for external anchors, which belong to no voussoir. */
  readonly attachedToArch: boolean;
}

/**
 * Reinforcement free-body diagnostic. For an open tendon the arch-side device/contact actions plus
 * the external-anchor reactions close the tendon free body; for a closed loop every force the loop
 * exerts on its support devices must self-equilibrate. This is a solver/model-consistency
 * diagnostic and never an engineering PASS/FAIL criterion.
 */
export interface ArchReinforcementEquilibriumDiagnostic {
  readonly meaning: "open-tendon-free-body" | "closed-loop-self-equilibrium";
  /** Sum of the resultant forces the tendon applies through arch devices and masonry contact. */
  readonly archActionForceSum: RigidBlockVector2D;
  /** Sum of the forces transmitted to external anchors. */
  readonly externalAnchorForceSum: RigidBlockVector2D;
  /** `archActionForceSum + externalAnchorForceSum`; must vanish within tolerance. */
  readonly residualForce: RigidBlockVector2D;
  /** Moment about the global origin of every device force; must vanish within tolerance. */
  readonly residualMoment: number;
  readonly normalizedResidual: {
    /** `|residualForce| / tension`; zero while the tendon is slack. */
    readonly force: number;
    /** `|residualMoment| / (tension * max(1, referenceLength))`; zero while slack. */
    readonly moment: number;
  };
  readonly tolerance: number;
  readonly satisfied: boolean;
}

export type ExtradosContactBoundaryKind = "smooth-tangency" | "joint-contact" | "arch-anchor";

export interface ExtradosContactBoundaryPointResult {
  /** Normalized physical extrados side-arc station of the contacted masonry material point. */
  readonly normalizedSideArcStation: number;
  /** Station of the same material point on the geometry reference curve. */
  readonly referenceCurveStation: number;
  readonly kind: ExtradosContactBoundaryKind;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
}

export interface ExtradosContactIntervalResult {
  readonly start: ExtradosContactBoundaryPointResult;
  readonly end: ExtradosContactBoundaryPointResult;
}

/**
 * Reference and current material locations at which an extrados cable enters and leaves masonry
 * contact. Current stations remain normalized coordinates on the reference extrados side arc;
 * they identify moving material locations, not spatial projection coordinates. Null means the
 * cable spans its endpoints without touching the extrados.
 */
export interface ExtradosContactBoundaryStateResult {
  readonly reference: ExtradosContactIntervalResult | null;
  readonly current: ExtradosContactIntervalResult | null;
}

export interface ArchReinforcementStateResult {
  readonly reinforcementId: string;
  readonly side: "intrados" | "extrados";
  readonly topology: ArchReinforcementTopologyKind;
  readonly force: number;
  readonly trialForce: number;
  readonly initialForce: number;
  readonly elasticForceIncrement: number;
  readonly axialStress: number;
  readonly elasticStrain: number;
  readonly geometricStrain: number;
  readonly state: ArchReinforcementState;
  /** Total reference length of the complete tendon path, including free and return branches. */
  readonly referenceLength: number;
  /** Total current length of the complete tendon path. */
  readonly currentLength: number;
  readonly elongation: number;
  /** Absolute path-length change at or below this numerical tolerance is treated as zero. */
  readonly elongationTolerance: number;
  /** Elastic member length used for the force increment; equals the complete reference length. */
  readonly effectiveElasticLength: number;
  readonly elasticTangentStiffness: number;
  /**
   * Independently resolved reference cable polyline, including external anchors and the
   * closed-loop return branch. It may have a different node count from `path` after contact
   * migration.
   */
  readonly referencePath: readonly RigidBlockPoint2D[];
  /** Complete deformed polyline actually used by the mechanics. */
  readonly path: readonly RigidBlockPoint2D[];
  readonly segments: readonly ArchReinforcementSegmentResult[];
  /** Every physical device of the tendon, in path order, with its resolved geometry. */
  readonly devices: readonly ArchReinforcementDeviceGeometryResult[];
  /** Null for intrados tendons; machine-readable reference/current contact state for extrados. */
  readonly contactBoundary: ExtradosContactBoundaryStateResult | null;
  readonly equilibrium: ArchReinforcementEquilibriumDiagnostic;
  readonly checks: {
    readonly yielding: {
      readonly criterion: "reinforcement-yield-stress";
      readonly demand: number;
      readonly capacity: number;
      readonly utilizationRatio: number;
      readonly status: "pass" | "fail";
    } | null;
    readonly tensileFailure: {
      readonly criterion: "reinforcement-tensile-strength";
      readonly demand: number;
      readonly capacity: number;
      readonly utilizationRatio: number;
      readonly status: "pass" | "fail";
    } | null;
    readonly ultimateStrain: {
      readonly criterion: "reinforcement-ultimate-strain";
      readonly demand: number;
      readonly capacity: number;
      readonly utilizationRatio: number;
      readonly status: "pass" | "fail";
    } | null;
  };
}

/**
 * Force state of one physical reinforcement device. The reported resultant satisfies
 * `F = T_out * t_out - T_in * t_in` with the directions pointing along the cable into and out of
 * the device; the current scope is frictionless (`T_in === T_out`), but both tensions are
 * published separately so the contract survives a future friction model. A tendon ending on the
 * arch has exactly one terminal tension. `arch-side-terminal` is used only for the real transfer
 * device of an intrados external tendon; external extrados contact never creates such a device.
 * For fixed external anchors the local normal/tangential components are null because no arch
 * boundary frame exists there.
 *
 * This is a pure mechanical-action result: the library computes the action the tendon transmits
 * to the device and deliberately does NOT model or verify the physical anchorage (resin anchors,
 * bolts, plates, connector groups, pull-out). No device capacity, utilization, or PASS/FAIL
 * status exists.
 */
export interface ArchDeviceForceResult {
  readonly deviceId: string;
  readonly reinforcementId: string;
  readonly kind: ArchDeviceKind;
  readonly terminationSide: "left" | "right" | null;
  readonly index: number | null;
  /** Normalized side-boundary station; null for external anchors. */
  readonly station: number | null;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly tensionIn: number;
  readonly tensionOut: number;
  /** Unit cable direction entering the device; null where no segment enters. */
  readonly incomingDirection: RigidBlockVector2D | null;
  /** Unit cable direction leaving the device; null where no segment leaves. */
  readonly outgoingDirection: RigidBlockVector2D | null;
  /**
   * Force the cable applies to the device: `T_out * t_out - T_in * t_in`. Applied to the arch at
   * the device location for arch-side devices; transmitted to the external structural system for
   * external anchors.
   */
  readonly resultantForce: RigidBlockVector2D;
  readonly resultant: number;
  /**
   * Normalized resultant direction `resultantForce / |resultantForce|`; null when the resultant
   * is zero. Together with `resultant` this makes magnitude and direction immediately consumable
   * by an engineering UI.
   */
  readonly resultantDirection: RigidBlockVector2D | null;
  /**
   * Angle of the resultant from the global +x axis, counter-clockwise, in radians; null when the
   * resultant is zero.
   */
  readonly resultantAngle: number | null;
  /**
   * Component of the resultant along the local device frame normal, positive toward the arch
   * interior; null for external anchors. A secondary mechanical interpretation of the global
   * resultant — it never drives a capacity check.
   */
  readonly normalComponent: number | null;
  /**
   * Component of the resultant along the local device frame tangent, positive along increasing
   * side station; null for external anchors. A secondary mechanical interpretation of the global
   * resultant — it never drives a capacity check.
   */
  readonly tangentialComponent: number | null;
}

export interface ArchContactForceResult {
  readonly contactId: string;
  readonly reinforcementId: string;
  readonly index: number;
  readonly referenceCurveStation: number;
  /** Current contacted material location expressed on the normalized reference extrados side arc. */
  readonly normalizedSideArcStation: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly contactKind: "smooth-contact" | "joint-contact";
  readonly tensionLeft: number;
  readonly tensionRight: number;
  readonly resultantForce: RigidBlockVector2D;
  /**
   * For smooth contact, the resultant component toward the arch interior. For joint contact, the
   * contact-resultant magnitude in the admissible corner normal cone.
   */
  readonly normalComponent: number;
  /** Smooth-contact tangent component; zero at a joint where no unique tangent frame exists. */
  readonly tangentialComponent: number;
  readonly state: "in-contact" | "contact-cannot-enforce-path";
}

/**
 * Action transmitted by an open tendon at a fixed external anchor. There is no anchor capacity,
 * utilization, or status — resistance of the external system is outside this library.
 */
export interface ArchExternalAnchorForceResult {
  readonly deviceId: string;
  readonly reinforcementId: string;
  readonly terminationSide: "left" | "right";
  /** Physical transfer-device station for intrados tendons; always null for extrados cables. */
  readonly intradosTransferStation: number | null;
  /** Fixed external anchor point. */
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly tension: number;
  /**
   * Force the modeled tendon transmits to the external structural system at this anchor. It is
   * never applied to an arch voussoir and it is not an arch support reaction.
   */
  readonly forceTransmittedToExternalSystem: RigidBlockVector2D;
  readonly resultant: number;
  /** Normalized direction of the transmitted force; null when the force is zero. */
  readonly resultantDirection: RigidBlockVector2D | null;
  /** Angle of the transmitted force from the global +x axis, counter-clockwise, in radians. */
  readonly resultantAngle: number | null;
}

export interface BondedLayerInterfaceStateResult {
  readonly reinforcementId: string;
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly side: "intrados" | "extrados";
  /**
   * Minimum-required layer force at this interface recovered by static admissibility; null when
   * the static problem does not determine a unique value (see `state`).
   */
  readonly force: number | null;
  /** Effective capacity at this interface: the full assigned capacity inside the effective
   * interval and zero outside it (interfaces outside the interval publish no entry). */
  readonly capacity: number;
  readonly utilizationRatio: number | null;
  readonly state: "inactive" | "active" | "at-capacity" | "not-uniquely-determined";
}

export interface BondedLayerStateResult {
  readonly reinforcementId: string;
  readonly family: BondedLayerMaterialFamily;
  readonly side: "intrados" | "extrados";
  readonly startStation: number;
  readonly endStation: number;
  readonly tensileCapacity: number;
  readonly governingCapacityLimit: NormalizedBondedLayerReinforcement["governingCapacityLimit"];
  /**
   * The recovered force is the minimum required reinforcement force compatible with the
   * statically admissible section solution — a lower-bound quantity, never a unique physical
   * force from strain compatibility.
   */
  readonly analysisMeaning: "minimum-required-static-admissibility";
  readonly maximumForce: number | null;
  readonly maximumUtilizationRatio: number | null;
  readonly interfaces: readonly BondedLayerInterfaceStateResult[];
}

export type MasonryArchInterfaceState =
  | "compressed"
  | "approaching-intrados-hinge"
  | "approaching-extrados-hinge"
  | "hinge"
  | "sliding"
  | "crushing"
  | "sliding-and-crushing"
  | "outside-admissible-thickness"
  | "no-compression";

export interface MasonryArchInterfaceStateResult {
  readonly interfaceId: string;
  readonly index: number;
  readonly normalForce: number;
  readonly shearForce: number;
  readonly moment: number;
  readonly eccentricity: number | null;
  readonly normalizedEccentricity: number | null;
  readonly compressedLength: number | null;
  readonly maxCompression: number | null;
  /** Compression stress at the intrados edge; null when the assigned law does not define stress. */
  readonly compressionAtIntrados: number | null;
  /** Compression stress at the extrados edge; null when the assigned law does not define stress. */
  readonly compressionAtExtrados: number | null;
  readonly frictionUtilization: number | null;
  readonly compressionUtilization: number | null;
  readonly state: MasonryArchInterfaceState;
  readonly hingeSide: "intrados" | "extrados" | null;
  readonly thrustPoint: RigidBlockPoint2D | null;
  readonly admissibilityMargins: {
    readonly compression: number;
    readonly intrados: number;
    readonly extrados: number;
    readonly friction: number | null;
    readonly compressionStrength: number | null;
    readonly resultantDomain: number | null;
  };
  readonly checks: {
    readonly friction: {
      readonly criterion: "coulomb-friction";
      readonly demand: number;
      readonly capacity: number;
      readonly utilizationRatio: number | null;
      readonly status: "pass" | "fail" | "not-verifiable";
    } | null;
    readonly compression: {
      readonly criterion: "finite-compression-uniform-edge-block";
      readonly demand: number;
      readonly capacity: number;
      readonly utilizationRatio: number | null;
      readonly status: "pass" | "fail" | "not-verifiable";
    } | null;
  };
}

export interface MasonryArchEquilibriumOutputs extends Record<string, unknown> {
  readonly modelId: string;
  readonly analysis: MasonryArchAnalysisDescriptor;
  readonly geometry: NormalizedMasonryArchGeometry;
  readonly loadFactorsByCaseId: Readonly<Record<string, number>>;
  readonly appliedLoads: readonly MasonryArchAppliedLoadResult[];
  readonly blockWrenches: readonly MasonryArchBlockLoadResult[];
  readonly reinforcementState: readonly ArchReinforcementStateResult[];
  /** One entry per physical reinforcement device (anchors, deviators, return deviators). */
  readonly deviceForces: readonly ArchDeviceForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  /** Forces transmitted by open tendons to external structural systems, never applied to blocks. */
  readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
  readonly bondedLayerState: readonly BondedLayerStateResult[];
  readonly reactions: {
    readonly left: {
      readonly force: RigidBlockVector2D;
      readonly moment: number;
      readonly applicationPoint: RigidBlockPoint2D;
    };
    readonly right: {
      readonly force: RigidBlockVector2D;
      readonly moment: number;
      readonly applicationPoint: RigidBlockPoint2D;
    };
  };
  /** Null when an exact masonry-only bonded-section aggregate is not uniquely recoverable. */
  readonly interfaces: readonly MasonryArchInterfaceStateResult[] | null;
  /** Null when the masonry-only interface resultants are not uniquely recoverable. */
  readonly thrustLine: readonly (RigidBlockPoint2D | null)[] | null;
  readonly hinges: readonly {
    readonly interfaceId: string;
    readonly side: "intrados" | "extrados";
  }[];
  readonly engineeringAssessment: MasonryArchEngineeringAssessment;
  readonly equilibrium: {
    readonly feasible: boolean;
    readonly representativeMargin: number;
    readonly forceResidual: RigidBlockVector2D;
    readonly momentResidual: number;
    readonly normalizedResidual: {
      readonly forceX: number;
      readonly forceY: number;
      readonly moment: number;
    };
    readonly tolerance: number;
  };
  readonly convergence: {
    readonly converged: boolean;
    readonly optimizer: "fixed-dimension-simplex";
    readonly status: "optimal" | "unbounded" | "iteration-limit";
    readonly iterations: number;
  };
}

export type MasonryArchEquilibriumResult = CalculationResult<MasonryArchEquilibriumOutputs>;

export type MasonryArchFailureMode =
  | "mechanism"
  | "sliding"
  | "masonry-crushing"
  | "reinforcement-yield"
  | "reinforcement-failure"
  | "instability"
  | "mixed"
  | "fixed-load-infeasible"
  | "no-collapse-within-model"
  | "undetermined";

export interface MasonryArchLimitHingeResult {
  readonly interfaceId: string;
  readonly index: number;
  readonly side: "intrados" | "extrados";
  readonly point: RigidBlockPoint2D;
}

export interface MasonryArchCollapseMechanism {
  readonly kinematicallyVerified: boolean;
  readonly degreesOfFreedom: number;
  readonly rank: number;
  readonly maximumConstraintResidual: number;
  readonly blockMotions: readonly RigidBlockMotion2D[];
  readonly nonAssociatedFlow: {
    readonly verified: boolean;
    readonly maximumViolation: number;
    readonly slidingRates: readonly {
      readonly interfaceId: string;
      readonly interfaceIndex: number;
      readonly tangentialRate: number;
      readonly normalRate: number;
      readonly directionVerified: boolean;
    }[];
  } | null;
  readonly virtualWork: {
    readonly fixed: number | null;
    readonly scalableAtUnitLambda: number | null;
    readonly totalAtLimit: number | null;
    readonly internalDissipation: number | null;
    readonly normalizedResidual: number | null;
  };
}

export interface MasonryArchLimitOutputs extends Record<string, unknown> {
  readonly modelId: string;
  readonly analysis: MasonryArchAnalysisDescriptor;
  readonly analysisOutcome: MasonryArchAnalysisOutcome;
  readonly capacity: MasonryArchCapacityLandmarks;
  readonly geometry: NormalizedMasonryArchGeometry;
  readonly limitMeaning:
    | "kinematically-verified-collapse"
    | "maximum-static-admissibility"
    | "not-determined";
  readonly failureMode: MasonryArchFailureMode;
  readonly criticalInterfaces: readonly string[];
  readonly hinges: readonly MasonryArchLimitHingeResult[];
  readonly slidingInterfaces: readonly string[];
  readonly crushingInterfaces: readonly string[];
  readonly reinforcementState: readonly ArchReinforcementStateResult[];
  readonly deviceForces: readonly ArchDeviceForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly externalAnchorForces: readonly ArchExternalAnchorForceResult[];
  /** Null when no certified limit state exists (numerical iteration limit). */
  readonly bondedLayerState: readonly BondedLayerStateResult[] | null;
  readonly loadCases: {
    readonly baseCombinationFactorsByCaseId: Readonly<Record<string, number>>;
    readonly effectiveFactorsAtLimitByCaseId: Readonly<Record<string, number | null>>;
    readonly roleByCaseId: Readonly<Record<string, "fixed" | "scalable">>;
  };
  readonly loadFactorCheck: {
    readonly criterion: "lambda-limit-greater-than-or-equal-to-one";
    readonly demand: 1;
    readonly capacity: number | null;
    readonly utilizationRatio: number | null;
    readonly status: "pass" | "fail" | "not-verifiable";
  };
  readonly loads: {
    readonly fixed: readonly MasonryArchAppliedLoadResult[];
    readonly scalableAtUnitLambda: readonly MasonryArchAppliedLoadResult[];
    readonly totalAtLimit: readonly MasonryArchAppliedLoadResult[];
    readonly fixedBlockWrenches: readonly MasonryArchBlockLoadResult[];
    readonly scalableBlockWrenchesAtUnitLambda: readonly MasonryArchBlockLoadResult[];
    readonly totalBlockWrenchesAtLimit: readonly MasonryArchBlockLoadResult[];
  };
  /** Null when no certified limit state exists (numerical iteration limit). */
  readonly reactions: MasonryArchEquilibriumOutputs["reactions"] | null;
  /** Null when no certified limit state exists (numerical iteration limit). */
  readonly interfaces: readonly MasonryArchInterfaceStateResult[] | null;
  /** Null when no certified limit state exists (numerical iteration limit). */
  readonly thrustLine: readonly (RigidBlockPoint2D | null)[] | null;
  /** Normalized kinematic field; its amplitude is arbitrary. Null without verified kinematics. */
  readonly collapseMechanism: MasonryArchCollapseMechanism | null;
  /** Null when no certified limit state exists (numerical iteration limit). */
  readonly equilibrium: {
    readonly forceResidual: RigidBlockVector2D;
    readonly momentResidual: number;
    readonly normalizedResidual: {
      readonly forceX: number;
      readonly forceY: number;
      readonly moment: number;
    };
    readonly tolerance: number;
  } | null;
  readonly convergenceInfo: {
    readonly converged: boolean;
    readonly optimizer: "fixed-dimension-simplex" | "sequential-linear-programming";
    readonly status:
      | "optimal"
      | "unbounded"
      | "fixed-load-infeasible"
      | "iteration-limit"
      | "non-associated-iteration-limit";
    readonly iterations: number;
    readonly nonAssociated: {
      readonly required: boolean;
      readonly converged: boolean;
      readonly iterations: number;
      readonly relativeLambdaChange: number | null;
      readonly frictionReductionFactor: number | null;
    };
  };
}

export type MasonryArchLimitResult = CalculationResult<MasonryArchLimitOutputs>;
