import type { WoodArmerResult } from "../types.js";

const ZERO_TOLERANCE = 1e-12;

export interface WoodArmerInput {
  mxx?: number;
  myy?: number;
  mxy?: number;
}

function clean(value: number): number {
  return Math.abs(value) <= ZERO_TOLERANCE ? 0 : value;
}

/**
 * Returns the source-compatible conservative orthogonal Wood-Armer face
 * envelope. Positive moments tension the bottom face and negative moments
 * tension the top face.
 */
export function woodArmer({ mxx, myy, mxy }: WoodArmerInput = {}): WoodArmerResult {
  if (![mxx, myy, mxy].every(Number.isFinite)) {
    throw new Error("woodArmer requires finite mxx, myy and mxy values.");
  }

  const finiteMxx = mxx as number;
  const finiteMyy = myy as number;
  const finiteMxy = mxy as number;
  const torsion = Math.abs(finiteMxy);
  const values = {
    "bottom-x": clean(Math.max(0, finiteMxx + torsion)),
    "bottom-y": clean(Math.max(0, finiteMyy + torsion)),
    "top-x": clean(Math.min(0, finiteMxx - torsion)),
    "top-y": clean(Math.min(0, finiteMyy - torsion)),
  };

  return {
    ...values,
    moments: [
      { id: "bottom-x", face: "bottom", direction: "x", value: values["bottom-x"] },
      { id: "bottom-y", face: "bottom", direction: "y", value: values["bottom-y"] },
      { id: "top-x", face: "top", direction: "x", value: values["top-x"] },
      { id: "top-y", face: "top", direction: "y", value: values["top-y"] },
    ],
    torsionAbsolute: torsion,
    method: "wood-armer-conservative-orthogonal-face-envelope",
  };
}
