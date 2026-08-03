// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelSectionClassification.js.

import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { clamp, roundTo } from "../../../domain/math/arrayLinearAlgebra.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystemInput;
const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const RECTANGULAR_HOLLOW_FAMILIES = new Set(["SHS", "RHS"]);
const CIRCULAR_HOLLOW_FAMILIES = new Set(["CHS"]);
const SOLID_NON_SLENDER_FAMILIES = new Set(["ROUND"]);
const OUTSTAND_PROFILE_FAMILIES = new Set(["L", "LU", "T", "FLAT"]);
const SUPPORTED_FAMILIES = new Set([
  ...I_H_FAMILIES,
  "UPN",
  ...RECTANGULAR_HOLLOW_FAMILIES,
  ...CIRCULAR_HOLLOW_FAMILIES,
  ...SOLID_NON_SLENDER_FAMILIES,
  ...OUTSTAND_PROFILE_FAMILIES,
]);
const FORCE_TOLERANCE = 1e-6;
const MOMENT_TOLERANCE = 1e-6;

type NumericValue = number | null | undefined;

export interface SteelSectionClassificationCatalogPropertiesLike {
  [key: string]: unknown;
  family?: string | null;
  h?: number | null;
  b?: number | null;
  tw?: number | null;
  tf?: number | null;
  r?: number | null;
}

export interface SteelSectionClassificationSectionMetadataLike {
  unitSystem?: UnitSystemInput | null;
}

export interface SteelSectionClassificationSectionLike {
  [key: string]: unknown;
  family?: string | null;
  profileName?: string | null;
  catalogProperties?: SteelSectionClassificationCatalogPropertiesLike | null;
  metadata?: SteelSectionClassificationSectionMetadataLike | null;
  height?: number | null;
  width?: number | null;
  webThickness?: number | null;
  flangeThickness?: number | null;
  rootRadius?: number | null;
  area?: number | null;
  inertiaY?: number | null;
  inertiaZ?: number | null;
}

export interface SteelSectionClassificationMaterialLike {
  fyk?: number | null;
  fyd?: number | null;
}

export interface SteelSectionClassificationLimits {
  class1: number;
  class2: number;
  class3: number;
}

export interface SteelSectionClassificationPart {
  id: string;
  type: string;
  compression: boolean;
  c: NumericValue;
  t: NumericValue;
  ratio: NumericValue;
  limits: SteelSectionClassificationLimits | null;
  class: number | null;
  metadata: Record<string, unknown>;
}

export interface SteelSectionClassificationResult {
  status: ResultStatus;
  class: number;
  epsilon: number | null;
  family: string;
  profileName: string | null;
  parts: SteelSectionClassificationPart[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface ClassifySteelSectionOptions {
  section?: SteelSectionClassificationSectionLike | null | undefined;
  material?: SteelSectionClassificationMaterialLike | null | undefined;
  nEd?: number | null | undefined;
  mEd?: number | null | undefined;
  mzEd?: number | null | undefined;
  axialForceConvention?: string | null | undefined;
}

interface SteelSectionDimensions {
  h: NumericValue;
  b: NumericValue;
  tw: NumericValue;
  tf: NumericValue;
  r: NumericValue;
}

interface SteelPlateStressParametersWithoutCompression {
  compressionExists: false;
  alpha: 0;
  psi: null;
  firstStress: number;
  secondStress: number;
}

interface SteelPlateStressParametersWithCompression {
  compressionExists: true;
  alpha: number;
  psi: number;
  firstStress: number;
  secondStress: number;
}

type SteelPlateStressParameters =
  | SteelPlateStressParametersWithoutCompression
  | SteelPlateStressParametersWithCompression;

function round(value: number): number;
function round(value: NumericValue): NumericValue;
function round(value: unknown): unknown;
function round(value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? roundTo(value) : value;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedNumber(value: unknown): number {
  return Number(value);
}

function zeroTinyAction(value: number, tolerance: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.abs(value) <= tolerance ? 0 : value;
}

function steelYieldStrength(
  material: SteelSectionClassificationMaterialLike | null | undefined,
): number | null | undefined {
  return material?.fyk ?? material?.fyd ?? null;
}

function normalizedFamily(
  section: SteelSectionClassificationSectionLike | null | undefined,
): string {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function sectionResolver(
  section: SteelSectionClassificationSectionLike | null | undefined,
): UnitResolver {
  return createUnitResolver(section?.metadata?.unitSystem ?? INTERNAL_UNITS, INTERNAL_UNITS);
}

function resolveProfileDimensions(
  section: SteelSectionClassificationSectionLike | null | undefined,
): SteelSectionDimensions {
  const resolver = sectionResolver(section);

  return {
    h: resolver.length(section?.height ?? section?.catalogProperties?.h),
    b: resolver.length(section?.width ?? section?.catalogProperties?.b),
    tw: resolver.length(section?.webThickness ?? section?.catalogProperties?.tw),
    tf: resolver.length(section?.flangeThickness ?? section?.catalogProperties?.tf),
    r: resolver.length(section?.rootRadius ?? section?.catalogProperties?.r ?? 0) ?? 0,
  };
}

function classifyByLimits(
  ratio: NumericValue,
  limits: SteelSectionClassificationLimits,
): number | null {
  if (!isFiniteNumber(ratio)) {
    return null;
  }

  if (ratio <= limits.class1) {
    return 1;
  }

  if (ratio <= limits.class2) {
    return 2;
  }

  if (ratio <= limits.class3) {
    return 3;
  }

  return 4;
}

function outstandFlangeLimits(epsilon: number): SteelSectionClassificationLimits {
  return {
    class1: 9 * epsilon,
    class2: 10 * epsilon,
    class3: 14 * epsilon,
  };
}

function circularHollowLimits(epsilon: number): SteelSectionClassificationLimits {
  const epsilonSquared = epsilon ** 2;

  return {
    class1: 50 * epsilonSquared,
    class2: 70 * epsilonSquared,
    class3: 90 * epsilonSquared,
  };
}

function internalWebLimits({
  epsilon,
  alpha,
  psi,
}: {
  epsilon: number;
  alpha: number;
  psi: number;
}): SteelSectionClassificationLimits {
  const safeAlpha = clamp(alpha, 1e-6, 1);
  const class1 =
    safeAlpha > 0.5 ? (396 * epsilon) / (13 * safeAlpha - 1) : (36 * epsilon) / safeAlpha;
  const class2 =
    safeAlpha > 0.5 ? (456 * epsilon) / (13 * safeAlpha - 1) : (41.5 * epsilon) / safeAlpha;
  const class3 =
    psi > -1 ? (42 * epsilon) / (0.67 + 0.33 * psi) : 62 * epsilon * (1 - psi) * Math.sqrt(-psi);

  return {
    class1,
    class2,
    class3,
  };
}

function compressionAxialForce(
  nEd: number,
  convention: string | null | undefined = "absolute",
): number {
  if (!Number.isFinite(nEd)) {
    return 0;
  }

  if (convention === "compression-positive") {
    return Math.max(nEd, 0);
  }

  if (convention === "compression-negative") {
    return Math.max(-nEd, 0);
  }

  return Math.abs(nEd);
}

function stressAtY({
  nCompression,
  mAbs,
  area,
  inertia,
  y,
}: {
  nCompression: number;
  mAbs: number;
  area: NumericValue;
  inertia: NumericValue;
  y: number;
}): number {
  const axialStress = isFinitePositive(area) ? nCompression / area : 0;
  const bendingStress = isFinitePositive(inertia) ? (mAbs * y) / inertia : 0;

  return axialStress + bendingStress;
}

function stressAtPoint({
  nCompression,
  myAbs = 0,
  mzAbs = 0,
  area,
  inertiaY,
  inertiaZ,
  y = 0,
  z = 0,
}: {
  nCompression: number;
  myAbs?: number;
  mzAbs?: number;
  area: NumericValue;
  inertiaY: NumericValue;
  inertiaZ: NumericValue;
  y?: number;
  z?: number;
}): number {
  const axialStress = isFinitePositive(area) ? nCompression / area : 0;
  const yBendingStress = isFinitePositive(inertiaY) ? (myAbs * y) / inertiaY : 0;
  const zBendingStress = isFinitePositive(inertiaZ) ? (mzAbs * z) / inertiaZ : 0;

  return axialStress + yBendingStress + zBendingStress;
}

function plateStressParameters({
  firstStress,
  secondStress,
}: {
  firstStress: number;
  secondStress: number;
}): SteelPlateStressParameters {
  const sigmaMax = Math.max(firstStress, secondStress);
  const sigmaMin = Math.min(firstStress, secondStress);

  if (sigmaMax <= 0) {
    return {
      compressionExists: false,
      alpha: 0,
      psi: null,
      firstStress,
      secondStress,
    };
  }

  const alpha = sigmaMin >= 0 ? 1 : clamp(sigmaMax / (sigmaMax - sigmaMin), 0, 1);
  const psi = sigmaMax === 0 ? 1 : sigmaMin / sigmaMax;

  return {
    compressionExists: true,
    alpha,
    psi,
    firstStress,
    secondStress,
  };
}

function webStressParameters({
  section,
  nCompression,
  mAbs,
  clearWebDepth,
}: {
  section: SteelSectionClassificationSectionLike | null | undefined;
  nCompression: number;
  mAbs: number;
  clearWebDepth: number;
}): SteelPlateStressParameters & { topStress: number; bottomStress: number } {
  const y = clearWebDepth / 2;
  const topStress = stressAtY({
    nCompression,
    mAbs,
    area: section?.area,
    inertia: section?.inertiaY,
    y,
  });
  const bottomStress = stressAtY({
    nCompression,
    mAbs,
    area: section?.area,
    inertia: section?.inertiaY,
    y: -y,
  });
  const stress = plateStressParameters({
    firstStress: topStress,
    secondStress: bottomStress,
  });

  return {
    ...stress,
    topStress,
    bottomStress,
  };
}

function flangeOutstandWidth({
  family,
  dimensions,
}: {
  family: string;
  dimensions: SteelSectionDimensions;
}): { c: number | null; formula: string | null } {
  const { b, tw, r } = dimensions;

  if (I_H_FAMILIES.has(family)) {
    return {
      c: (normalizedNumber(b) - normalizedNumber(tw) - 2 * normalizedNumber(r)) / 2,
      formula: "(b - tw - 2r) / 2",
    };
  }

  if (family === "UPN") {
    return {
      c: normalizedNumber(b) - normalizedNumber(tw) / 2 - normalizedNumber(r),
      formula: "b - tw / 2 - r",
    };
  }

  return {
    c: null,
    formula: null,
  };
}

function classifyFlange({
  family,
  dimensions,
  epsilon,
}: {
  family: string;
  dimensions: SteelSectionDimensions;
  epsilon: number;
}): SteelSectionClassificationPart {
  const { c, formula } = flangeOutstandWidth({ family, dimensions });
  const ratio = isFinitePositive(dimensions.tf) ? normalizedNumber(c) / dimensions.tf : null;
  const limits = outstandFlangeLimits(epsilon);
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id: "flange",
    type: "outstand-flange",
    compression: true,
    c: round(c),
    t: round(dimensions.tf),
    ratio: round(ratio),
    limits: {
      class1: round(limits.class1),
      class2: round(limits.class2),
      class3: round(limits.class3),
    },
    class: sectionClass,
    metadata: {
      formula,
    },
  };
}

function roundedLimits(limits: SteelSectionClassificationLimits): SteelSectionClassificationLimits {
  return {
    class1: round(limits.class1),
    class2: round(limits.class2),
    class3: round(limits.class3),
  };
}

function classifyOutstandPart({
  id,
  type = "outstand-element",
  c,
  t,
  epsilon,
  formula,
}: {
  id: string;
  type?: string;
  c: number;
  t: number;
  epsilon: number;
  formula: string;
}): SteelSectionClassificationPart {
  const ratio = isFinitePositive(t) ? c / t : null;
  const limits = outstandFlangeLimits(epsilon);
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id,
    type,
    compression: true,
    c: round(c),
    t: round(t),
    ratio: round(ratio),
    limits: roundedLimits(limits),
    class: sectionClass,
    metadata: {
      formula,
    },
  };
}

function classifyInternalPart({
  id,
  type = "internal-compression-part",
  c,
  t,
  epsilon,
  stress,
  metadata = {},
}: {
  id: string;
  type?: string;
  c: number;
  t: number;
  epsilon: number;
  stress: SteelPlateStressParameters;
  metadata?: Record<string, unknown>;
}): SteelSectionClassificationPart {
  const ratio = isFinitePositive(t) ? c / t : null;

  if (!stress.compressionExists) {
    return {
      id,
      type,
      compression: false,
      c: round(c),
      t: round(t),
      ratio: round(ratio),
      limits: null,
      class: 1,
      metadata: {
        ...metadata,
        firstStress: round(stress.firstStress),
        secondStress: round(stress.secondStress),
      },
    };
  }

  const limits = internalWebLimits({
    epsilon,
    alpha: stress.alpha,
    psi: stress.psi,
  });
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id,
    type,
    compression: true,
    c: round(c),
    t: round(t),
    ratio: round(ratio),
    limits: roundedLimits(limits),
    class: sectionClass,
    metadata: {
      ...metadata,
      alpha: round(stress.alpha),
      psi: round(stress.psi),
      firstStress: round(stress.firstStress),
      secondStress: round(stress.secondStress),
    },
  };
}

function classifyWeb({
  section,
  dimensions,
  epsilon,
  nCompression,
  mAbs,
}: {
  section: SteelSectionClassificationSectionLike | null | undefined;
  dimensions: SteelSectionDimensions;
  epsilon: number;
  nCompression: number;
  mAbs: number;
}): SteelSectionClassificationPart {
  const c =
    normalizedNumber(dimensions.h) -
    2 * normalizedNumber(dimensions.tf) -
    2 * normalizedNumber(dimensions.r);
  const ratio = isFinitePositive(dimensions.tw) ? c / dimensions.tw : null;
  const stress = webStressParameters({
    section,
    nCompression,
    mAbs,
    clearWebDepth: c,
  });

  if (!stress.compressionExists) {
    return {
      id: "web",
      type: "internal-web",
      compression: false,
      c: round(c),
      t: round(dimensions.tw),
      ratio: round(ratio),
      limits: null,
      class: 1,
      metadata: {
        topStress: round(stress.topStress),
        bottomStress: round(stress.bottomStress),
      },
    };
  }

  const limits = internalWebLimits({
    epsilon,
    alpha: stress.alpha,
    psi: stress.psi,
  });
  const sectionClass = classifyByLimits(ratio, limits);

  return {
    id: "web",
    type: "internal-web",
    compression: true,
    c: round(c),
    t: round(dimensions.tw),
    ratio: round(ratio),
    limits: roundedLimits(limits),
    class: sectionClass,
    metadata: {
      alpha: round(stress.alpha),
      psi: round(stress.psi),
      topStress: round(stress.topStress),
      bottomStress: round(stress.bottomStress),
    },
  };
}

function classifyCircularHollow({
  dimensions,
  epsilon,
}: {
  dimensions: SteelSectionDimensions;
  epsilon: number;
}): SteelSectionClassificationPart[] {
  const diameter = normalizedNumber(dimensions.h);
  const thickness = normalizedNumber(dimensions.tw);
  const ratio = isFinitePositive(thickness) ? diameter / thickness : null;
  const limits = circularHollowLimits(epsilon);
  const sectionClass = classifyByLimits(ratio, limits);

  return [
    {
      id: "wall",
      type: "circular-hollow-wall",
      compression: true,
      c: round(diameter),
      t: round(thickness),
      ratio: round(ratio),
      limits: roundedLimits(limits),
      class: sectionClass,
      metadata: {
        formula: "D / t",
      },
    },
  ];
}

function classifyRectangularHollow({
  section,
  dimensions,
  epsilon,
  nCompression,
  myAbs,
  mzAbs,
}: {
  section: SteelSectionClassificationSectionLike | null | undefined;
  dimensions: SteelSectionDimensions;
  epsilon: number;
  nCompression: number;
  myAbs: number;
  mzAbs: number;
}): SteelSectionClassificationPart[] {
  const t = normalizedNumber(dimensions.tw);
  const clearHeight = normalizedNumber(dimensions.h) - 2 * t - 2 * normalizedNumber(dimensions.r);
  const clearWidth = normalizedNumber(dimensions.b) - 2 * t - 2 * normalizedNumber(dimensions.r);
  const webZ = Math.max(
    0,
    normalizedNumber(dimensions.b) / 2 - t / 2 - normalizedNumber(dimensions.r),
  );
  const flangeY = Math.max(
    0,
    normalizedNumber(dimensions.h) / 2 - t / 2 - normalizedNumber(dimensions.r),
  );
  const webStress = plateStressParameters({
    firstStress: stressAtPoint({
      nCompression,
      myAbs,
      mzAbs,
      area: section?.area,
      inertiaY: section?.inertiaY,
      inertiaZ: section?.inertiaZ,
      y: clearHeight / 2,
      z: webZ,
    }),
    secondStress: stressAtPoint({
      nCompression,
      myAbs,
      mzAbs,
      area: section?.area,
      inertiaY: section?.inertiaY,
      inertiaZ: section?.inertiaZ,
      y: -clearHeight / 2,
      z: webZ,
    }),
  });
  const flangeStress = plateStressParameters({
    firstStress: stressAtPoint({
      nCompression,
      myAbs,
      mzAbs,
      area: section?.area,
      inertiaY: section?.inertiaY,
      inertiaZ: section?.inertiaZ,
      y: flangeY,
      z: clearWidth / 2,
    }),
    secondStress: stressAtPoint({
      nCompression,
      myAbs,
      mzAbs,
      area: section?.area,
      inertiaY: section?.inertiaY,
      inertiaZ: section?.inertiaZ,
      y: flangeY,
      z: -clearWidth / 2,
    }),
  });

  return [
    classifyInternalPart({
      id: "web",
      type: "rectangular-hollow-web",
      c: clearHeight,
      t,
      epsilon,
      stress: webStress,
      metadata: {
        formula: "h - 2t - 2r",
        zCoordinate: round(webZ),
      },
    }),
    classifyInternalPart({
      id: "flange",
      type: "rectangular-hollow-flange",
      c: clearWidth,
      t,
      epsilon,
      stress: flangeStress,
      metadata: {
        formula: "b - 2t - 2r",
        yCoordinate: round(flangeY),
      },
    }),
  ];
}

function classifySolidRound(): SteelSectionClassificationPart[] {
  return [
    {
      id: "solid-round",
      type: "solid-round",
      compression: true,
      c: null,
      t: null,
      ratio: 0,
      limits: null,
      class: 1,
      metadata: {
        formula: "solid circular bars are treated as non-slender sections",
      },
    },
  ];
}

function classifyFlat({
  dimensions,
  epsilon,
}: {
  dimensions: SteelSectionDimensions;
  epsilon: number;
}): SteelSectionClassificationPart[] {
  const c = Math.max(normalizedNumber(dimensions.h), normalizedNumber(dimensions.b));
  const t = Math.min(normalizedNumber(dimensions.h), normalizedNumber(dimensions.b));

  return [
    classifyOutstandPart({
      id: "flat",
      type: "solid-flat-rectangular-bar",
      c,
      t,
      epsilon,
      formula: "max(h, b) / min(h, b)",
    }),
  ];
}

function classifyTee({
  dimensions,
  epsilon,
}: {
  dimensions: SteelSectionDimensions;
  epsilon: number;
}): SteelSectionClassificationPart[] {
  return [
    classifyOutstandPart({
      id: "flange",
      type: "tee-flange-outstand",
      c: (normalizedNumber(dimensions.b) - normalizedNumber(dimensions.tw)) / 2,
      t: normalizedNumber(dimensions.tf),
      epsilon,
      formula: "(b - tw) / 2",
    }),
    classifyOutstandPart({
      id: "stem",
      type: "tee-stem-outstand",
      c: normalizedNumber(dimensions.h) - normalizedNumber(dimensions.tf),
      t: normalizedNumber(dimensions.tw),
      epsilon,
      formula: "h - tf",
    }),
  ];
}

function classifyAngle({
  family,
  dimensions,
  epsilon,
}: {
  family: string;
  dimensions: SteelSectionDimensions;
  epsilon: number;
}): SteelSectionClassificationPart[] {
  const longLeg = Math.max(normalizedNumber(dimensions.h), normalizedNumber(dimensions.b));
  const shortLeg = Math.min(normalizedNumber(dimensions.h), normalizedNumber(dimensions.b));
  const t = Math.max(normalizedNumber(dimensions.tw), normalizedNumber(dimensions.tf));
  const parts: SteelSectionClassificationPart[] = [
    classifyOutstandPart({
      id: family === "L" ? "leg" : "long-leg",
      type: family === "L" ? "equal-angle-leg" : "unequal-angle-long-leg",
      c: longLeg - t,
      t,
      epsilon,
      formula: family === "L" ? "a - t" : "max(h, b) - t",
    }),
  ];

  if (family === "LU") {
    parts.push(
      classifyOutstandPart({
        id: "short-leg",
        type: "unequal-angle-short-leg",
        c: shortLeg - t,
        t,
        epsilon,
        formula: "min(h, b) - t",
      }),
    );
  }

  return parts;
}

function classifyProfileParts({
  family,
  section,
  dimensions,
  epsilon,
  nCompression,
  myAbs,
  mzAbs,
}: {
  family: string;
  section: SteelSectionClassificationSectionLike | null | undefined;
  dimensions: SteelSectionDimensions;
  epsilon: number;
  nCompression: number;
  myAbs: number;
  mzAbs: number;
}): SteelSectionClassificationPart[] {
  if (CIRCULAR_HOLLOW_FAMILIES.has(family)) {
    return classifyCircularHollow({ dimensions, epsilon });
  }

  if (RECTANGULAR_HOLLOW_FAMILIES.has(family)) {
    return classifyRectangularHollow({
      section,
      dimensions,
      epsilon,
      nCompression,
      myAbs,
      mzAbs,
    });
  }

  if (SOLID_NON_SLENDER_FAMILIES.has(family)) {
    return classifySolidRound();
  }

  if (family === "FLAT") {
    return classifyFlat({ dimensions, epsilon });
  }

  if (family === "T") {
    return classifyTee({ dimensions, epsilon });
  }

  if (family === "L" || family === "LU") {
    return classifyAngle({ family, dimensions, epsilon });
  }

  return [
    classifyFlange({
      family,
      dimensions,
      epsilon,
    }),
    classifyWeb({
      section,
      dimensions,
      epsilon,
      nCompression,
      mAbs: myAbs,
    }),
  ];
}

export function classifySteelSection({
  section,
  material,
  nEd = 0,
  mEd = 0,
  mzEd = 0,
  axialForceConvention = "absolute",
}: ClassifySteelSectionOptions = {}): SteelSectionClassificationResult {
  const family = normalizedFamily(section);
  const warnings: string[] = [];
  const fyk = steelYieldStrength(material);

  if (!SUPPORTED_FAMILIES.has(family)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        `Steel section classification is not implemented for profile family ${family || "unknown"}.`,
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  if (!isFinitePositive(fyk)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        "Steel section classification requires a positive characteristic yield strength fyk.",
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  const dimensions = resolveProfileDimensions(section);
  const missing = Object.entries(dimensions)
    .filter(([key, value]) => key !== "r" && !isFinitePositive(value))
    .map(([key]) => key);

  if (
    missing.length > 0 ||
    !isFinitePositive(section?.area) ||
    !isFinitePositive(section?.inertiaY)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        `Steel section classification requires complete profile geometry; missing ${missing.join(", ") || "area/inertia"}.`,
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
      },
    };
  }

  const epsilon = Math.sqrt(235 / fyk);
  const normalizedNEd = zeroTinyAction(nEd ?? 0, FORCE_TOLERANCE);
  const normalizedMEd = zeroTinyAction(mEd ?? 0, MOMENT_TOLERANCE);
  const normalizedMZEd = zeroTinyAction(mzEd ?? 0, MOMENT_TOLERANCE);
  const nCompression = compressionAxialForce(normalizedNEd, axialForceConvention);
  const myAbs = Math.abs(normalizedMEd);
  const mzAbs = Math.abs(normalizedMZEd);

  if (
    RECTANGULAR_HOLLOW_FAMILIES.has(family) &&
    mzAbs > 0 &&
    !isFinitePositive(section?.inertiaZ)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      class: 4,
      epsilon: null,
      family,
      profileName: section?.profileName ?? null,
      parts: [],
      warnings: [
        "Steel section classification with Mz on rectangular hollow profiles requires Iz.",
      ],
      metadata: {
        method: "ntc2018-en1993-section-classification-mvp",
        axialForceConvention,
        nEd: round(normalizedNEd),
        mEd: round(normalizedMEd),
        mzEd: round(normalizedMZEd),
      },
    };
  }

  const parts = classifyProfileParts({
    family,
    section,
    dimensions,
    epsilon,
    nCompression,
    myAbs,
    mzAbs,
  });
  const sectionClass = Math.max(...parts.map((part) => part.class ?? 4));

  if (sectionClass === 4) {
    warnings.push(
      "Steel section is class 4 for this N-M state; effective section properties are required and are not implemented yet.",
    );
  }

  return {
    status: RESULT_STATUS.OK,
    class: sectionClass,
    epsilon: round(epsilon),
    family,
    profileName: section?.profileName ?? null,
    parts,
    warnings,
    metadata: {
      method: "ntc2018-en1993-section-classification-mvp",
      axialForceConvention,
      axialCompressionForce: round(nCompression),
      nEd: round(normalizedNEd),
      mEd: round(normalizedMEd),
      mzEd: round(normalizedMZEd),
      fyk: round(fyk),
      actionTolerances: {
        force: FORCE_TOLERANCE,
        moment: MOMENT_TOLERANCE,
      },
      dimensions: {
        h: round(dimensions.h),
        b: round(dimensions.b),
        tw: round(dimensions.tw),
        tf: round(dimensions.tf),
        r: round(dimensions.r),
      },
    },
  };
}
