// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelCompressionBuckling.js.

import { clamp, roundTo } from "../../../domain/math/arrayLinearAlgebra.js";
import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystemInput;
const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);
const CLOSED_HOLLOW_FAMILIES = new Set(["CHS", "SHS", "RHS"]);
const SOLID_DOUBLY_SYMMETRIC_FAMILIES = new Set(["ROUND", "FLAT"]);
const OPEN_UNSYMMETRIC_FAMILIES = new Set(["L", "LU", "T"]);
const AUTOMATIC_FLEXURAL_BUCKLING_FAMILIES = new Set([
  ...I_H_FAMILIES,
  "UPN",
  ...CLOSED_HOLLOW_FAMILIES,
  ...SOLID_DOUBLY_SYMMETRIC_FAMILIES,
]);
const FORCE_TOLERANCE = 1e-9;

export interface SteelCompressionBucklingCatalogPropertiesLike {
  [key: string]: unknown;
  height?: number | null;
  h?: number | null;
  width?: number | null;
  b?: number | null;
  flangeThickness?: number | null;
  tf?: number | null;
  family?: string | null;
}

export interface SteelCompressionBucklingSectionMetadataLike {
  unitSystem?: UnitSystemInput | null;
}

export interface SteelCompressionBucklingSectionLike {
  [key: string]: unknown;
  family?: string | null;
  catalogProperties?: SteelCompressionBucklingCatalogPropertiesLike | null;
  metadata?: SteelCompressionBucklingSectionMetadataLike | null;
  area?: number | null;
  inertiaY?: number | null;
  inertiaZ?: number | null;
}

export interface SteelCompressionBucklingMaterialLike {
  fyk?: number | null;
  elasticModulus?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface SteelBucklingAxisResult {
  curve: string | null | undefined;
  imperfectionFactor: number;
  criticalLoad: number;
  relativeSlenderness: number;
  phi: number;
  reductionFactor: number;
  resistance: number;
}

export interface SteelCompressionBucklingCheck {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  utilizationRatio: number;
  ok: boolean;
  metadata: Record<string, unknown>;
}

export interface SteelCompressionBucklingResult {
  status: ResultStatus;
  check: SteelCompressionBucklingCheck | null;
  axisResults: { y: SteelBucklingAxisResult | null; z: SteelBucklingAxisResult | null } | null;
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export interface CalculateSteelCompressionBucklingAxisOptions {
  area?: number | null | undefined;
  inertia?: number | null | undefined;
  elasticModulus?: number | null | undefined;
  yieldStrength?: number | null | undefined;
  effectiveLength?: number | null | undefined;
  gammaM1?: unknown;
  curve?: string | null | undefined;
  imperfectionFactor?: number | null | undefined;
}

export interface VerifySteelCompressionBucklingOptions {
  section?: SteelCompressionBucklingSectionLike | null;
  material?: SteelCompressionBucklingMaterialLike | null;
  nEd?: number;
  sectionClass?: number;
  lengthY?: number | null;
  lengthZ?: number | null;
  effectiveLengthY?: number | null;
  effectiveLengthZ?: number | null;
  effectiveLengthFactorY?: number;
  effectiveLengthFactorZ?: number;
  curveY?: string | null;
  curveZ?: string | null;
  imperfectionFactorY?: number | null;
  imperfectionFactorZ?: number | null;
  gammaM1?: number | null;
  allowOpenSectionFlexuralBuckling?: boolean;
  axialForceConvention?: string;
}

function round(value: number): number;
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

function normalizedFamily(section: SteelCompressionBucklingSectionLike | null | undefined): string {
  return String(section?.family ?? section?.catalogProperties?.family ?? "")
    .trim()
    .toUpperCase();
}

function sectionResolver(section: SteelCompressionBucklingSectionLike | null | undefined) {
  return createUnitResolver(section?.metadata?.unitSystem ?? INTERNAL_UNITS, INTERNAL_UNITS);
}

function resolveSectionLength(
  section: SteelCompressionBucklingSectionLike | null | undefined,
  ...keys: readonly string[]
): number | null {
  const resolver = sectionResolver(section);

  for (const key of keys) {
    const value = section?.[key] ?? section?.catalogProperties?.[key];

    if (isFiniteNumber(value)) {
      return resolver.length(value);
    }
  }

  return null;
}

function compressionAxialForce(nEd: number, convention = "absolute"): number {
  if (!Number.isFinite(nEd)) {
    return 0;
  }

  if (Math.abs(nEd) <= FORCE_TOLERANCE) {
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

function gammaM1FromMaterial(
  material: SteelCompressionBucklingMaterialLike | null | undefined,
  gammaM1: number | null,
): unknown {
  return gammaM1 ?? material?.metadata?.gammaM1 ?? material?.metadata?.gammaM0 ?? 1.05;
}

export function steelBucklingCurveImperfectionFactor(
  curve: string | null | undefined,
): number | null {
  const values: Record<string, number> = {
    a0: 0.13,
    a: 0.21,
    b: 0.34,
    c: 0.49,
    d: 0.76,
  };

  return (
    values[
      String(curve ?? "")
        .trim()
        .toLowerCase()
    ] ?? null
  );
}

export interface SteelCompressionBucklingCurves {
  y: string;
  z: string;
  source: string;
}

export function inferSteelCompressionBucklingCurves(
  section: SteelCompressionBucklingSectionLike | null | undefined,
): SteelCompressionBucklingCurves {
  const family = normalizedFamily(section);

  if (I_H_FAMILIES.has(family)) {
    const h = resolveSectionLength(section, "height", "h");
    const b = resolveSectionLength(section, "width", "b");
    const tf = resolveSectionLength(section, "flangeThickness", "tf");
    const ratio = isFinitePositive(b) ? Number(h) / b : null;

    if (isFinitePositive(ratio) && isFinitePositive(tf)) {
      if (ratio > 1.2) {
        return tf <= 40
          ? { y: "a", z: "b", source: "ntc2018-table-4.2.VIII-rolled-ih" }
          : { y: "b", z: "c", source: "ntc2018-table-4.2.VIII-rolled-ih" };
      }

      return tf <= 100
        ? { y: "b", z: "c", source: "ntc2018-table-4.2.VIII-rolled-ih" }
        : { y: "d", z: "d", source: "ntc2018-table-4.2.VIII-rolled-ih" };
    }

    return { y: "b", z: "c", source: "ntc2018-table-4.2.VIII-rolled-ih-default" };
  }

  if (family === "UPN") {
    return { y: "c", z: "c", source: "ntc2018-table-4.2.VIII-u-section-default" };
  }

  if (CLOSED_HOLLOW_FAMILIES.has(family)) {
    return { y: "c", z: "c", source: "conservative-hollow-section-default-curve-c" };
  }

  if (family === "ROUND") {
    return { y: "a", z: "a", source: "rolled-solid-round-default-curve-a" };
  }

  if (family === "FLAT") {
    return { y: "c", z: "c", source: "conservative-solid-flat-default-curve-c" };
  }

  if (OPEN_UNSYMMETRIC_FAMILIES.has(family)) {
    return { y: "c", z: "c", source: "open-unsymmetric-flexural-only-default-curve-c" };
  }

  return { y: "c", z: "c", source: "default-conservative-curve-c" };
}

export function calculateSteelCompressionBucklingAxis(
  options: CalculateSteelCompressionBucklingAxisOptions = {},
): SteelBucklingAxisResult | null {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'area' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    area,
    inertia,
    elasticModulus,
    yieldStrength,
    effectiveLength,
    gammaM1,
    curve,
    imperfectionFactor = null,
  } = options;

  if (
    !isFinitePositive(area) ||
    !isFinitePositive(inertia) ||
    !isFinitePositive(elasticModulus) ||
    !isFinitePositive(yieldStrength) ||
    !isFinitePositive(effectiveLength) ||
    !isFinitePositive(gammaM1)
  ) {
    return null;
  }

  const alpha = isFiniteNumber(imperfectionFactor)
    ? imperfectionFactor
    : steelBucklingCurveImperfectionFactor(curve);

  if (!isFinitePositive(alpha)) {
    return null;
  }

  const criticalLoad = (Math.PI ** 2 * elasticModulus * inertia) / effectiveLength ** 2;
  const relativeSlenderness = Math.sqrt((area * yieldStrength) / criticalLoad);
  const phi = 0.5 * (1 + alpha * (relativeSlenderness - 0.2) + relativeSlenderness ** 2);
  const radical = phi ** 2 - relativeSlenderness ** 2;

  if (radical < -1e-12) {
    return null;
  }

  const reductionFactor = clamp(1 / (phi + Math.sqrt(Math.max(0, radical))), 0, 1);
  const resistance = (reductionFactor * area * yieldStrength) / gammaM1;

  return {
    curve,
    imperfectionFactor: round(alpha),
    criticalLoad: round(criticalLoad),
    relativeSlenderness: round(relativeSlenderness),
    phi: round(phi),
    reductionFactor: round(reductionFactor),
    resistance: round(resistance),
  };
}

export function verifySteelCompressionBuckling(
  options: VerifySteelCompressionBucklingOptions = {},
): SteelCompressionBucklingResult {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'section' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    section,
    material,
    nEd = 0,
    sectionClass = 1,
    lengthY = null,
    lengthZ = null,
    effectiveLengthY = null,
    effectiveLengthZ = null,
    effectiveLengthFactorY = 1,
    effectiveLengthFactorZ = 1,
    curveY = null,
    curveZ = null,
    imperfectionFactorY = null,
    imperfectionFactorZ = null,
    gammaM1 = null,
    allowOpenSectionFlexuralBuckling = false,
    axialForceConvention = "absolute",
  } = options;

  const warnings: string[] = [];
  const family = normalizedFamily(section);
  const resolvedGammaM1 = gammaM1FromMaterial(material, gammaM1);
  const fyk = material?.fyk;
  const E = material?.elasticModulus;
  const area = section?.area;
  const inertiaY = section?.inertiaY;
  const inertiaZ = section?.inertiaZ;
  const demand = compressionAxialForce(nEd, axialForceConvention);
  const inferredCurves = inferSteelCompressionBucklingCurves(section);
  const selectedCurveY = curveY ?? inferredCurves.y;
  const selectedCurveZ = curveZ ?? inferredCurves.z;
  const l0Y =
    effectiveLengthY ??
    (isFinitePositive(lengthY) && isFinitePositive(effectiveLengthFactorY)
      ? lengthY * effectiveLengthFactorY
      : null);
  const l0Z =
    effectiveLengthZ ??
    (isFinitePositive(lengthZ) && isFinitePositive(effectiveLengthFactorZ)
      ? lengthZ * effectiveLengthFactorZ
      : null);

  if (
    !AUTOMATIC_FLEXURAL_BUCKLING_FAMILIES.has(family) &&
    !(OPEN_UNSYMMETRIC_FAMILIES.has(family) && allowOpenSectionFlexuralBuckling)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      axisResults: null,
      warnings: [
        `Compression buckling automatic flexural verification is not enabled for profile family ${family || "unknown"}.`,
      ],
      metadata: {
        method: "ntc2018-4.2.4.1.3.1-compression-buckling",
        family,
        sectionClass,
        curveY: selectedCurveY,
        curveZ: selectedCurveZ,
        curveSource: inferredCurves.source,
      },
    };
  }

  if (OPEN_UNSYMMETRIC_FAMILIES.has(family) && allowOpenSectionFlexuralBuckling) {
    warnings.push(
      "Open unsymmetric section compression buckling is checked only as flexural buckling about y/z; torsional and flexural-torsional buckling must be checked separately.",
    );
  }

  if (sectionClass > 3) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      axisResults: null,
      warnings: [
        "Compression buckling verification is blocked for class 4 sections until effective properties are implemented.",
      ],
      metadata: {
        method: "ntc2018-4.2.4.1.3.1-compression-buckling",
        family,
        sectionClass,
      },
    };
  }

  const axisY = calculateSteelCompressionBucklingAxis({
    area,
    inertia: inertiaY,
    elasticModulus: E,
    yieldStrength: fyk,
    effectiveLength: l0Y,
    gammaM1: resolvedGammaM1,
    curve: selectedCurveY,
    imperfectionFactor: imperfectionFactorY,
  });
  const axisZ = calculateSteelCompressionBucklingAxis({
    area,
    inertia: inertiaZ,
    elasticModulus: E,
    yieldStrength: fyk,
    effectiveLength: l0Z,
    gammaM1: resolvedGammaM1,
    curve: selectedCurveZ,
    imperfectionFactor: imperfectionFactorZ,
  });

  if (!axisY || !axisZ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: null,
      axisResults: { y: axisY, z: axisZ },
      warnings: [
        "Compression buckling verification requires A, Iy, Iz, E, fyk, gammaM1 and positive effective lengths about both axes.",
      ],
      metadata: {
        method: "ntc2018-4.2.4.1.3.1-compression-buckling",
        family,
        sectionClass,
        lengthY: round(lengthY),
        lengthZ: round(lengthZ),
        effectiveLengthY: round(l0Y),
        effectiveLengthZ: round(l0Z),
        curveY: selectedCurveY,
        curveZ: selectedCurveZ,
      },
    };
  }

  const ratioY = demand / axisY.resistance;
  const ratioZ = demand / axisZ.resistance;
  const governingAxis =
    demand > 0 ? (ratioY >= ratioZ ? "y" : "z") : axisY.resistance <= axisZ.resistance ? "y" : "z";
  const capacity = Math.min(axisY.resistance, axisZ.resistance);
  const utilizationRatio = Math.max(ratioY, ratioZ);

  return {
    status: utilizationRatio <= 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id: "steel-compression-buckling",
      description: "Compression buckling resistance of the steel member",
      demand: round(demand),
      capacity: round(capacity),
      utilizationRatio: round(utilizationRatio),
      ok: utilizationRatio <= 1,
      metadata: {
        method: "ntc2018-4.2.4.1.3.1-compression-buckling",
        family,
        sectionClass,
        axialForceConvention,
        gammaM1: round(resolvedGammaM1),
        fyk: round(fyk),
        elasticModulus: round(E),
        area: round(area),
        lengthY: round(lengthY),
        lengthZ: round(lengthZ),
        effectiveLengthY: round(l0Y),
        effectiveLengthZ: round(l0Z),
        effectiveLengthFactorY: round(
          isFinitePositive(lengthY) ? Number(l0Y) / lengthY : effectiveLengthFactorY,
        ),
        effectiveLengthFactorZ: round(
          isFinitePositive(lengthZ) ? Number(l0Z) / lengthZ : effectiveLengthFactorZ,
        ),
        curveY: selectedCurveY,
        curveZ: selectedCurveZ,
        curveSource: inferredCurves.source,
        governingAxis,
        axisYResistance: axisY.resistance,
        axisZResistance: axisZ.resistance,
        axisYUtilizationRatio: round(ratioY),
        axisZUtilizationRatio: round(ratioZ),
        axisYRelativeSlenderness: axisY.relativeSlenderness,
        axisZRelativeSlenderness: axisZ.relativeSlenderness,
        chiY: axisY.reductionFactor,
        chiZ: axisZ.reductionFactor,
        nCrY: axisY.criticalLoad,
        nCrZ: axisZ.criticalLoad,
      },
    },
    axisResults: { y: axisY, z: axisZ },
    warnings,
  };
}
