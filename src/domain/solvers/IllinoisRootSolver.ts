export interface IllinoisRootSolverOptions {
  /**
   * Convergence tolerance on the function residual |f(x) - target|. The bracket width never
   * declares convergence by itself: for a steep function a narrow bracket does not imply a
   * small residual.
   */
  tolerance?: number;
  maxIterations?: number;
}

export interface IllinoisRootHistoryEntry {
  x: number;
  value: number;
  residual: number;
}

export interface IllinoisRootResult {
  converged: boolean;
  iterations: number;
  root: number;
  value: number;
  residual: number;
  bracket: {
    min: number;
    max: number;
  };
  history?: IllinoisRootHistoryEntry[];
}

export interface IllinoisSolveOptions {
  fn: (value: number) => number;
  min: number;
  max: number;
  target?: number;
  includeHistory?: boolean;
}

export class IllinoisRootSolver {
  tolerance: number;
  maxIterations: number;

  constructor({ tolerance = 1e-6, maxIterations = 100 }: IllinoisRootSolverOptions = {}) {
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new Error("IllinoisRootSolver requires a positive residual tolerance.");
    }

    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw new Error("IllinoisRootSolver requires a positive integer maxIterations.");
    }

    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
  }

  solve({
    fn,
    min,
    max,
    target = 0,
    includeHistory = true,
  }: IllinoisSolveOptions): IllinoisRootResult {
    if (typeof fn !== "function") {
      throw new Error("IllinoisRootSolver requires a fn callback.");
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      throw new Error("IllinoisRootSolver requires a finite bracket with min < max.");
    }

    if (!Number.isFinite(target)) {
      throw new Error("IllinoisRootSolver requires a finite target.");
    }

    const evaluate = (x: number): number => {
      const rawValue = fn(x);

      if (!Number.isFinite(rawValue)) {
        throw new Error("IllinoisRootSolver function returned a non-finite value.");
      }

      return rawValue - target;
    };

    let a = min;
    let b = max;
    let fa = evaluate(a);
    let fb = evaluate(b);
    const history = includeHistory
      ? [
          { x: a, value: fa + target, residual: fa },
          { x: b, value: fb + target, residual: fb },
        ]
      : undefined;
    const historyResult = (): Pick<IllinoisRootResult, "history"> | object =>
      includeHistory ? { history } : {};

    if (Math.abs(fa) <= this.tolerance) {
      return {
        converged: true,
        iterations: 0,
        root: a,
        value: fa + target,
        residual: fa,
        bracket: { min: a, max: b },
        ...historyResult(),
      };
    }

    if (Math.abs(fb) <= this.tolerance) {
      return {
        converged: true,
        iterations: 0,
        root: b,
        value: fb + target,
        residual: fb,
        bracket: { min: a, max: b },
        ...historyResult(),
      };
    }

    const oppositeSigns = (left: number, right: number): boolean =>
      (left < 0 && right > 0) || (left > 0 && right < 0);

    if (!oppositeSigns(fa, fb)) {
      throw new Error("IllinoisRootSolver requires the function to change sign in the bracket.");
    }

    let lastUpdatedSide: "a" | "b" | null = null;
    let x = a;
    let fx = fa;

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      // Normalize the false-position weights before interpolation. This avoids underflow in sign
      // products and overflow/cancellation in `a * fb - b * fa` for extremely small or large
      // finite residuals. The weights are positive because the bracket invariant is sign-based.
      const residualScale = Math.max(Math.abs(fa), Math.abs(fb));
      const aWeight = Math.abs(fb) / residualScale;
      const bWeight = Math.abs(fa) / residualScale;
      x = (a * aWeight + b * bWeight) / (aWeight + bWeight);
      if (!Number.isFinite(x) || x < a || x > b) {
        x = a / 2 + b / 2;
      }
      if (!Number.isFinite(x)) {
        throw new Error("IllinoisRootSolver produced a non-finite bracket interpolation.");
      }
      fx = evaluate(x);
      history?.push({ x, value: fx + target, residual: fx });

      // Convergence is earned on the function residual alone. A narrow bracket locates the
      // crossing in x but, for a steep function, says nothing about |f(x) - target|.
      if (Math.abs(fx) <= this.tolerance) {
        return {
          converged: true,
          iterations: iteration,
          root: x,
          value: fx + target,
          residual: fx,
          bracket: { min: a, max: b },
          ...historyResult(),
        };
      }

      if (oppositeSigns(fa, fx)) {
        b = x;
        fb = fx;

        if (lastUpdatedSide === "b") {
          fa /= 2;
        }

        lastUpdatedSide = "b";
      } else if (oppositeSigns(fb, fx)) {
        a = x;
        fa = fx;

        if (lastUpdatedSide === "a") {
          fb /= 2;
        }

        lastUpdatedSide = "a";
      } else {
        throw new Error("IllinoisRootSolver lost its sign-changing bracket invariant.");
      }
    }

    return {
      converged: false,
      iterations: this.maxIterations,
      root: x,
      value: fx + target,
      residual: fx,
      bracket: { min: a, max: b },
      ...historyResult(),
    };
  }
}
