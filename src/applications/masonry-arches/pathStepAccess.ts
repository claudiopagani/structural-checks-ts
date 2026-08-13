import type {
  MasonryArchPathOutputs,
  MasonryArchPathState,
  MasonryArchPathStep,
} from "./pathTypes.js";

export type MasonryArchSignificantStep = "design-state" | "first-limit" | "peak" | "last-converged";

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
    name === "design-state"
      ? outputs.significantSteps.designState
      : name === "first-limit"
        ? outputs.significantSteps.firstLimit
        : name === "peak"
          ? outputs.significantSteps.peak
          : outputs.significantSteps.lastConverged;
  return step === null ? null : getMasonryArchPathStep(outputs, step);
}
