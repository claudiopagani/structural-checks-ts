import type {
  RCServiceStressInitialGuess,
  RCServiceStressResult,
  RCServiceStressSolveOptions,
  RCServiceStressSolver,
} from "./RCServiceStressSolver.js";

const DEFAULT_INITIAL_GUESSES = Object.freeze([
  {},
  { kappaZ: 1e-7 },
  { kappaZ: -1e-7 },
  { kappaZ: 1e-6 },
  { kappaZ: -1e-6 },
  { kappaY: 1e-7 },
  { kappaY: -1e-7 },
] as const);

export type RCServiceStressAnalysisMode = "biaxial" | "uniaxial";

export interface SolveServiceStressWithFallbacksOptions
  extends Omit<RCServiceStressSolveOptions, "initialGuess"> {
  serviceSolver: RCServiceStressSolver;
  initialGuess?: RCServiceStressInitialGuess;
  analysisMode?: RCServiceStressAnalysisMode;
}

export interface RCServiceStressFallbackResult extends RCServiceStressResult {
  initialGuess: RCServiceStressInitialGuess;
  fallbackUsed: boolean;
}

function normalizeInitialGuess(
  initialGuess: RCServiceStressInitialGuess | null | undefined,
): RCServiceStressInitialGuess {
  return {
    ...(initialGuess ?? {}),
  };
}

function mergeGuess(
  base: RCServiceStressInitialGuess,
  guess: RCServiceStressInitialGuess,
): RCServiceStressInitialGuess {
  return {
    ...base,
    ...guess,
  };
}

function guessKey(
  guess: RCServiceStressInitialGuess,
  analysisMode: RCServiceStressAnalysisMode,
): string {
  return JSON.stringify([
    guess.eps0 ?? 0,
    analysisMode === "uniaxial" ? 0 : (guess.kappaY ?? 0),
    guess.kappaZ ?? 0,
  ]);
}

function serviceStressNorm(result: RCServiceStressResult | null | undefined): number {
  const residual: Partial<RCServiceStressResult["residual"]> = result?.residual ?? {};

  return Math.sqrt((residual.n ?? 0) ** 2 + (residual.mx ?? 0) ** 2 + (residual.my ?? 0) ** 2);
}

export function solveServiceStressWithFallbacks({
  serviceSolver,
  section,
  concreteFibers,
  concreteLaw,
  steelLaw,
  actions,
  referencePoint = null,
  initialGuess = {},
  analysisMode = "biaxial",
}: SolveServiceStressWithFallbacksOptions): RCServiceStressFallbackResult {
  const baseGuess = normalizeInitialGuess(initialGuess);
  const guesses = [
    baseGuess,
    ...DEFAULT_INITIAL_GUESSES.map((guess) => mergeGuess(baseGuess, guess)),
  ];
  const used = new Set<string>();
  let best: RCServiceStressFallbackResult | null = null;
  let lastError: unknown = null;

  for (const guess of guesses) {
    const key = guessKey(guess, analysisMode);

    if (used.has(key)) {
      continue;
    }

    used.add(key);

    let result: RCServiceStressResult;

    try {
      result =
        analysisMode === "uniaxial"
          ? serviceSolver.solveUniaxial({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              actions,
              referencePoint,
              initialGuess: guess,
            })
          : serviceSolver.solve({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              actions,
              referencePoint,
              initialGuess: guess,
            });
    } catch (error) {
      lastError = error;
      continue;
    }

    if (result.converged) {
      return {
        ...result,
        initialGuess: guess,
        fallbackUsed: used.size > 1,
      };
    }

    const candidate = {
      ...result,
      initialGuess: guess,
      fallbackUsed: used.size > 1,
    };

    if (best == null || serviceStressNorm(result) < serviceStressNorm(best)) {
      best = candidate;
    }
  }

  if (best != null) {
    return best;
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("RC service stress solver did not return a result.");
}
