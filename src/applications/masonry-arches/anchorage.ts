import { evaluateMasonryArchCurveAtStation } from "./geometry.js";
import type {
  BondedLayerExtent,
  ExtradosTendonAnchorage,
  IntradosTendonAnchorage,
  MasonryArchBlockNumbering,
  NormalizedMasonryArchGeometry,
  ResolvedBondedLayerExtent,
  ResolvedExtradosTendonAnchorage,
  ResolvedIntradosTendonAnchorage,
} from "./types.js";

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;

function blockCount(nBlocks: number): number {
  if (!Number.isFinite(nBlocks) || !Number.isInteger(nBlocks) || nBlocks < 2) {
    throw new Error("nBlocks must be a finite integer not smaller than two.");
  }
  return nBlocks;
}

function numberingMode(value: MasonryArchBlockNumbering | undefined): MasonryArchBlockNumbering {
  const numbering = value ?? "oneBased";
  if (numbering !== "oneBased" && numbering !== "zeroBased") {
    throw new Error(`Unsupported block numbering mode: ${String(numbering)}.`);
  }
  return numbering;
}

function blockIndex(
  value: number,
  field: "startBlock" | "endBlock",
  numbering: MasonryArchBlockNumbering,
  nBlocks: number,
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} must be finite.`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer.`);
  }
  const minimum = numbering === "oneBased" ? 1 : 0;
  const maximum = numbering === "oneBased" ? nBlocks : nBlocks - 1;
  if (value < minimum || value > maximum) {
    throw new Error(
      `${field} must be between ${minimum} and ${maximum} for ${numbering} numbering.`,
    );
  }
  return numbering === "oneBased" ? value - 1 : value;
}

function resolveBlockRange(
  startBlock: number,
  endBlock: number,
  numbering: MasonryArchBlockNumbering | undefined,
  nBlocks: number,
): ResolvedBondedLayerExtent {
  const count = blockCount(nBlocks);
  const mode = numberingMode(numbering);
  const startBlockIndex = blockIndex(startBlock, "startBlock", mode, count);
  const endBlockIndex = blockIndex(endBlock, "endBlock", mode, count);
  if (startBlockIndex >= endBlockIndex) {
    throw new Error("startBlock must be strictly smaller than endBlock.");
  }
  return { startBlockIndex, endBlockIndex };
}

function terminalRange(nBlocks: number): ResolvedBondedLayerExtent {
  const count = blockCount(nBlocks);
  return { startBlockIndex: 0, endBlockIndex: count - 1 };
}

/** Resolves the four stable intrados tendon anchorage modes without external coordinates. */
export function resolveIntradosTendonAnchorage(
  anchorage: IntradosTendonAnchorage,
  nBlocks: number,
): ResolvedIntradosTendonAnchorage {
  if (anchorage === null || anchorage === undefined || typeof anchorage !== "object") {
    throw new Error("Intrados tendon anchorage is required.");
  }
  if (anchorage.kind === "customBlocks") {
    const range = resolveBlockRange(
      anchorage.startBlock,
      anchorage.endBlock,
      anchorage.numbering,
      nBlocks,
    );
    return {
      side: "intrados",
      kind: anchorage.kind,
      ...range,
      hasExternalAnchor: false,
      isClosedLoop: false,
      startTerminalDirection: null,
      endTerminalDirection: null,
    };
  }
  const range = terminalRange(nBlocks);
  if (anchorage.kind === "terminalBlocks") {
    return {
      side: "intrados",
      kind: anchorage.kind,
      ...range,
      hasExternalAnchor: false,
      isClosedLoop: false,
      startTerminalDirection: null,
      endTerminalDirection: null,
    };
  }
  if (anchorage.kind === "closedLoop") {
    return {
      side: "intrados",
      kind: anchorage.kind,
      ...range,
      hasExternalAnchor: false,
      isClosedLoop: true,
      startTerminalDirection: { x: 1, y: 0 },
      endTerminalDirection: { x: -1, y: 0 },
    };
  }
  if (anchorage.kind === "externalVertical") {
    return {
      side: "intrados",
      kind: anchorage.kind,
      ...range,
      hasExternalAnchor: true,
      isClosedLoop: false,
      startTerminalDirection: { x: 0, y: -1 },
      endTerminalDirection: { x: 0, y: -1 },
    };
  }
  throw new Error(
    `Unsupported intrados tendon anchorage kind: ${String((anchorage as { kind?: unknown }).kind)}.`,
  );
}

function prescribedAngle(angleDeg: number): {
  readonly angleDeg: number;
  readonly cosine: number;
  readonly sine: number;
} {
  if (!Number.isFinite(angleDeg)) {
    throw new Error("angleDeg must be finite.");
  }
  if (angleDeg < 0 || angleDeg > 90) {
    throw new Error("angleDeg must satisfy 0 <= angleDeg <= 90 degrees.");
  }
  if (angleDeg === 0) return { angleDeg, cosine: 1, sine: 0 };
  if (angleDeg === 90) return { angleDeg, cosine: 0, sine: 1 };
  const radians = (angleDeg * Math.PI) / 180;
  return { angleDeg, cosine: Math.cos(radians), sine: Math.sin(radians) };
}

/** Resolves the three stable extrados tendon anchorage modes without external coordinates. */
export function resolveExtradosTendonAnchorage(
  anchorage: ExtradosTendonAnchorage,
  nBlocks: number,
): ResolvedExtradosTendonAnchorage {
  if (anchorage === null || anchorage === undefined || typeof anchorage !== "object") {
    throw new Error("Extrados tendon anchorage is required.");
  }
  if (anchorage.kind === "terminalBlocks") {
    return {
      side: "extrados",
      kind: anchorage.kind,
      ...terminalRange(nBlocks),
      hasExternalAnchor: false,
      isClosedLoop: false,
      angleDeg: null,
      startTerminalDirection: null,
      endTerminalDirection: null,
    };
  }
  if (anchorage.kind === "customBlocks") {
    return {
      side: "extrados",
      kind: anchorage.kind,
      ...resolveBlockRange(anchorage.startBlock, anchorage.endBlock, anchorage.numbering, nBlocks),
      hasExternalAnchor: false,
      isClosedLoop: false,
      angleDeg: null,
      startTerminalDirection: null,
      endTerminalDirection: null,
    };
  }
  if (anchorage.kind === "externalByAngle") {
    const hasStart = anchorage.startBlock !== undefined;
    const hasEnd = anchorage.endBlock !== undefined;
    if (hasStart !== hasEnd) {
      throw new Error("externalByAngle requires both startBlock and endBlock, or neither.");
    }
    const range = hasStart
      ? resolveBlockRange(anchorage.startBlock, anchorage.endBlock!, anchorage.numbering, nBlocks)
      : terminalRange(nBlocks);
    const angle = prescribedAngle(anchorage.angleDeg);
    return {
      side: "extrados",
      kind: anchorage.kind,
      ...range,
      hasExternalAnchor: true,
      isClosedLoop: false,
      angleDeg: angle.angleDeg,
      startTerminalDirection: { x: angle.cosine === 0 ? 0 : -angle.cosine, y: angle.sine },
      endTerminalDirection: { x: angle.cosine, y: angle.sine },
    };
  }
  throw new Error(
    `Unsupported extrados tendon anchorage kind: ${String((anchorage as { kind?: unknown }).kind)}.`,
  );
}

/** Resolves a bonded layer's effective block extent. It never creates tendon terminal data. */
export function resolveBondedLayerExtent(
  extent: BondedLayerExtent,
  nBlocks: number,
): ResolvedBondedLayerExtent {
  if (extent === null || extent === undefined || typeof extent !== "object") {
    throw new Error("Bonded layer extent is required.");
  }
  return resolveBlockRange(extent.startBlock, extent.endBlock, extent.numbering, nBlocks);
}

function integrateSideArcLength(
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
  start: number,
  end: number,
): number {
  const midpoint = (start + end) / 2;
  const halfLength = (end - start) / 2;
  let result = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = halfLength * GAUSS_NODES[index]!;
    const weight = halfLength * GAUSS_WEIGHTS[index]!;
    result +=
      weight *
      (evaluateMasonryArchCurveAtStation(geometry, midpoint - offset).arcLengthJacobian[side] +
        evaluateMasonryArchCurveAtStation(geometry, midpoint + offset).arcLengthJacobian[side]);
  }
  return result;
}

/** @internal Normalized side-arc stations at all block boundaries. */
export function masonryArchBlockBoundarySideStations(
  geometry: NormalizedMasonryArchGeometry,
  side: "intrados" | "extrados",
): readonly number[] {
  const cumulative = [0];
  for (let index = 0; index < geometry.interfaces.length - 1; index += 1) {
    cumulative.push(
      cumulative[index]! +
        integrateSideArcLength(
          geometry,
          side,
          geometry.interfaces[index]!.station,
          geometry.interfaces[index + 1]!.station,
        ),
    );
  }
  const totalLength = cumulative.at(-1)!;
  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    throw new Error(`The ${side} arch boundary has no positive finite length.`);
  }
  return cumulative.map((length) => length / totalLength);
}
