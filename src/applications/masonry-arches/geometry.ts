import type {
  RigidBlockPoint2D,
  RigidBlockVector2D,
} from "../../domain/masonry/rigid-blocks/types.js";
import { normalize2d } from "../../domain/masonry/rigid-blocks/vector2d.js";
import type {
  MasonryArchCurveSample,
  MasonryArchInterfaceGeometry,
  MasonryArchReferenceCurve,
  MasonryArchVoussoirGeometry,
  NormalizedMasonryArchGeometry,
  NormalizedMasonryArchProfile,
  SimplifiedSymmetricMasonryArchGeometryInput,
} from "./types.js";

const GAUSS_NODES = [
  0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363,
] as const;
const GAUSS_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
] as const;
const GEOMETRY_TOLERANCE = 1e-12;

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive.`);
  }
  return value;
}

function finiteStation(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function integrateGauss8(functionValue: (parameter: number) => number, start: number, end: number) {
  const midpoint = (start + end) / 2;
  const halfLength = (end - start) / 2;
  let sum = 0;
  for (let index = 0; index < GAUSS_NODES.length; index += 1) {
    const offset = halfLength * GAUSS_NODES[index]!;
    sum +=
      GAUSS_WEIGHTS[index]! * (functionValue(midpoint - offset) + functionValue(midpoint + offset));
  }
  return halfLength * sum;
}

function integrateAdaptiveGauss8(
  functionValue: (parameter: number) => number,
  start: number,
  end: number,
  tolerance = 1e-12,
  remainingDepth = 10,
): number {
  const whole = integrateGauss8(functionValue, start, end);
  const midpoint = (start + end) / 2;
  const left = integrateGauss8(functionValue, start, midpoint);
  const right = integrateGauss8(functionValue, midpoint, end);
  const split = left + right;
  if (remainingDepth <= 0 || Math.abs(split - whole) <= tolerance * Math.max(1, Math.abs(split))) {
    return split;
  }
  return (
    integrateAdaptiveGauss8(functionValue, start, midpoint, tolerance / 2, remainingDepth - 1) +
    integrateAdaptiveGauss8(functionValue, midpoint, end, tolerance / 2, remainingDepth - 1)
  );
}

function normalizeAngle(angle: number, units: "deg" | "rad"): number {
  if (!Number.isFinite(angle)) {
    throw new Error("Elliptical springingAngle must be finite.");
  }
  const radians = units === "deg" ? (angle * Math.PI) / 180 : angle;
  if (radians <= 0 || radians > Math.PI / 2 + GEOMETRY_TOLERANCE) {
    throw new Error("Elliptical springingAngle must satisfy 0 < angle <= 90 degrees.");
  }
  return Math.min(radians, Math.PI / 2);
}

function normalizeProfile(
  profile: SimplifiedSymmetricMasonryArchGeometryInput["profile"],
  span: number,
  rise: number,
): NormalizedMasonryArchProfile {
  const halfSpan = span / 2;
  if (profile.type === "circular") {
    if (rise > halfSpan * (1 + GEOMETRY_TOLERANCE)) {
      throw new Error(
        "Simplified circular geometry requires rise <= span / 2 so the reference curve is single-valued in x.",
      );
    }
    const radius = (halfSpan * halfSpan + rise * rise) / (2 * rise);
    const centerY = rise - radius;
    const halfAngle =
      Math.abs(rise - halfSpan) <= GEOMETRY_TOLERANCE * Math.max(1, halfSpan)
        ? Math.PI / 2
        : Math.asin(halfSpan / radius);
    return {
      type: "circular",
      radius,
      center: { x: 0, y: centerY },
      halfAngle,
      springingAngle: halfAngle,
    };
  }

  const springingAngle = normalizeAngle(profile.springingAngle, profile.angleUnits);
  if (Math.abs(springingAngle - Math.PI / 2) <= GEOMETRY_TOLERANCE) {
    return {
      type: "elliptical",
      semiAxisX: halfSpan,
      semiAxisY: rise,
      halfParameter: Math.PI / 2,
      springingAngle: Math.PI / 2,
    };
  }

  const ratio = (span * Math.tan(springingAngle)) / (2 * rise);
  if (ratio <= 2 + GEOMETRY_TOLERANCE) {
    throw new Error(
      "Elliptical springingAngle must satisfy tan(angle) > 4 rise / span; equality is the parabolic limit.",
    );
  }
  const cosine = 1 / (ratio - 1);
  if (!(cosine > 0 && cosine < 1)) {
    throw new Error("Elliptical geometry parameters do not define a finite symmetric ellipse.");
  }
  const halfParameter = Math.acos(cosine);
  const semiAxisX = halfSpan / Math.sin(halfParameter);
  const semiAxisY = rise / (1 - cosine);
  return {
    type: "elliptical",
    semiAxisX,
    semiAxisY,
    halfParameter,
    springingAngle,
  };
}

function profileSpeed(profile: NormalizedMasonryArchProfile, parameter: number): number {
  if (profile.type === "circular") {
    return profile.radius;
  }
  return Math.hypot(
    profile.semiAxisX * Math.cos(parameter),
    profile.semiAxisY * Math.sin(parameter),
  );
}

function profileCurvature(profile: NormalizedMasonryArchProfile, parameter: number): number {
  if (profile.type === "circular") {
    return 1 / profile.radius;
  }
  const speed = profileSpeed(profile, parameter);
  return (profile.semiAxisX * profile.semiAxisY) / speed ** 3;
}

function profileTotalLength(profile: NormalizedMasonryArchProfile): number {
  if (profile.type === "circular") {
    return 2 * profile.radius * profile.halfAngle;
  }
  return integrateAdaptiveGauss8(
    (parameter) => profileSpeed(profile, parameter),
    -profile.halfParameter,
    profile.halfParameter,
  );
}

function parameterAtStation(
  profile: NormalizedMasonryArchProfile,
  station: number,
  totalLength: number,
): number {
  const clampedStation = Math.min(totalLength, Math.max(0, station));
  if (Math.abs(clampedStation - totalLength / 2) <= GEOMETRY_TOLERANCE * totalLength) {
    return 0;
  }
  if (profile.type === "circular") {
    return -profile.halfAngle + clampedStation / profile.radius;
  }
  if (clampedStation <= 0) return -profile.halfParameter;
  if (clampedStation >= totalLength) return profile.halfParameter;

  let lower = -profile.halfParameter;
  let upper = profile.halfParameter;
  for (let iteration = 0; iteration < 56; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    const length = integrateAdaptiveGauss8(
      (parameter) => profileSpeed(profile, parameter),
      -profile.halfParameter,
      midpoint,
    );
    if (length < clampedStation) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }
  return (lower + upper) / 2;
}

function referencePointAndTangent(
  profile: NormalizedMasonryArchProfile,
  parameter: number,
): { readonly point: RigidBlockPoint2D; readonly tangent: RigidBlockVector2D } {
  if (profile.type === "circular") {
    return {
      point: {
        x: profile.radius * Math.sin(parameter),
        y: profile.center.y + profile.radius * Math.cos(parameter),
      },
      tangent: normalize2d(
        { x: profile.radius * Math.cos(parameter), y: -profile.radius * Math.sin(parameter) },
        "Circular arch tangent",
      ),
    };
  }
  return {
    point: {
      x: profile.semiAxisX * Math.sin(parameter),
      y:
        profile.semiAxisY * Math.cos(parameter) -
        profile.semiAxisY * Math.cos(profile.halfParameter),
    },
    tangent: normalize2d(
      {
        x: profile.semiAxisX * Math.cos(parameter),
        y: -profile.semiAxisY * Math.sin(parameter),
      },
      "Elliptical arch tangent",
    ),
  };
}

function minimumRadiusOfCurvature(profile: NormalizedMasonryArchProfile): number {
  if (profile.type === "circular") {
    return profile.radius;
  }
  const radius = (parameter: number) => {
    const term =
      profile.semiAxisX ** 2 * Math.sin(parameter) ** 2 +
      profile.semiAxisY ** 2 * Math.cos(parameter) ** 2;
    return term ** 1.5 / (profile.semiAxisX * profile.semiAxisY);
  };
  return Math.min(radius(0), radius(profile.halfParameter));
}

function offsetDistances(
  referenceCurve: MasonryArchReferenceCurve,
  thickness: number,
): { readonly intrados: number; readonly centerline: number; readonly extrados: number } {
  if (referenceCurve === "intrados") {
    return { intrados: 0, centerline: thickness / 2, extrados: thickness };
  }
  if (referenceCurve === "centerline") {
    return { intrados: -thickness / 2, centerline: 0, extrados: thickness / 2 };
  }
  return { intrados: -thickness, centerline: -thickness / 2, extrados: 0 };
}

function pointAtOffset(
  point: RigidBlockPoint2D,
  outwardNormal: RigidBlockVector2D,
  offset: number,
): RigidBlockPoint2D {
  return { x: point.x + offset * outwardNormal.x, y: point.y + offset * outwardNormal.y };
}

function polygonProperties(vertices: readonly RigidBlockPoint2D[]): {
  readonly area: number;
  readonly centroid: RigidBlockPoint2D;
} {
  let twiceArea = 0;
  let centroidXNumerator = 0;
  let centroidYNumerator = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidXNumerator += (current.x + next.x) * cross;
    centroidYNumerator += (current.y + next.y) * cross;
  }
  if (!Number.isFinite(twiceArea) || twiceArea <= GEOMETRY_TOLERANCE) {
    throw new Error("Voussoir polygon is degenerate, crossed, or has reversed orientation.");
  }
  return {
    area: twiceArea / 2,
    centroid: {
      x: centroidXNumerator / (3 * twiceArea),
      y: centroidYNumerator / (3 * twiceArea),
    },
  };
}

function stationsForVoussoirs(
  totalLength: number,
  voussoirCount: number,
  keystoneArcLength: number | null,
): number[] {
  if (keystoneArcLength === null) {
    return Array.from(
      { length: voussoirCount + 1 },
      (_, index) => (index * totalLength) / voussoirCount,
    );
  }
  if (voussoirCount % 2 === 0) {
    throw new Error("A custom keystone requires an odd voussoirCount.");
  }
  if (voussoirCount < 3) {
    throw new Error("A custom keystone requires at least three voussoirs.");
  }
  if (keystoneArcLength >= totalLength) {
    throw new Error("Keystone arcLength must be smaller than the complete reference arc length.");
  }

  const sideCount = (voussoirCount - 1) / 2;
  const ordinaryLength = (totalLength - keystoneArcLength) / (voussoirCount - 1);
  const stations = [0];
  for (let index = 1; index <= sideCount; index += 1) {
    stations.push(index * ordinaryLength);
  }
  stations.push(stations.at(-1)! + keystoneArcLength);
  for (let index = 1; index <= sideCount; index += 1) {
    stations.push(stations.at(-1)! + ordinaryLength);
  }
  stations[stations.length - 1] = totalLength;
  return stations;
}

export function evaluateMasonryArchCurveAtStation(
  geometry: Pick<
    NormalizedMasonryArchGeometry,
    "profile" | "referenceCurve" | "thickness" | "totalReferenceArcLength"
  >,
  station: number,
): MasonryArchCurveSample {
  const totalLength = geometry.totalReferenceArcLength;
  const resolvedStation = finiteStation(station, "Arch curve station");
  if (resolvedStation < -GEOMETRY_TOLERANCE || resolvedStation > totalLength + GEOMETRY_TOLERANCE) {
    throw new Error(`Arch curve station must satisfy 0 <= station <= ${totalLength}.`);
  }
  const clampedStation = Math.min(totalLength, Math.max(0, resolvedStation));
  const parameter = parameterAtStation(geometry.profile, clampedStation, totalLength);
  const { point, tangent } = referencePointAndTangent(geometry.profile, parameter);
  const outwardNormal = { x: -tangent.y, y: tangent.x };
  const offsets = offsetDistances(geometry.referenceCurve, geometry.thickness);
  const curvature = profileCurvature(geometry.profile, parameter);
  return {
    station: clampedStation,
    normalizedStation: totalLength === 0 ? 0 : clampedStation / totalLength,
    intrados: pointAtOffset(point, outwardNormal, offsets.intrados),
    centerline: pointAtOffset(point, outwardNormal, offsets.centerline),
    extrados: pointAtOffset(point, outwardNormal, offsets.extrados),
    referencePoint: point,
    chainTangent: tangent,
    outwardNormal,
    arcLengthJacobian: {
      intrados: 1 + offsets.intrados * curvature,
      centerline: 1 + offsets.centerline * curvature,
      extrados: 1 + offsets.extrados * curvature,
    },
  };
}

export function buildSimplifiedMasonryArchGeometry(
  input: SimplifiedSymmetricMasonryArchGeometryInput,
): NormalizedMasonryArchGeometry {
  const span = finitePositive(input.span, "Arch span");
  const rise = finitePositive(input.rise, "Arch rise");
  const thickness = finitePositive(input.thickness, "Arch thickness");
  const outOfPlaneWidth = finitePositive(input.outOfPlaneWidth, "Arch outOfPlaneWidth");
  if (!Number.isInteger(input.voussoirCount) || input.voussoirCount < 2) {
    throw new Error("Arch voussoirCount must be an integer greater than or equal to two.");
  }
  if (input.stationing !== undefined && input.stationing !== "equal-arc-length") {
    throw new Error(`Unsupported arch stationing: ${String(input.stationing)}.`);
  }

  const profile = normalizeProfile(input.profile, span, rise);
  const inwardOffset =
    input.referenceCurve === "extrados"
      ? thickness
      : input.referenceCurve === "centerline"
        ? thickness / 2
        : 0;
  const minimumRadius = minimumRadiusOfCurvature(profile);
  if (inwardOffset >= minimumRadius * (1 - 1e-10)) {
    throw new Error(
      "Arch thickness is incompatible with the minimum radius of curvature of the selected reference curve.",
    );
  }

  const totalReferenceArcLength = profileTotalLength(profile);
  const keystoneArcLength =
    input.keystone === undefined
      ? null
      : finitePositive(input.keystone.arcLength, "Keystone arcLength");
  const stations = stationsForVoussoirs(
    totalReferenceArcLength,
    input.voussoirCount,
    keystoneArcLength,
  );
  const partialGeometry = {
    profile,
    referenceCurve: input.referenceCurve,
    thickness,
    totalReferenceArcLength,
  } as const;
  const curveSamples = stations.map((station) =>
    evaluateMasonryArchCurveAtStation(partialGeometry, station),
  );
  const interfaces: MasonryArchInterfaceGeometry[] = curveSamples.map((sample, index) => {
    const dx = sample.extrados.x - sample.intrados.x;
    const dy = sample.extrados.y - sample.intrados.y;
    const length = Math.hypot(dx, dy);
    return {
      id: `J-${String(index).padStart(3, "0")}`,
      index,
      station: sample.station,
      normalizedStation: sample.normalizedStation,
      intradosPoint: sample.intrados,
      extradosPoint: sample.extrados,
      midpoint: {
        x: (sample.intrados.x + sample.extrados.x) / 2,
        y: (sample.intrados.y + sample.extrados.y) / 2,
      },
      chainTangent: sample.chainTangent,
      jointAxis: normalize2d({ x: dx, y: dy }, `Arch interface ${index} joint axis`),
      length,
      outOfPlaneWidth,
    };
  });

  const keystoneIndex = keystoneArcLength === null ? -1 : (input.voussoirCount - 1) / 2;
  const voussoirs: MasonryArchVoussoirGeometry[] = [];
  for (let index = 0; index < input.voussoirCount; index += 1) {
    const left = curveSamples[index]!;
    const right = curveSamples[index + 1]!;
    const polygon = [left.intrados, right.intrados, right.extrados, left.extrados];
    const properties = polygonProperties(polygon);
    const id = `V-${String(index).padStart(3, "0")}`;
    voussoirs.push({
      id,
      index,
      polygon,
      area: properties.area,
      centroid: properties.centroid,
      outOfPlaneWidth,
      volume: properties.area * outOfPlaneWidth,
      leftInterfaceId: interfaces[index]!.id,
      rightInterfaceId: interfaces[index + 1]!.id,
      startStation: left.station,
      endStation: right.station,
      referenceArcLength: right.station - left.station,
      isKeystone: index === keystoneIndex,
    });
  }

  const maximumJointLengthDeviation = interfaces.reduce(
    (maximum, item) => Math.max(maximum, Math.abs(item.length - thickness)),
    0,
  );
  const polygonArea = voussoirs.reduce((sum, block) => sum + block.area, 0);
  const keystoneVoussoir = keystoneIndex < 0 ? null : voussoirs[keystoneIndex]!;

  return {
    kind: "simplified-symmetric",
    referenceCurve: input.referenceCurve,
    profile,
    span,
    rise,
    thickness,
    outOfPlaneWidth,
    totalReferenceArcLength,
    voussoirCount: input.voussoirCount,
    keystone: {
      present: keystoneArcLength !== null,
      arcLength: keystoneArcLength,
      voussoirId: keystoneVoussoir?.id ?? null,
    },
    curveSamples,
    interfaces,
    voussoirs,
    approximation: { polygonArea, maximumJointLengthDeviation },
  };
}
