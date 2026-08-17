export interface RigidBlockPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface RigidBlockVector2D {
  readonly x: number;
  readonly y: number;
}

export interface RigidBlock2D {
  readonly id: string;
  readonly index: number;
  readonly polygon: readonly RigidBlockPoint2D[];
  readonly area: number;
  readonly centroid: RigidBlockPoint2D;
  readonly outOfPlaneWidth: number;
  readonly volume: number;
  readonly leftInterfaceId: string;
  readonly rightInterfaceId: string;
}

export interface RigidBlockInterface2D {
  readonly id: string;
  readonly index: number;
  readonly midpoint: RigidBlockPoint2D;
  /** Unit tangent of the ordered block chain, directed from left to right. */
  readonly chainTangent: RigidBlockVector2D;
  /** Unit joint axis directed from intrados to extrados. */
  readonly jointAxis: RigidBlockVector2D;
  readonly length: number;
  readonly outOfPlaneWidth: number;
}

export interface RigidBlockAppliedWrench2D {
  readonly blockId: string;
  readonly force: RigidBlockVector2D;
  /** Counter-clockwise applied couple about `applicationPoint`. */
  readonly moment: number;
  readonly applicationPoint: RigidBlockPoint2D;
}

export interface RigidBlockEquilibriumScales {
  readonly force: number;
  readonly moment: number;
}

export interface RigidBlockEquilibriumOptions {
  readonly feasibilityTolerance?: number;
  readonly simplexTolerance?: number;
  readonly maxSimplexIterations?: number;
}

export interface RigidBlockNonAssociatedFlowRule2D {
  readonly type: "non-associated";
  /** Dilation angle in radians. Zero gives tangential slip without plastic dilation. */
  readonly dilationAngle: number;
}

export interface RigidBlockAssociatedFlowRule2D {
  readonly type: "associated";
  /** Equal to atan(frictionCoefficient), stored explicitly for audit output. */
  readonly dilationAngle: number;
}

export type RigidBlockFrictionFlowRule2D =
  | RigidBlockNonAssociatedFlowRule2D
  | RigidBlockAssociatedFlowRule2D;

export interface RigidBlockCoulombLaw2D {
  readonly frictionCoefficient: number;
  /** Cohesion stress. The initial masonry-arch release uses zero cohesion. */
  readonly cohesion: number;
  readonly flowRule: RigidBlockFrictionFlowRule2D;
}

/** Rigid-plastic no-tension resultant domain assigned to one block interface. */
export interface RigidBlockInterfaceLimitLaw2D {
  readonly friction: RigidBlockCoulombLaw2D | null;
  /** Compression stress limit; null denotes unbounded compression strength. */
  readonly compressiveStrength: number | null;
  /** Number of safe chord facets per half of the finite-compression domain. */
  readonly compressionFacetCount: number;
  /** Optional complete N-M half-space domain. When present it replaces the masonry-only N-M law. */
  readonly resultantFacets?: readonly RigidBlockResultantFacet2D[] | null;
}

export interface RigidBlockResultantFacet2D {
  /** Coefficient of compression-positive normal force. */
  readonly normalCoefficient: number;
  /** Coefficient of moment positive toward the extrados. */
  readonly momentCoefficient: number;
  readonly capacity: number;
  readonly kind: RigidBlockInterfaceConstraintKind;
}

export interface RigidBlockInterfaceResultant2D {
  readonly interfaceId: string;
  readonly index: number;
  readonly normalForce: number;
  readonly shearForce: number;
  /** Positive moment gives positive eccentricity toward the extrados. */
  readonly moment: number;
  readonly eccentricity: number | null;
  readonly normalizedEccentricity: number | null;
  readonly thrustPoint: RigidBlockPoint2D | null;
  readonly admissibilityMargins: {
    readonly compression: number;
    readonly intrados: number;
    readonly extrados: number;
    readonly friction: number | null;
    readonly compressionStrength: number | null;
    readonly resultantDomain: number | null;
  };
}

export interface RigidBlockSupportReaction2D {
  readonly force: RigidBlockVector2D;
  /** Counter-clockwise reaction couple acting on the arch. */
  readonly moment: number;
  readonly applicationPoint: RigidBlockPoint2D;
}

export interface RigidBlockEquilibriumResidual2D {
  readonly forceX: number;
  readonly forceY: number;
  readonly moment: number;
  readonly normalizedForceX: number;
  readonly normalizedForceY: number;
  readonly normalizedMoment: number;
}

export interface RigidBlockEquilibrium2D {
  readonly feasible: boolean;
  readonly reason: string | null;
  readonly representativeMargin: number;
  readonly scales: RigidBlockEquilibriumScales;
  readonly leftReaction: RigidBlockSupportReaction2D;
  readonly rightReaction: RigidBlockSupportReaction2D;
  readonly interfaces: readonly RigidBlockInterfaceResultant2D[];
  readonly residual: RigidBlockEquilibriumResidual2D;
  readonly simplex: {
    readonly status: "optimal" | "unbounded" | "iteration-limit";
    readonly iterations: number;
  };
}

export type RigidBlockHeymanEquilibrium2D = RigidBlockEquilibrium2D;

export type RigidBlockInterfaceConstraintKind =
  | "compression"
  | "intrados"
  | "extrados"
  | "sliding-positive"
  | "sliding-negative"
  | "crushing-intrados"
  | "crushing-extrados"
  | "bonded-layer-capacity";

export type RigidBlockHeymanConstraintKind = RigidBlockInterfaceConstraintKind;

export interface RigidBlockHeymanActiveConstraint2D {
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly kind: RigidBlockHeymanConstraintKind;
  readonly normalizedSlack: number;
}

export interface RigidBlockCollapseOptions extends RigidBlockEquilibriumOptions {
  readonly activeConstraintTolerance?: number;
}

export interface RigidBlockCollapse2D {
  readonly status: "optimal" | "unbounded" | "fixed-load-infeasible" | "iteration-limit";
  readonly reason: string | null;
  /** Maximum scalable-load multiplier established by this limit problem. */
  readonly lambdaLimit: number | null;
  readonly scales: RigidBlockEquilibriumScales;
  /**
   * Support reactions of the established limit state. Null when the simplex stopped at its
   * iteration limit: an unconverged tableau is not a certified collapse state, so no
   * tableau-derived reactions, interface resultants, or residuals are published.
   */
  readonly leftReaction: RigidBlockSupportReaction2D | null;
  readonly rightReaction: RigidBlockSupportReaction2D | null;
  readonly interfaces: readonly RigidBlockInterfaceResultant2D[] | null;
  readonly activeConstraints: readonly RigidBlockHeymanActiveConstraint2D[];
  readonly residual: RigidBlockEquilibriumResidual2D | null;
  readonly simplex: {
    readonly status: "optimal" | "unbounded" | "iteration-limit";
    readonly iterations: number;
  };
}

export type RigidBlockHeymanCollapse2D = RigidBlockCollapse2D;

export interface RigidBlockHinge2D {
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly side: "intrados" | "extrados";
  readonly point: RigidBlockPoint2D;
}

export interface RigidBlockMotion2D {
  readonly blockId: string;
  /** Translational velocity evaluated at the block centroid. */
  readonly translation: RigidBlockVector2D;
  readonly rotation: number;
}

export interface RigidBlockKinematicMechanism2D {
  readonly verified: boolean;
  readonly degreesOfFreedom: number;
  readonly rank: number;
  readonly maximumConstraintResidual: number;
  readonly motions: readonly RigidBlockMotion2D[];
}

export interface RigidBlockSlidingRelease2D {
  readonly interfaceId: string;
  readonly interfaceIndex: number;
  readonly direction: "positive" | "negative";
}

export interface RigidBlockNonAssociatedMechanism2D extends RigidBlockKinematicMechanism2D {
  readonly flowRuleVerified: boolean;
  readonly maximumFlowViolation: number;
  readonly slidingRates: readonly {
    readonly interfaceId: string;
    readonly interfaceIndex: number;
    readonly tangentialRate: number;
    readonly normalRate: number;
    readonly directionVerified: boolean;
  }[];
}
