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

export const MASONRY_ARCH_MODEL_SCHEMA_VERSION = "2.0.0";
export const MASONRY_ARCH_EQUILIBRIUM_RESULT_SCHEMA_VERSION = "4.0.0";
export const MASONRY_ARCH_LIMIT_ANALYSIS_RESULT_SCHEMA_VERSION = "4.0.0";

export type MasonryArchReferenceCurve = "intrados" | "centerline" | "extrados";
export type MasonryArchAngleUnits = "deg" | "rad";
export type MasonryArchDistributionBasis = "horizontal-projection" | "arc-length";
export type MasonryArchLoadApplicationCurve = MasonryArchReferenceCurve;

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
  | "anchor-capacity-reached"
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
  | "anchor-capacity-reached"
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
  /** Physical entities involved, for example interface, reinforcement, anchor, or contact IDs. */
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
  readonly lambdaPeak: number | null;
  readonly lambdaTermination: number | null;
  readonly lambdaCollapse: number | null;
  /**
   * Lambda of the first event that makes satisfying the design verification at lambda = 1
   * impossible on the followed primary branch: a certified global equilibrium limit point below
   * one, terminal crushing, reinforcement or anchor or bonded-layer failure, or another genuinely
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

export interface ArchAnchorCapacityInput {
  readonly normalResistance?: number;
  readonly shearResistance?: number;
  readonly resultantResistance?: number;
  readonly interactionRule?: "independent" | "linear" | "elliptical";
}

export interface ArchRigidDeviatorInteractionInput {
  readonly type: "rigid-deviators";
  /** Physical deviators, including the two path-end deviators. Must be odd and at least three. */
  readonly count: number;
  /** Shared capacity used when a deviator-specific terminal capacity does not supersede it. */
  readonly capacity?: ArchAnchorCapacityInput;
}

export interface ArchExtradosContactInteractionInput {
  readonly type: "unilateral-contact";
  /** Numerical straight segments used to integrate cable-to-arch contact. */
  readonly segmentCount?: number;
}

export interface ArchContinuousExternalTerminationInput {
  readonly type: "continuous-external";
}

export interface ArchDistributedAnchorageTerminationInput {
  readonly type: "distributed-anchorage";
  /** Rigid connectors in the transfer zone, including the connector at the path end. */
  readonly connectorCount: number;
  /** Constant spacing measured along the selected arch boundary. Required when count is greater than one. */
  readonly connectorSpacing?: number;
  /** Optional shares ordered from the model boundary toward the arch interior. Must sum to one. */
  readonly loadShareWeights?: readonly number[];
  readonly capacity?: ArchAnchorCapacityInput;
}

export type ArchReinforcementTerminationInput =
  | ArchContinuousExternalTerminationInput
  | ArchDistributedAnchorageTerminationInput;

interface ArchReinforcementBaseInput {
  readonly id: string;
  readonly area: number;
  readonly elasticModulus: number;
  readonly initialForce: number;
  readonly yieldStrength?: number;
  readonly tensileStrength?: number;
  readonly ultimateStrain?: number;
  readonly terminations?: {
    readonly left?: ArchReinforcementTerminationInput;
    readonly right?: ArchReinforcementTerminationInput;
  };
}

export interface IntradosArchReinforcementInput extends ArchReinforcementBaseInput {
  readonly side: "intrados";
  readonly interaction: ArchRigidDeviatorInteractionInput;
}

export interface ExtradosArchReinforcementInput extends ArchReinforcementBaseInput {
  readonly side: "extrados";
  readonly interaction?: ArchExtradosContactInteractionInput;
}

export type ArchReinforcementInput =
  | IntradosArchReinforcementInput
  | ExtradosArchReinforcementInput;

export type BondedLayerMaterialFamily = "frcm" | "frp" | "sfrm";

export type BondedLayerTerminationInput =
  | { readonly type: "anchored" }
  | {
      readonly type: "unanchored";
      /** Length over which the available tensile force increases linearly from zero. */
      readonly developmentLength: number;
    };

/** Passive zero-thickness layer bonded to one arch boundary. */
export interface BondedLayerReinforcementInput {
  readonly id: string;
  readonly family: BondedLayerMaterialFamily;
  readonly side: "intrados" | "extrados";
  /** Effective tensile area; SFRM is represented by an equivalent membrane area. */
  readonly area: number;
  readonly elasticModulus: number;
  readonly tensileStrength?: number;
  readonly debondingStrain?: number;
  readonly ultimateStrain?: number;
  /** Required only for deformable-interface analysis. */
  readonly transferLength?: number;
  /** Normalized reference-curve station. Defaults to zero. */
  readonly startStation?: number;
  /** Normalized reference-curve station. Defaults to one. */
  readonly endStation?: number;
  readonly terminations?: {
    readonly left?: BondedLayerTerminationInput;
    readonly right?: BondedLayerTerminationInput;
  };
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

export interface NormalizedArchAnchorCapacity {
  readonly normalResistance: number | null;
  readonly shearResistance: number | null;
  readonly resultantResistance: number | null;
  readonly interactionRule: "independent" | "linear" | "elliptical";
}

export interface NormalizedArchContinuousExternalTermination {
  readonly type: "continuous-external";
}

export interface NormalizedArchDistributedAnchorageTermination {
  readonly type: "distributed-anchorage";
  readonly connectorCount: number;
  readonly connectorSpacing: number;
  readonly loadShareWeights: readonly number[];
  readonly capacity: NormalizedArchAnchorCapacity;
}

export type NormalizedArchReinforcementTermination =
  | NormalizedArchContinuousExternalTermination
  | NormalizedArchDistributedAnchorageTermination;

interface NormalizedArchReinforcementBase {
  readonly id: string;
  readonly side: "intrados" | "extrados";
  readonly area: number;
  readonly elasticModulus: number;
  readonly initialForce: number;
  readonly yieldStrength: number | null;
  readonly tensileStrength: number | null;
  readonly ultimateStrain: number | null;
  readonly terminations: {
    readonly left: NormalizedArchReinforcementTermination;
    readonly right: NormalizedArchReinforcementTermination;
  };
}

export interface NormalizedIntradosArchReinforcement extends NormalizedArchReinforcementBase {
  readonly side: "intrados";
  readonly interaction: {
    readonly type: "rigid-deviators";
    readonly count: number;
    readonly capacity: NormalizedArchAnchorCapacity;
  };
}

export interface NormalizedExtradosArchReinforcement extends NormalizedArchReinforcementBase {
  readonly side: "extrados";
  readonly interaction: {
    readonly type: "unilateral-contact";
    readonly segmentCount: number;
  };
}

export type NormalizedArchReinforcement =
  | NormalizedIntradosArchReinforcement
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
  readonly transferLength: number | null;
  readonly startStation: number;
  readonly endStation: number;
  readonly terminations: {
    readonly left: BondedLayerTerminationInput;
    readonly right: BondedLayerTerminationInput;
  };
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

export interface ArchReinforcementSegmentResult {
  readonly index: number;
  readonly referenceStartPoint: RigidBlockPoint2D;
  readonly referenceEndPoint: RigidBlockPoint2D;
  readonly startPoint: RigidBlockPoint2D;
  readonly endPoint: RigidBlockPoint2D;
  readonly startStation: number;
  readonly endStation: number;
  readonly referenceLength: number;
  readonly length: number;
  /** Ratio of segment tension to the reported central reinforcement force. */
  readonly tensionRatio: number;
  readonly tension: number;
}

export interface ArchDeviatorGeometryResult {
  readonly id: string;
  readonly index: number;
  readonly station: number;
  readonly normalizedSideArcStation: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
}

export interface ArchReinforcementStateResult {
  readonly reinforcementId: string;
  readonly side: "intrados" | "extrados";
  readonly force: number;
  readonly trialForce: number;
  readonly initialForce: number;
  readonly elasticForceIncrement: number;
  readonly axialStress: number;
  readonly elasticStrain: number;
  readonly geometricStrain: number;
  readonly state: ArchReinforcementState;
  readonly compatibilityMode: "anchored-length-compatible" | "externally-force-controlled";
  readonly referencePathLength: number;
  readonly currentPathLength: number;
  readonly pathLength: number;
  readonly elongation: number;
  /** Absolute path-length change at or below this numerical tolerance is treated as zero. */
  readonly elongationTolerance: number;
  readonly effectiveElasticLength: number | null;
  readonly elasticTangentStiffness: number;
  readonly interactionType: "rigid-deviators" | "unilateral-contact";
  readonly referencePath: readonly RigidBlockPoint2D[];
  readonly path: readonly RigidBlockPoint2D[];
  readonly segments: readonly ArchReinforcementSegmentResult[];
  /** Physical entities; empty for an extrados governed only by unilateral contact. */
  readonly deviators: readonly ArchDeviatorGeometryResult[];
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

export interface ArchAnchorForceResult {
  readonly anchorId: string;
  readonly reinforcementId: string;
  readonly kind: "deviator" | "terminal-connector" | "terminal-connector-and-deviator";
  readonly terminationSide: "left" | "right" | null;
  readonly index: number;
  readonly station: number;
  readonly normalizedSideArcStation: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly tensionLeft: number;
  readonly tensionRight: number;
  /** Force transmitted by the reinforcement to the rigid anchor/deviator and then to the arch. */
  readonly resultantForce: RigidBlockVector2D;
  /** Positive toward the arch interior, opposite the stored outward normal. */
  readonly normalComponent: number;
  /** Positive along increasing arch station. */
  readonly tangentialComponent: number;
  readonly resultant: number;
  readonly direction: RigidBlockVector2D | null;
  readonly demand: {
    readonly normal: number;
    readonly shear: number;
    readonly resultant: number;
  };
  readonly capacity: {
    readonly normal: number | null;
    readonly shear: number | null;
    readonly resultant: number | null;
  };
  readonly interactionRule: "independent" | "linear" | "elliptical";
  readonly utilizationRatio: number | null;
  readonly status: "pass" | "fail" | "not-verifiable";
}

export interface ArchContactForceResult {
  readonly contactId: string;
  readonly reinforcementId: string;
  readonly index: number;
  readonly station: number;
  readonly normalizedSideArcStation: number;
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly tensionLeft: number;
  readonly tensionRight: number;
  readonly resultantForce: RigidBlockVector2D;
  readonly normalComponent: number;
  readonly tangentialComponent: number;
  readonly state: "in-contact" | "separated" | "contact-cannot-enforce-path";
}

export interface ArchReinforcementBoundaryForceResult {
  readonly reinforcementId: string;
  readonly side: "left" | "right";
  readonly terminationType: "continuous-external" | "distributed-anchorage";
  readonly referencePoint: RigidBlockPoint2D;
  readonly point: RigidBlockPoint2D;
  readonly tension: number;
  /** Force transmitted by the modeled tendon to the system outside the arch-model boundary. */
  readonly forceTransmittedToExternalSystem: RigidBlockVector2D;
}

export interface BondedLayerInterfaceStateResult {
  readonly reinforcementId: string;
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly side: "intrados" | "extrados";
  readonly developmentFactor: number;
  readonly force: number | null;
  readonly capacity: number;
  readonly utilizationRatio: number | null;
  readonly state: "inactive" | "active" | "at-capacity" | "not-uniquely-determined";
}

export interface BondedLayerStateResult {
  readonly reinforcementId: string;
  readonly family: BondedLayerMaterialFamily;
  readonly side: "intrados" | "extrados";
  readonly tensileCapacity: number;
  readonly governingCapacityLimit: NormalizedBondedLayerReinforcement["governingCapacityLimit"];
  readonly analysisMeaning:
    | "minimum-required-static-admissibility"
    | "deformable-interface-compatibility";
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
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly reinforcementBoundaryForces: readonly ArchReinforcementBoundaryForceResult[];
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
  readonly interfaces: readonly MasonryArchInterfaceStateResult[];
  readonly thrustLine: readonly (RigidBlockPoint2D | null)[];
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
  | "anchor-capacity"
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
  readonly anchorForces: readonly ArchAnchorForceResult[];
  readonly contactForces: readonly ArchContactForceResult[];
  readonly reinforcementBoundaryForces: readonly ArchReinforcementBoundaryForceResult[];
  readonly bondedLayerState: readonly BondedLayerStateResult[];
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
  readonly reactions: MasonryArchEquilibriumOutputs["reactions"];
  readonly interfaces: readonly MasonryArchInterfaceStateResult[];
  readonly thrustLine: readonly (RigidBlockPoint2D | null)[];
  /** Normalized kinematic field; its amplitude is arbitrary. Null without verified kinematics. */
  readonly collapseMechanism: MasonryArchCollapseMechanism | null;
  readonly equilibrium: {
    readonly forceResidual: RigidBlockVector2D;
    readonly momentResidual: number;
    readonly normalizedResidual: {
      readonly forceX: number;
      readonly forceY: number;
      readonly moment: number;
    };
    readonly tolerance: number;
  };
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
