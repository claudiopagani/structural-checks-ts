import type {
  RigidBlock2D,
  RigidBlockHinge2D,
  RigidBlockInterface2D,
  RigidBlockNonAssociatedMechanism2D,
  RigidBlockPoint2D,
  RigidBlockSlidingRelease2D,
  RigidBlockVector2D,
} from "./types.js";

type RowPair = readonly [number[], number[]];

function pointJumpRows(
  blocks: readonly RigidBlock2D[],
  interfaceIndex: number,
  point: RigidBlockPoint2D,
): RowPair {
  const rows: RowPair = [
    Array.from({ length: 3 * blocks.length }, () => 0),
    Array.from({ length: 3 * blocks.length }, () => 0),
  ];
  const addBlock = (blockIndex: number, multiplier: number): void => {
    const block = blocks[blockIndex]!;
    const offset = 3 * blockIndex;
    rows[0][offset] = multiplier;
    rows[0][offset + 2] = -multiplier * (point.y - block.centroid.y);
    rows[1][offset + 1] = multiplier;
    rows[1][offset + 2] = multiplier * (point.x - block.centroid.x);
  };
  if (interfaceIndex > 0) addBlock(interfaceIndex - 1, -1);
  if (interfaceIndex < blocks.length) addBlock(interfaceIndex, 1);
  return rows;
}

function rotationJumpRow(blockCount: number, interfaceIndex: number): number[] {
  const row = Array.from({ length: 3 * blockCount }, () => 0);
  if (interfaceIndex > 0) row[3 * (interfaceIndex - 1) + 2] = -1;
  if (interfaceIndex < blockCount) row[3 * interfaceIndex + 2] = 1;
  return row;
}

function projectRows(rows: RowPair, direction: RigidBlockVector2D): number[] {
  return rows[0].map((value, index) => value * direction.x + rows[1][index]! * direction.y);
}

function dotRow(row: readonly number[], vector: readonly number[]): number {
  return row.reduce((sum, coefficient, index) => sum + coefficient * vector[index]!, 0);
}

function nullVector(
  source: readonly (readonly number[])[],
  columnCount: number,
  tolerance: number,
): { readonly rank: number; readonly vector: readonly number[] } {
  const matrix = source.map((row) => [...row]);
  const maximum = matrix.reduce(
    (largest, row) =>
      row.reduce((rowLargest, value) => Math.max(rowLargest, Math.abs(value)), largest),
    0,
  );
  const pivotTolerance = tolerance * Math.max(1, maximum);
  const pivotColumns: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columnCount && pivotRow < matrix.length; column += 1) {
    let bestRow = pivotRow;
    for (let row = pivotRow + 1; row < matrix.length; row += 1) {
      if (Math.abs(matrix[row]![column]!) > Math.abs(matrix[bestRow]![column]!)) bestRow = row;
    }
    const pivot = matrix[bestRow]![column]!;
    if (Math.abs(pivot) <= pivotTolerance) continue;
    [matrix[pivotRow], matrix[bestRow]] = [matrix[bestRow]!, matrix[pivotRow]!];
    for (let entry = column; entry < columnCount; entry += 1) {
      matrix[pivotRow]![entry] = matrix[pivotRow]![entry]! / pivot;
    }
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row]![column]!;
      if (Math.abs(factor) <= pivotTolerance) continue;
      for (let entry = column; entry < columnCount; entry += 1) {
        matrix[row]![entry] = matrix[row]![entry]! - factor * matrix[pivotRow]![entry]!;
      }
    }
    pivotColumns.push(column);
    pivotRow += 1;
  }
  const pivotSet = new Set(pivotColumns);
  const freeColumn = Array.from({ length: columnCount }, (_, index) => index).find(
    (index) => !pivotSet.has(index),
  );
  if (freeColumn === undefined) return { rank: pivotColumns.length, vector: [] };
  const vector = Array.from({ length: columnCount }, () => 0);
  vector[freeColumn] = 1;
  for (let row = pivotColumns.length - 1; row >= 0; row -= 1) {
    const column = pivotColumns[row]!;
    vector[column] = -matrix[row]!.reduce(
      (sum, coefficient, index) => (index === column ? sum : sum + coefficient * vector[index]!),
      0,
    );
  }
  return { rank: pivotColumns.length, vector };
}

function oppositeHingePoint(
  hinge: RigidBlockHinge2D,
  currentInterface: RigidBlockInterface2D,
): RigidBlockPoint2D {
  const multiplier = hinge.side === "intrados" ? 0.5 : -0.5;
  return {
    x:
      currentInterface.midpoint.x +
      multiplier * currentInterface.length * currentInterface.jointAxis.x,
    y:
      currentInterface.midpoint.y +
      multiplier * currentInterface.length * currentInterface.jointAxis.y,
  };
}

/**
 * Checks one active set for a one-degree-of-freedom, zero-dilation Coulomb mechanism.
 * Multi-dimensional active sets are reported but deliberately not resolved by an arbitrary vector.
 */
export function extractNonAssociatedMechanism2D(
  {
    blocks,
    interfaces,
    hinges,
    slidingInterfaces,
  }: {
    readonly blocks: readonly RigidBlock2D[];
    readonly interfaces: readonly RigidBlockInterface2D[];
    readonly hinges: readonly RigidBlockHinge2D[];
    readonly slidingInterfaces: readonly RigidBlockSlidingRelease2D[];
  },
  tolerance = 1e-10,
): RigidBlockNonAssociatedMechanism2D {
  if (interfaces.length !== blocks.length + 1) {
    throw new Error("Non-associated mechanism extraction requires one more interface than blocks.");
  }
  const hingeByIndex = new Map(hinges.map((hinge) => [hinge.interfaceIndex, hinge]));
  const slidingByIndex = new Map(
    slidingInterfaces.map((sliding) => [sliding.interfaceIndex, sliding]),
  );
  const rows: number[][] = [];

  for (let index = 0; index < interfaces.length; index += 1) {
    const currentInterface = interfaces[index]!;
    const hinge = hingeByIndex.get(index);
    const sliding = slidingByIndex.get(index);
    const point = hinge?.point ?? currentInterface.midpoint;
    const jumpRows = pointJumpRows(blocks, index, point);
    if (hinge !== undefined && sliding !== undefined) {
      rows.push(projectRows(jumpRows, currentInterface.chainTangent));
    } else if (hinge !== undefined) {
      rows.push(jumpRows[0], jumpRows[1]);
    } else if (sliding !== undefined) {
      rows.push(
        projectRows(jumpRows, currentInterface.chainTangent),
        rotationJumpRow(blocks.length, index),
      );
    } else {
      rows.push(jumpRows[0], jumpRows[1], rotationJumpRow(blocks.length, index));
    }
  }

  const columnCount = 3 * blocks.length;
  const result = nullVector(rows, columnCount, tolerance);
  const degreesOfFreedom = columnCount - result.rank;
  if (degreesOfFreedom !== 1 || result.vector.length === 0) {
    return {
      verified: false,
      degreesOfFreedom,
      rank: result.rank,
      maximumConstraintResidual: 0,
      motions: [],
      flowRuleVerified: false,
      maximumFlowViolation: 0,
      slidingRates: [],
    };
  }

  const lengthScale = Math.max(
    1,
    interfaces.at(-1)!.midpoint.x - interfaces[0]!.midpoint.x,
    ...interfaces.map((item) => item.length),
  );
  const amplitude = blocks.reduce((maximum, _block, index) => {
    const offset = 3 * index;
    return Math.max(
      maximum,
      Math.hypot(result.vector[offset]!, result.vector[offset + 1]!),
      Math.abs(result.vector[offset + 2]!) * lengthScale,
    );
  }, 0);
  const base = result.vector.map((value) => value / amplitude);
  const maximumConstraintResidual = rows.reduce((maximum, row) => {
    const rowNorm = Math.hypot(...row);
    return Math.max(maximum, Math.abs(dotRow(row, base)) / Math.max(1, rowNorm));
  }, 0);

  const assess = (factor: 1 | -1) => {
    const vector = base.map((value) => factor * value);
    let maximumViolation = 0;
    const slidingRates = slidingInterfaces.map((sliding) => {
      const currentInterface = interfaces[sliding.interfaceIndex]!;
      const hinge = hingeByIndex.get(sliding.interfaceIndex);
      const jumpRows = pointJumpRows(
        blocks,
        sliding.interfaceIndex,
        hinge?.point ?? currentInterface.midpoint,
      );
      const tangentialRate = dotRow(projectRows(jumpRows, currentInterface.jointAxis), vector);
      const normalRate = dotRow(projectRows(jumpRows, currentInterface.chainTangent), vector);
      // Stored section resultants act oppositely to the traction on the left block face;
      // therefore positive plastic dissipation requires slip opposite to the stored shear sign.
      const directionFactor = sliding.direction === "positive" ? -1 : 1;
      const directedRate = directionFactor * tangentialRate;
      maximumViolation = Math.max(maximumViolation, Math.abs(normalRate), -directedRate);
      return {
        interfaceId: sliding.interfaceId,
        interfaceIndex: sliding.interfaceIndex,
        tangentialRate,
        normalRate,
        directionVerified: directedRate > tolerance,
      };
    });
    for (const hinge of hinges) {
      const currentInterface = interfaces[hinge.interfaceIndex]!;
      const opposite = oppositeHingePoint(hinge, currentInterface);
      const openingRate = dotRow(
        projectRows(
          pointJumpRows(blocks, hinge.interfaceIndex, opposite),
          currentInterface.chainTangent,
        ),
        vector,
      );
      maximumViolation = Math.max(maximumViolation, -openingRate);
    }
    return { vector, maximumViolation, slidingRates };
  };
  const positive = assess(1);
  const negative = assess(-1);
  const selected = positive.maximumViolation <= negative.maximumViolation ? positive : negative;
  const flowRuleVerified =
    selected.maximumViolation <= 10 * tolerance &&
    selected.slidingRates.every((rate) => rate.directionVerified);
  const motions = blocks.map((block, index) => ({
    blockId: block.id,
    translation: {
      x: selected.vector[3 * index]!,
      y: selected.vector[3 * index + 1]!,
    },
    rotation: selected.vector[3 * index + 2]!,
  }));
  return {
    verified: flowRuleVerified && maximumConstraintResidual <= 10 * tolerance,
    degreesOfFreedom,
    rank: result.rank,
    maximumConstraintResidual,
    motions,
    flowRuleVerified,
    maximumFlowViolation: Math.max(0, selected.maximumViolation),
    slidingRates: selected.slidingRates,
  };
}
