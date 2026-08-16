/**
 * Independent four-hinge mechanism reference for masonry arches (benchmark-internal, not a
 * library feature).
 *
 * This module reimplements, with entirely independent code, the classical upper-bound limit
 * analysis of a no-tension frictionless masonry arch discretized into rigid blocks: it enumerates
 * four-hinge mechanisms on alternating sides, solves the instantaneous mechanism motion through a
 * 9x8 linear constraint system (three moving assemblies, one degree of freedom), checks opening
 * admissibility at every non-hinge interface, and computes the collapse multiplier by virtual
 * work. It exists ONLY to cross-check the library's limit analysis on the same discretized
 * geometry and the same published block wrenches (software correctness, Phase 3A); it is not used
 * to produce benchmark acceptance values.
 */

interface Block {
  readonly centroid: { readonly x: number; readonly y: number };
}

interface InterfaceGeometry {
  readonly intrados: { readonly x: number; readonly y: number };
  readonly extrados: { readonly x: number; readonly y: number };
  readonly outwardNormal: { readonly x: number; readonly y: number };
}

interface Wrench {
  readonly fx: number;
  readonly fy: number;
  readonly m: number;
}

export interface IndependentMechanismInput {
  readonly blocks: readonly Block[];
  readonly interfaces: readonly InterfaceGeometry[];
  /** Fixed block wrenches (force at the block centroid, moment about it), in block order. */
  readonly fixedWrenches: readonly Wrench[];
  /** Scalable block wrenches at unit lambda, in block order. */
  readonly scalableWrenches: readonly Wrench[];
}

interface Motion {
  readonly vx: number;
  readonly vy: number;
  readonly w: number;
}

/** Velocity of the rigid motion at point p. */
function pointVelocity(
  motion: Motion,
  p: { readonly x: number; readonly y: number },
): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: motion.vx - motion.w * p.y,
    y: motion.vy + motion.w * p.x,
  };
}

/** Solves a small dense linear system with Gaussian elimination; returns null when singular. */
function solveNullSpace(matrix: number[][], rows: number, columns: number): number[] | null {
  // Row-echelon reduction.
  const a = matrix.map((row) => [...row]);
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columns && pivotRow < rows; column += 1) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < rows; row += 1) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[best]![column]!)) best = row;
    }
    if (Math.abs(a[best]![column]!) <= 1e-12) continue;
    [a[pivotRow], a[best]] = [a[best]!, a[pivotRow]!];
    const pivot = a[pivotRow]![column]!;
    for (let column2 = column; column2 < columns; column2 += 1) {
      a[pivotRow]![column2] = a[pivotRow]![column2]! / pivot;
    }
    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow) continue;
      const factor = a[row]![column]!;
      if (Math.abs(factor) <= 1e-14) continue;
      for (let column2 = column; column2 < columns; column2 += 1) {
        a[row]![column2] = a[row]![column2]! - factor * a[pivotRow]![column2]!;
      }
    }
    pivots.push(column);
    pivotRow += 1;
  }
  if (pivots.length !== rows) return null; // Under-determined beyond expectation or singular.
  if (pivots.length >= columns) return null; // No mechanism (full rank).
  // Free variable = first non-pivot column; solve for it = 1.
  const free = Array.from({ length: columns }, (_, column) => !pivots.includes(column)).findIndex(
    (isFree) => isFree,
  );
  if (free < 0) return null;
  const solution = new Array<number>(columns).fill(0);
  solution[free] = 1;
  for (let row = 0; row < rows; row += 1) {
    const pivotColumn = pivots[row]!;
    let value = 0;
    for (let column = pivotColumn + 1; column < columns; column += 1) {
      value -= a[row]![column]! * solution[column]!;
    }
    solution[pivotColumn] = value;
  }
  return solution;
}

/**
 * Enumerates admissible four-hinge mechanisms and returns the minimum virtual-work multiplier
 * together with the winning hinge set, or null when no admissible mechanism exists.
 */
export function independentFourHingeLimitMultiplier(input: IndependentMechanismInput): {
  readonly lambda: number;
  readonly hinges: readonly {
    readonly interfaceIndex: number;
    readonly side: "intrados" | "extrados";
  }[];
} | null {
  const { blocks, interfaces } = input;
  const blockCount = blocks.length;
  const interfaceCount = interfaces.length;
  if (interfaceCount !== blockCount + 1) {
    throw new Error("Independent mechanism reference requires interfaces = blocks + 1.");
  }
  if (input.fixedWrenches.length !== blockCount || input.scalableWrenches.length !== blockCount) {
    throw new Error("Independent mechanism reference requires one wrench per block.");
  }
  let best: {
    readonly lambda: number;
    readonly hinges: { readonly interfaceIndex: number; readonly side: "intrados" | "extrados" }[];
  } | null = null;

  for (let i1 = 0; i1 <= interfaceCount - 4; i1 += 1) {
    for (let i2 = i1 + 1; i2 <= interfaceCount - 3; i2 += 1) {
      for (let i3 = i2 + 1; i3 <= interfaceCount - 2; i3 += 1) {
        for (let i4 = i3 + 1; i4 <= interfaceCount - 1; i4 += 1) {
          for (const side1 of ["intrados", "extrados"] as const) {
            // Admissible four-hinge mechanisms strictly alternate the hinge sides; a mechanism
            // with two adjacent hinges on the same side cannot rotate without interpenetration.
            const side2 = side1 === "intrados" ? "extrados" : "intrados";
            const side3 = side1;
            const side4 = side2;
            const hinges = [
              { interfaceIndex: i1, side: side1 },
              { interfaceIndex: i2, side: side2 },
              { interfaceIndex: i3, side: side3 },
              { interfaceIndex: i4, side: side4 },
            ] as const;
            const result = mechanismMultiplier(input, hinges);
            if (result === null) continue;
            if (best === null || result.lambda < best.lambda) {
              best = { lambda: result.lambda, hinges: [...hinges] };
            }
          }
        }
      }
    }
  }
  return best;
}

function hingePoint(
  geometry: InterfaceGeometry,
  side: "intrados" | "extrados",
): { readonly x: number; readonly y: number } {
  return side === "intrados" ? geometry.intrados : geometry.extrados;
}

export function mechanismMultiplier(
  input: IndependentMechanismInput,
  hinges: readonly { readonly interfaceIndex: number; readonly side: "intrados" | "extrados" }[],
): { readonly lambda: number } | null {
  const { blocks, interfaces } = input;
  const [h1, h2, h3, h4] = hinges;
  // Moving assemblies: [h1.i .. h2.i-1], [h2.i .. h3.i-1], [h3.i .. h4.i-1]. Assemblies outside
  // the hinge range are attached to the fixed supports and do not move.
  const assemblyStart = [h1!.interfaceIndex, h2!.interfaceIndex, h3!.interfaceIndex] as const;
  const assemblyEnd = [
    h2!.interfaceIndex - 1,
    h3!.interfaceIndex - 1,
    h4!.interfaceIndex - 1,
  ] as const;
  if (assemblyStart.some((start, index) => start > assemblyEnd[index]!)) return null;

  // Unknowns: (vx, vy, w) for each of the three moving assemblies → 9 columns.
  const p1 = hingePoint(interfaces[h1!.interfaceIndex]!, h1!.side);
  const p2 = hingePoint(interfaces[h2!.interfaceIndex]!, h2!.side);
  const p3 = hingePoint(interfaces[h3!.interfaceIndex]!, h3!.side);
  const p4 = hingePoint(interfaces[h4!.interfaceIndex]!, h4!.side);
  const columns = 9;
  const rows = 8;
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));
  // Assembly 1 fixed at hinge 1 (2 equations).
  matrix[0]![0] = 1;
  matrix[0]![2] = -p1.y;
  matrix[1]![1] = 1;
  matrix[1]![2] = p1.x;
  // Assembly 1 and 2 equal at hinge 2 (2 equations).
  matrix[2]![0] = 1;
  matrix[2]![2] = -p2.y;
  matrix[2]![3] = -1;
  matrix[2]![5] = p2.y;
  matrix[3]![1] = 1;
  matrix[3]![2] = p2.x;
  matrix[3]![4] = -1;
  matrix[3]![5] = -p2.x;
  // Assembly 2 and 3 equal at hinge 3 (2 equations).
  matrix[4]![3] = 1;
  matrix[4]![5] = -p3.y;
  matrix[4]![6] = -1;
  matrix[4]![8] = p3.y;
  matrix[5]![4] = 1;
  matrix[5]![5] = p3.x;
  matrix[5]![7] = -1;
  matrix[5]![8] = -p3.x;
  // Assembly 3 fixed at hinge 4 (2 equations).
  matrix[6]![6] = 1;
  matrix[6]![8] = -p4.y;
  matrix[7]![7] = 1;
  matrix[7]![8] = p4.x;

  const nullVector = solveNullSpace(matrix, rows, columns);
  if (nullVector === null) return null;
  let assemblies: Motion[] = [0, 1, 2].map((index) => ({
    vx: nullVector[3 * index]!,
    vy: nullVector[3 * index + 1]!,
    w: nullVector[3 * index + 2]!,
  }));

  const motionOfRaw = (blockIndex: number): Motion => {
    for (let assembly = 0; assembly < 3; assembly += 1) {
      if (blockIndex >= assemblyStart[assembly]! && blockIndex <= assemblyEnd[assembly]!) {
        return assemblies[assembly]!;
      }
    }
    return { vx: 0, vy: 0, w: 0 };
  };

  // Virtual work: fixed wrenches plus the unit scalable wrenches, both applied at block
  // centroids (the same application points the library publishes); the velocity must therefore
  // be evaluated at the centroid, not at the motion's reference point.
  const work = (wrenches: readonly Wrench[], motions: (blockIndex: number) => Motion): number => {
    let total = 0;
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const motion = motions(blockIndex);
      const wrench = wrenches[blockIndex]!;
      const centroid = blocks[blockIndex]!.centroid;
      const velocityAtCentroid = {
        x: motion.vx - motion.w * centroid.y,
        y: motion.vy + motion.w * centroid.x,
      };
      total +=
        wrench.fx * velocityAtCentroid.x + wrench.fy * velocityAtCentroid.y + wrench.m * motion.w;
    }
    return total;
  };

  // The null-space direction is arbitrary: orient the mechanism so that the scalable loads do
  // non-negative work (a collapse mechanism is driven by the load, not resisted by it).
  const rawScalableWork = work(input.scalableWrenches, motionOfRaw);
  if (rawScalableWork < 0) {
    assemblies = assemblies.map((motion) => ({ vx: -motion.vx, vy: -motion.vy, w: -motion.w }));
  }

  const motionOf = (blockIndex: number): Motion => {
    for (let assembly = 0; assembly < 3; assembly += 1) {
      if (blockIndex >= assemblyStart[assembly]! && blockIndex <= assemblyEnd[assembly]!) {
        return assemblies[assembly]!;
      }
    }
    return { vx: 0, vy: 0, w: 0 };
  };

  // Admissibility: every non-hinge interface must open (no interpenetration) at both contact
  // sides; hinge interfaces rotate about the pinned edge and are exempt because the contact is
  // concentrated at the pin, where the relative velocity vanishes by construction. Hinge
  // interfaces whose far side stays fully closed with tangential slip are the sliding degeneracy
  // of the frictionless idealization; the enumeration reports them, and the runner certifies a
  // mechanism only when its multiplier agrees with the library's static answer.
  for (let index = 0; index < interfaces.length; index += 1) {
    if (hinges.some((hinge) => hinge.interfaceIndex === index)) continue;
    const left = motionOf(index - 1);
    const right = motionOf(index);
    const geometry = interfaces[index]!;
    const normal = geometry.outwardNormal;
    for (const point of [geometry.intrados, geometry.extrados]) {
      const gap = pointVelocity(left, point);
      const other = pointVelocity(right, point);
      const opening = (other.x - gap.x) * normal.x + (other.y - gap.y) * normal.y;
      if (opening < -1e-9) return null;
    }
  }

  // Virtual work: fixed wrenches plus the unit scalable wrenches, both applied at block
  // centroids (the same application points the library publishes).
  const fixedWork = work(input.fixedWrenches, motionOf);
  const scalableWork = work(input.scalableWrenches, motionOf);
  if (scalableWork <= 1e-14) return null;
  const lambda = -fixedWork / scalableWork;
  if (lambda < 0) return null;
  return { lambda };
}
