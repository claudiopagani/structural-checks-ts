export type MasonryInterfaceAngleUnit = "deg" | "rad";

export type MasonryFrictionFlowRuleInput =
  | {
      readonly type: "non-associated";
      readonly dilationAngle?: number;
      readonly angleUnit?: MasonryInterfaceAngleUnit;
    }
  | { readonly type: "associated" };

export interface MasonryCoulombFrictionInput {
  readonly frictionCoefficient: number;
  /** Cohesion stress. Defaults to zero. */
  readonly cohesion?: number;
  readonly flowRule?: MasonryFrictionFlowRuleInput;
}

export interface MasonryRigidInterfaceLawInput {
  readonly response: "rigid-plastic";
  readonly normal: {
    readonly type: "no-tension";
    /** Omit for unbounded compression strength. */
    readonly compressiveStrength?: number;
    /** Safe chord facets per moment sign. Required only for finite compression. */
    readonly compressionFacetCount?: number;
  };
  readonly tangential:
    | { readonly type: "frictionless" }
    | ({ readonly type: "coulomb" } & MasonryCoulombFrictionInput);
  readonly reporting?: {
    /** Ratio used only to label an interface as approaching its eccentricity limit. */
    readonly approachingLimitRatio?: number;
  };
}

export interface MasonryDeformableInterfaceLawInput {
  readonly response: "deformable";
  readonly normal: {
    readonly type: "elastic-no-tension";
    readonly elasticModulus: number;
    readonly characteristicLength: number;
    readonly compressiveStrength?: number;
    /** Returned midpoint samples; defaults to 16. */
    readonly integrationPointCount?: number;
    readonly postCrushingBehavior?: "stop-at-onset" | "perfectly-plastic";
    /** Static safe-domain facets per moment sign when strength is finite. */
    readonly compressionFacetCount?: number;
  };
  readonly tangential: {
    readonly type: "elastic-coulomb";
    readonly shearModulus: number;
    readonly characteristicLength: number;
  } & MasonryCoulombFrictionInput;
  readonly reporting?: {
    readonly approachingLimitRatio?: number;
  };
}

/** Solver-neutral zero-thickness masonry-interface law. */
export type MasonryInterfaceLawInput =
  | MasonryRigidInterfaceLawInput
  | MasonryDeformableInterfaceLawInput;

export interface NormalizedMasonryInterfaceLaw {
  readonly response: "rigid-plastic" | "deformable";
  readonly approachingLimitRatio: number;
  readonly friction: {
    readonly frictionCoefficient: number;
    readonly cohesion: number;
    readonly flowRule: {
      readonly type: "non-associated" | "associated";
      readonly dilationAngle: number;
    };
  } | null;
  readonly compressiveStrength: number | null;
  readonly compressionFacetCount: number;
  readonly deformability: {
    readonly normal: {
      readonly elasticModulus: number;
      readonly characteristicLength: number;
      readonly integrationPointCount: number;
      readonly postCrushingBehavior: "stop-at-onset" | "perfectly-plastic";
    };
    readonly tangential: {
      readonly shearModulus: number;
      readonly characteristicLength: number;
    };
  } | null;
}
