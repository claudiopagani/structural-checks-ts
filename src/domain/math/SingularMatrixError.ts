/**
 * Expected numerical failure of a linear or tangent-correction solve: the (augmented) system is
 * singular or too degenerate to factor within the assigned singularity tolerance.
 *
 * Continuation and Newton drivers may convert this specific condition into a non-convergence
 * diagnostic. Any other error escaping those solves is a programming or contract error and must
 * propagate to the caller instead of being relabeled as a numerical condition.
 */
export class SingularMatrixError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SingularMatrixError";
  }
}
