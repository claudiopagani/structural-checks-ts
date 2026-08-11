import type {
  RigidBlock2D,
  RigidBlockHinge2D,
  RigidBlockInterface2D,
  RigidBlockKinematicMechanism2D,
  RigidBlockPoint2D,
} from "./types.js";

interface RigidGroup {
  readonly blockIndices: number[];
  readonly origin: RigidBlockPoint2D;
}

function buildGroups(
  blocks: readonly RigidBlock2D[],
  hingesByInterface: ReadonlyMap<number, RigidBlockHinge2D>,
): { readonly groups: readonly RigidGroup[]; readonly groupByBlock: readonly number[] } {
  const groupedIndices: number[][] = [[]];
  const groupByBlock: number[] = [];
  let groupIndex = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    if (blockIndex > 0 && hingesByInterface.has(blockIndex)) {
      groupIndex += 1;
      groupedIndices.push([]);
    }
    groupedIndices[groupIndex]!.push(blockIndex);
    groupByBlock.push(groupIndex);
  }
  const groups = groupedIndices.map((blockIndices) => ({
    blockIndices,
    origin: blockIndices.reduce(
      (sum, blockIndex) => ({
        x: sum.x + blocks[blockIndex]!.centroid.x / blockIndices.length,
        y: sum.y + blocks[blockIndex]!.centroid.y / blockIndices.length,
      }),
      { x: 0, y: 0 },
    ),
  }));
  return { groups, groupByBlock };
}

function pointVelocityRows(
  groupIndex: number,
  groupOrigin: RigidBlockPoint2D,
  point: RigidBlockPoint2D,
  groupCount: number,
  multiplier = 1,
): [number[], number[]] {
  const xRow = Array.from({ length: 3 * groupCount }, () => 0);
  const yRow = Array.from({ length: 3 * groupCount }, () => 0);
  const offset = 3 * groupIndex;
  xRow[offset] = multiplier;
  xRow[offset + 2] = -multiplier * (point.y - groupOrigin.y);
  yRow[offset + 1] = multiplier;
  yRow[offset + 2] = multiplier * (point.x - groupOrigin.x);
  return [xRow, yRow];
}

function addRows(
  target: number[][],
  left: [number[], number[]],
  right?: [number[], number[]],
): void {
  if (right === undefined) {
    target.push(left[0], left[1]);
    return;
  }
  target.push(
    left[0].map((value, index) => value + right[0][index]!),
    left[1].map((value, index) => value + right[1][index]!),
  );
}

function addFixedGroupRows(target: number[][], groupIndex: number, groupCount: number): void {
  for (let component = 0; component < 3; component += 1) {
    const row = Array.from({ length: 3 * groupCount }, () => 0);
    row[3 * groupIndex + component] = 1;
    target.push(row);
  }
}

function rrefNullVector(
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
    const pivoted = matrix[pivotRow]!;
    for (let entry = column; entry < columnCount; entry += 1) {
      pivoted[entry] = pivoted[entry]! / pivot;
    }
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row]![column]!;
      if (Math.abs(factor) <= pivotTolerance) continue;
      for (let entry = column; entry < columnCount; entry += 1) {
        matrix[row]![entry] = matrix[row]![entry]! - factor * pivoted[entry]!;
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

/** Extracts a small-displacement rigid-block mechanism from a declared active-hinge set. */
export function extractRigidBlockMechanism2D(
  {
    blocks,
    interfaces,
    hinges,
  }: {
    readonly blocks: readonly RigidBlock2D[];
    readonly interfaces: readonly RigidBlockInterface2D[];
    readonly hinges: readonly RigidBlockHinge2D[];
  },
  tolerance = 1e-10,
): RigidBlockKinematicMechanism2D {
  if (interfaces.length !== blocks.length + 1) {
    throw new Error("Rigid-block mechanism extraction requires one more interface than blocks.");
  }
  const hingesByInterface = new Map<number, RigidBlockHinge2D>();
  for (const hinge of hinges) {
    if (hingesByInterface.has(hinge.interfaceIndex)) {
      throw new Error(`Multiple hinge points were assigned to interface ${hinge.interfaceId}.`);
    }
    hingesByInterface.set(hinge.interfaceIndex, hinge);
  }
  const { groups, groupByBlock } = buildGroups(blocks, hingesByInterface);
  const rows: number[][] = [];
  const groupCount = groups.length;
  const leftHinge = hingesByInterface.get(0);
  if (leftHinge === undefined) {
    addFixedGroupRows(rows, 0, groupCount);
  } else {
    addRows(rows, pointVelocityRows(0, groups[0]!.origin, leftHinge.point, groupCount));
  }
  for (let interfaceIndex = 1; interfaceIndex < interfaces.length - 1; interfaceIndex += 1) {
    const hinge = hingesByInterface.get(interfaceIndex);
    if (hinge === undefined) continue;
    const leftGroup = groupByBlock[interfaceIndex - 1]!;
    const rightGroup = groupByBlock[interfaceIndex]!;
    addRows(
      rows,
      pointVelocityRows(leftGroup, groups[leftGroup]!.origin, hinge.point, groupCount),
      pointVelocityRows(rightGroup, groups[rightGroup]!.origin, hinge.point, groupCount, -1),
    );
  }
  const rightInterfaceIndex = interfaces.length - 1;
  const rightGroup = groupCount - 1;
  const rightHinge = hingesByInterface.get(rightInterfaceIndex);
  if (rightHinge === undefined) {
    addFixedGroupRows(rows, rightGroup, groupCount);
  } else {
    addRows(
      rows,
      pointVelocityRows(rightGroup, groups[rightGroup]!.origin, rightHinge.point, groupCount),
    );
  }

  const columnCount = 3 * groupCount;
  const nullResult = rrefNullVector(rows, columnCount, tolerance);
  const degreesOfFreedom = columnCount - nullResult.rank;
  if (degreesOfFreedom <= 0 || nullResult.vector.length === 0) {
    return {
      verified: false,
      degreesOfFreedom: 0,
      rank: nullResult.rank,
      maximumConstraintResidual: 0,
      motions: [],
    };
  }
  const lengthScale = Math.max(
    1,
    interfaces.at(-1)!.midpoint.x - interfaces[0]!.midpoint.x,
    ...interfaces.map((item) => item.length),
  );
  const amplitude = groups.reduce((maximum, group, groupIndex) => {
    const offset = 3 * groupIndex;
    return Math.max(
      maximum,
      Math.hypot(nullResult.vector[offset]!, nullResult.vector[offset + 1]!),
      Math.abs(nullResult.vector[offset + 2]!) * lengthScale,
    );
  }, 0);
  const normalized = nullResult.vector.map((value) => value / amplitude);
  const maximumConstraintResidual = rows.reduce((maximum, row) => {
    const residual = row.reduce(
      (sum, coefficient, index) => sum + coefficient * normalized[index]!,
      0,
    );
    const rowNorm = Math.hypot(...row);
    return Math.max(maximum, Math.abs(residual) / Math.max(1, rowNorm));
  }, 0);
  const motions = blocks.map((block, blockIndex) => {
    const currentGroup = groupByBlock[blockIndex]!;
    const origin = groups[currentGroup]!.origin;
    const offset = 3 * currentGroup;
    const rotation = normalized[offset + 2]!;
    return {
      blockId: block.id,
      translation: {
        x: normalized[offset]! - rotation * (block.centroid.y - origin.y),
        y: normalized[offset + 1]! + rotation * (block.centroid.x - origin.x),
      },
      rotation,
    };
  });
  return {
    verified: maximumConstraintResidual <= 10 * tolerance,
    degreesOfFreedom,
    rank: nullResult.rank,
    maximumConstraintResidual,
    motions,
  };
}
