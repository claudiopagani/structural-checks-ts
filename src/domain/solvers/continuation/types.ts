export interface AdaptiveLoadControl {
  readonly type: "load";
  readonly targetLambda: number;
  readonly initialStep?: number;
  readonly minimumStep?: number;
  readonly maximumStep?: number;
}

export interface DisplacementControl<TDof> {
  readonly type: "displacement";
  readonly dof: TDof;
  readonly increment: number;
  readonly target: number;
}

export interface SphericalArcLengthControl {
  readonly type: "arc-length";
  readonly targetPathLength: number;
  readonly initialRadius?: number;
  readonly minimumRadius?: number;
  readonly maximumRadius?: number;
  /** Weight of the dimensionless load coordinate relative to normalized displacements. */
  readonly loadScale?: number;
}

export type ContinuationControl<TDof> =
  | AdaptiveLoadControl
  | DisplacementControl<TDof>
  | SphericalArcLengthControl;

export interface ArcLengthMetric {
  readonly displacementScales: readonly number[];
  readonly loadScale: number;
}
