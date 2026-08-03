// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelAdvancedMemberChecks.js.

import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";

const I_H_FAMILIES = new Set(["IPE", "HEA", "HEB", "HEM"]);

export interface SteelAdvancedCatalogPropertiesLike {
  family?: string | null;
}

export interface SteelAdvancedSectionLike {
  family?: string | null;
  catalogProperties?: SteelAdvancedCatalogPropertiesLike | null;
  height?: number | null;
  width?: number | null;
  webThickness?: number | null;
  flangeThickness?: number | null;
  rootRadius?: number | null;
  plasticSectionModulusY?: number | null;
  shearAreaY?: number | null;
  torsionalSectionModulus?: number | null;
}

export interface SteelAdvancedMaterialLike {
  fyk?: number | null;
  E?: number | null;
  elasticModulus?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface SteelAdvancedSegmentLike {
  from?: number | null;
  to?: number | null;
}

export interface SteelAdvancedMomentSampleLike {
  station: number;
  actions?: Record<string, number | null | undefined> | null;
  principalActions?: Record<string, number | null | undefined> | null;
  My?: number | null;
  Mz?: number | null;
  mY?: number | null;
  mZ?: number | null;
  m?: number | null;
}

export interface SteelAdvancedPanelLike {
  id?: string | null;
  length?: number | null;
  from?: number | null;
  to?: number | null;
  endPost?: string | null;
  rigidEndPost?: boolean;
}

export interface SteelAdvancedLoadLike {
  id?: string | null;
  bearingLength?: number | null;
  ss?: number | null;
  force?: number | null;
  FEd?: number | null;
  panelLength?: number | null;
  loadType?: string | null;
  type?: string | null;
}

export interface SteelNotSupportedCheckOptions {
  id: string;
  description: string;
  missingInputs?: readonly string[];
  reference?: string | null;
  metadata?: Record<string, unknown>;
  warnings?: readonly string[];
}

export interface SteelNotSupportedCheckResult {
  id: string;
  description: string;
  demand: null;
  capacity: null;
  utilizationRatio: null;
  ok: null;
  status: ResultStatus;
  metadata: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
}

export interface SteelAdvancedCheckDetails {
  id: string;
  description: string;
  demand: number | null;
  capacity: number | null;
  utilizationRatio: number | null;
  ok: boolean;
  metadata: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
}

export interface SteelAdvancedCheckResult {
  status: ResultStatus;
  check: SteelAdvancedCheckDetails | SteelNotSupportedCheckResult;
  warnings: string[];
  assumptions?: string[];
}

export interface SteelMomentDiagramFactor {
  factor: number;
  psi: number;
  source: "fem-end-moment-diagram";
}

export interface VerifySteelWebShearBucklingOptions {
  section?: SteelAdvancedSectionLike | null;
  material?: SteelAdvancedMaterialLike | null;
  vEd?: number;
  panel?: SteelAdvancedPanelLike;
  gammaM1?: number | null;
}

export interface VerifySteelConcentratedWebLoadOptions {
  section?: SteelAdvancedSectionLike | null;
  material?: SteelAdvancedMaterialLike | null;
  load?: SteelAdvancedLoadLike;
  panel?: SteelAdvancedPanelLike;
  gammaM1?: number | null;
}

export interface VerifySteelBendingShearInteractionOptions {
  section?: SteelAdvancedSectionLike | null;
  material?: SteelAdvancedMaterialLike | null;
  mEd?: number;
  vEd?: number;
  bendingCapacity?: number;
  shearCapacity?: number;
  gammaM0?: number | null;
}

export interface VerifySteelShearTorsionInteractionOptions {
  section?: SteelAdvancedSectionLike | null;
  material?: SteelAdvancedMaterialLike | null;
  vEd?: number;
  tEd?: number;
  shearCapacity?: number;
}

function round(value: number | null | undefined, decimals = 6): number | null | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(decimals))
    : value;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function familyOf(section: SteelAdvancedSectionLike | null | undefined): string {
  return String(section?.family ?? section?.catalogProperties?.family ?? "").toUpperCase();
}

function gamma(
  material: SteelAdvancedMaterialLike | null | undefined,
  key: string,
  fallback = 1.05,
): unknown {
  return material?.metadata?.[key] ?? material?.metadata?.gammaM1 ?? fallback;
}

interface UniformCheckOptions {
  id: string;
  description: string;
  demand: number;
  capacity: number;
  metadata?: Record<string, unknown>;
  warnings?: string[];
  assumptions?: string[];
}

function uniformCheck({
  id,
  description,
  demand,
  capacity,
  metadata = {},
  warnings = [],
  assumptions = [],
}: UniformCheckOptions): SteelAdvancedCheckResult {
  const ratio = positive(capacity) ? Math.abs(demand) / capacity : null;
  const ok = finite(ratio) && ratio <= 1;
  return {
    status: ok ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    check: {
      id,
      description,
      demand: round(Math.abs(demand)) ?? null,
      capacity: round(capacity) ?? null,
      utilizationRatio: round(ratio) ?? null,
      ok,
      metadata,
      warnings: [...warnings],
      assumptions: [...assumptions],
    },
    warnings,
    assumptions,
  };
}

export function steelNotSupportedCheck({
  id,
  description,
  missingInputs = [],
  reference,
  metadata = {},
  warnings = [],
}: SteelNotSupportedCheckOptions): SteelNotSupportedCheckResult {
  const message = `${description} is not supported; no resistance has been calculated.`;
  return {
    id,
    description,
    demand: null,
    capacity: null,
    utilizationRatio: null,
    ok: null,
    status: RESULT_STATUS.NOT_SUPPORTED,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "not-supported",
      reference,
      missingInputs: [...missingInputs],
      ...metadata,
    },
    warnings: [message, ...warnings],
    assumptions: [],
  };
}

export function calculateSteelMomentDiagramFactor(
  samples: readonly SteelAdvancedMomentSampleLike[] = [],
  axis = "My",
  segment: SteelAdvancedSegmentLike | null = null,
): SteelMomentDiagramFactor | null {
  const key = String(axis).toUpperCase() === "MZ" ? "Mz" : "My";
  const selected = samples.filter((sample) => {
    const station = sample.station;
    return (
      (!segment || !finite(segment.from) || station >= segment.from - 1e-9) &&
      (!segment || !finite(segment.to) || station <= segment.to + 1e-9)
    );
  });
  if (selected.length < 2) return null;

  const moment = (sample: SteelAdvancedMomentSampleLike): number | null | undefined =>
    sample.actions?.[key] ??
    sample[key] ??
    sample[key === "My" ? "mY" : "mZ"] ??
    sample.principalActions?.[key === "My" ? "mY" : "mZ"] ??
    (key === "My" ? sample.m : 0);
  const firstSample = selected[0];
  const lastSample = selected[selected.length - 1];
  if (firstSample === undefined || lastSample === undefined) return null;
  const first = moment(firstSample);
  const last = moment(lastSample);
  if (!finite(first) || !finite(last)) return null;

  let max = first;
  for (const sample of selected) {
    const value = moment(sample);
    if (typeof value === "number" && Math.abs(value) > Math.abs(max)) {
      max = value;
    }
  }
  if (Math.abs(max) <= 1e-12) return null;

  const endWithMax = Math.abs(first) >= Math.abs(last) ? first : last;
  const otherEnd = Math.abs(first) >= Math.abs(last) ? last : first;
  const psi = Math.abs(endWithMax) > 1e-12 ? otherEnd / endWithMax : 1;
  const cm = Math.min(1, Math.max(0.4, 0.6 + 0.4 * psi));
  return {
    factor: round(cm) ?? cm,
    psi: round(psi) ?? psi,
    source: "fem-end-moment-diagram",
  };
}

function webGeometry(section: SteelAdvancedSectionLike | null | undefined): {
  h: number | null | undefined;
  tw: number | null | undefined;
  tf: number | null | undefined;
  hw: number | null;
} {
  const h = section?.height;
  const tw = section?.webThickness;
  const tf = section?.flangeThickness;
  const r = section?.rootRadius ?? 0;
  return { h, tw, tf, hw: positive(h) && positive(tf) ? h - 2 * tf - 2 * r : null };
}

export function verifySteelWebShearBuckling({
  section,
  material,
  vEd = 0,
  panel = {},
  gammaM1 = null,
}: VerifySteelWebShearBucklingOptions = {}): SteelAdvancedCheckResult {
  const family = familyOf(section);
  const { hw, tw } = webGeometry(section);
  const fy = material?.fyk;
  const E = material?.E ?? material?.elasticModulus ?? 210000;
  const a = panel.length ?? (finite(panel.to) && finite(panel.from) ? panel.to - panel.from : null);
  const resolvedGamma = gammaM1 ?? gamma(material, "gammaM1");
  if (
    !I_H_FAMILIES.has(family) ||
    !positive(hw) ||
    !positive(tw) ||
    !positive(fy) ||
    !positive(E) ||
    !positive(a) ||
    !positive(resolvedGamma)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: steelNotSupportedCheck({
        id: "steel-web-shear-buckling",
        description: "Web shear buckling",
        missingInputs: ["I/H web geometry h, tw, tf, r", "panel length a", "steel fyk and E"],
        reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5",
        metadata: { family, panelId: panel.id ?? null },
      }),
      warnings: [],
    };
  }
  const epsilon = Math.sqrt(235 / fy);
  const eta = fy <= 460 ? 1.2 : 1;
  const aspect = a / hw;
  const kTau = aspect >= 1 ? 5.34 + 4 / aspect ** 2 : 4 + 5.34 / aspect ** 2;
  const lambdaW = hw / (37.4 * tw * epsilon * Math.sqrt(kTau));
  const rigidEndPost = panel.endPost === "rigid" || panel.rigidEndPost === true;
  const chiW = Math.min(
    eta,
    lambdaW < 0.83 / eta ? eta : rigidEndPost ? 1.37 / (0.7 + lambdaW) : 1.21 / (0.8 + lambdaW),
  );
  const capacity = (chiW * fy * hw * tw) / (Math.sqrt(3) * resolvedGamma);
  const result = uniformCheck({
    id: "steel-web-shear-buckling",
    description: "I/H web panel shear buckling resistance",
    demand: vEd,
    capacity,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "EN-1993-1-5-5.2-web-only",
      reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5.2",
      panelId: panel.id ?? null,
      endPost: rigidEndPost ? "rigid" : "non-rigid",
      hw: round(hw),
      tw: round(tw),
      a: round(a),
      kTau: round(kTau),
      relativeWebSlenderness: round(lambdaW),
      chiW: round(chiW),
      eta,
      gammaM1: resolvedGamma,
    },
    assumptions: [
      "The resistance includes the web contribution only; no flange contribution is credited.",
    ],
  });
  if ("metadata" in result.check) {
    result.check.metadata.shearBucklingRequired = hw / tw > (72 * epsilon) / eta;
  }
  return result;
}

export function verifySteelConcentratedWebLoad({
  section,
  material,
  load = {},
  panel = {},
  gammaM1 = null,
}: VerifySteelConcentratedWebLoadOptions = {}): SteelAdvancedCheckResult {
  const family = familyOf(section);
  const { hw, tw, tf } = webGeometry(section);
  const b = section?.width;
  const fyw = material?.fyk;
  const fyf = material?.fyk;
  const E = material?.E ?? material?.elasticModulus ?? 210000;
  const ss = load.bearingLength ?? load.ss;
  const force = load.force ?? load.FEd ?? 0;
  const a = panel.length ?? load.panelLength;
  const resolvedGamma = gammaM1 ?? gamma(material, "gammaM1");
  if (
    !I_H_FAMILIES.has(family) ||
    !positive(hw) ||
    !positive(tw) ||
    !positive(tf) ||
    !positive(b) ||
    !positive(fyw) ||
    !positive(E) ||
    !positive(ss) ||
    !positive(a) ||
    !positive(resolvedGamma)
  ) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: steelNotSupportedCheck({
        id: "steel-concentrated-web-load",
        description: "Transverse concentrated load on web",
        missingInputs: [
          "I/H web and flange geometry",
          "bearingLength",
          "web panel length",
          "load position/type",
          "steel fyk and E",
        ],
        reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §6",
        metadata: { family, loadId: load.id ?? null },
      }),
      warnings: [],
    };
  }
  const m1 = (Number(fyf) * b) / (fyw * tw);
  const m2 = 0.02 * (hw / tf) ** 2;
  const ly = Math.min(hw, ss + 2 * tf * (1 + Math.sqrt(Math.max(0, m1 + m2))));
  const type = String(load.loadType ?? load.type ?? "internal").toLowerCase();
  const kF = type === "end" ? 2 + 6 * (ss / hw) : 6 + 2 * (hw / a) ** 2;
  const fCr = (0.9 * kF * E * tw ** 3) / hw;
  const lambdaF = Math.sqrt((ly * tw * fyw) / fCr);
  const chiF = Math.min(1, 0.5 / lambdaF);
  const effectiveLength = chiF * ly;
  const capacity = (fyw * effectiveLength * tw) / resolvedGamma;
  return uniformCheck({
    id: "steel-concentrated-web-load",
    description: "I/H web transverse-force resistance",
    demand: force,
    capacity,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "EN-1993-1-5-6.2",
      reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §6.2",
      loadId: load.id ?? null,
      panelId: panel.id ?? null,
      loadType: type,
      bearingLength: round(ss),
      effectiveLoadedLength: round(effectiveLength),
      kF: round(kF),
      lambdaF: round(lambdaF),
      chiF: round(chiF),
      gammaM1: resolvedGamma,
    },
    assumptions: [
      "The load is introduced through one flange and the web panel geometry supplied with the FEM member is applicable.",
    ],
  });
}

export function verifySteelBendingShearInteraction({
  section,
  material,
  mEd = 0,
  vEd = 0,
  bendingCapacity,
  shearCapacity,
  gammaM0 = null,
}: VerifySteelBendingShearInteractionOptions = {}): SteelAdvancedCheckResult {
  const { tw } = webGeometry(section);
  const fy = material?.fyk;
  const Wpl = section?.plasticSectionModulusY;
  const resolvedGamma = gammaM0 ?? gamma(material, "gammaM0");
  if (!positive(bendingCapacity) || !positive(shearCapacity)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: steelNotSupportedCheck({
        id: "steel-bending-shear-interaction",
        description: "Bending-shear interaction",
        missingInputs: ["plastic bending resistance", "shear resistance"],
        reference: "NTC 2018 §4.2.4.1.2.5; UNI EN 1993-1-1 §6.2.8",
      }),
      warnings: [],
    };
  }
  const shearRatio = Math.abs(vEd) / shearCapacity;
  let capacity = bendingCapacity;
  let rho = 0;
  if (shearRatio > 0.5) {
    rho = Math.min(1, (2 * shearRatio - 1) ** 2);
    if (I_H_FAMILIES.has(familyOf(section)) && positive(Wpl) && positive(tw) && positive(fy)) {
      const webArea = section?.shearAreaY ?? tw * (webGeometry(section).hw ?? 0);
      capacity = Math.min(
        bendingCapacity,
        Math.max(0, ((Wpl - (rho * webArea ** 2) / (4 * tw)) * fy) / Number(resolvedGamma)),
      );
    } else {
      capacity = (1 - rho) * bendingCapacity;
    }
  }
  return uniformCheck({
    id: "steel-bending-shear-interaction",
    description: "Bending resistance reduced by high shear",
    demand: mEd,
    capacity,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "EN-1993-1-1-6.2.8",
      reference: "NTC 2018 §4.2.4.1.2.5",
      shearRatio: round(shearRatio),
      rho: round(rho),
      reductionApplied: shearRatio > 0.5,
    },
  });
}

export function verifySteelShearTorsionInteraction({
  section,
  material,
  vEd = 0,
  tEd = 0,
  shearCapacity,
}: VerifySteelShearTorsionInteractionOptions = {}): SteelAdvancedCheckResult {
  const WT = section?.torsionalSectionModulus;
  const fy = material?.fyk;
  const resolvedGamma = gamma(material, "gammaM0");
  if (!positive(WT) || !positive(fy) || !positive(shearCapacity)) {
    return {
      status: RESULT_STATUS.NOT_SUPPORTED,
      check: steelNotSupportedCheck({
        id: "steel-shear-torsion-interaction",
        description: "Shear-Saint-Venant torsion interaction",
        missingInputs: ["torsional section modulus WT", "shear resistance", "steel fyk"],
        reference: "NTC 2018 §4.2.4.1.2.7; UNI EN 1993-1-1 §6.2.7",
      }),
      warnings: [],
    };
  }
  const tauT = Math.abs(tEd) / WT;
  const tauRd = fy / (Math.sqrt(3) * Number(resolvedGamma));
  const family = familyOf(section);
  const factor = ["CHS", "SHS", "RHS"].includes(family)
    ? Math.sqrt(Math.max(0, 1 - (tauT / tauRd) ** 2))
    : Math.max(0, 1 - tauT / (1.25 * tauRd));
  return uniformCheck({
    id: "steel-shear-torsion-interaction",
    description: "Shear resistance reduced by uniform Saint-Venant torsion",
    demand: vEd,
    capacity: factor * shearCapacity,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      method: "EN-1993-1-1-6.2.7",
      reference: "NTC 2018 §4.2.4.1.2.7",
      torsionalShearStress: round(tauT),
      torsionalShearResistance: round(tauRd),
      reductionFactor: round(factor),
    },
    assumptions: [
      "Only uniform Saint-Venant torsion is considered; warping torsion and bimoment must be absent.",
    ],
  });
}
