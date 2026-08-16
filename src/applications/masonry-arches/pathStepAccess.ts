import type {
  MasonryArchPathOutputs,
  MasonryArchPathState,
  MasonryArchPathStep,
} from "./pathTypes.js";

export type MasonryArchSignificantStep =
  | "fixed-state"
  | "design-state"
  | "first-limit"
  | "verification-limit"
  | "peak"
  | "last-converged"
  | "termination";

export function getMasonryArchPathStep(
  outputs: MasonryArchPathOutputs,
  step: number,
): MasonryArchPathStep | null {
  return outputs.steps.find((point) => point.step === step) ?? null;
}

export function getMasonryArchPathState(
  outputs: MasonryArchPathOutputs,
  step: number,
): MasonryArchPathState | null {
  return getMasonryArchPathStep(outputs, step)?.state ?? null;
}

export function getMasonryArchSignificantStep(
  outputs: MasonryArchPathOutputs,
  name: MasonryArchSignificantStep,
): MasonryArchPathStep | null {
  const step =
    name === "fixed-state"
      ? outputs.significantSteps.fixedState
      : name === "design-state"
        ? outputs.significantSteps.designState
        : name === "first-limit"
          ? outputs.significantSteps.firstLimit
          : name === "verification-limit"
            ? outputs.significantSteps.verificationLimit
            : name === "peak"
              ? outputs.significantSteps.peak
              : name === "last-converged"
                ? outputs.significantSteps.lastConverged
                : outputs.significantSteps.termination;
  return step === null ? null : getMasonryArchPathStep(outputs, step);
}
