import type { CrossSection } from "../../../../domain/geometry/CrossSection.js";
import type { ReinforcedConcreteSection } from "../../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../../domain/materials/SteelMaterial.js";
import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../../domain/units/UnitSystem.js";
import { COSENZA_METHOD, DEFAULT_RC_SHEAR_UNITS, isFinitePositive } from "./shearUtils.js";
import type {
  RcLongitudinalReinforcementGroup,
  RcResolvedCosenzaParameters,
  RcResolvedShearParameters,
  RcResolvedTransverseReinforcement,
  RcShearInput,
  RcShearMethod,
  RcShearMode,
} from "./types.js";

const SUPPORTED_MODES: ReadonlySet<string> = new Set([
  "without-transverse-reinforcement",
  "with-transverse-reinforcement",
]);
const DEFAULT_METHOD: RcShearMethod = "ntc2018";
const METHOD_ALIASES: ReadonlyMap<string, RcShearMethod> = new Map([
  ["ntc2018", DEFAULT_METHOD],
  ["ntc-2018", DEFAULT_METHOD],
  [COSENZA_METHOD, COSENZA_METHOD],
  ["cosenza-2016", COSENZA_METHOD],
]);

interface ConcreteShearSection extends CrossSection {
  webWidth?: number;
  diameter?: number;
}

function concreteSectionFrom(
  section: ReinforcedConcreteSection | null | undefined,
): ConcreteShearSection | null {
  return section?.concreteSection ?? section ?? null;
}

function sectionShape(section: ReinforcedConcreteSection | null | undefined): string | null {
  const shape = concreteSectionFrom(section)?.metadata.shape;
  return typeof shape === "string" ? shape : null;
}

function sectionBounds(section: ReinforcedConcreteSection): {
  minY: number;
  maxY: number;
} {
  if (typeof section.getBoundingBox === "function") {
    return section.getBoundingBox();
  }

  const concreteSection = concreteSectionFrom(section);
  const height = concreteSection?.height ?? section.height;

  return {
    minY: 0,
    maxY: height as number,
  };
}

export function resolveUnits(
  section: ReinforcedConcreteSection | null | undefined,
  options: {
    units?: UnitSystemInput;
    shear?: RcShearInput;
  } = {},
): UnitSystemInput {
  const sectionUnits = section?.metadata.unitSystem;
  const concreteUnits = concreteSectionFrom(section)?.metadata.unitSystem;

  return (
    options.units ??
    options.shear?.units ??
    (sectionUnits as UnitSystemInput | undefined) ??
    (concreteUnits as UnitSystemInput | undefined) ??
    DEFAULT_RC_SHEAR_UNITS
  );
}

export function resolveMode(
  shear: RcShearInput = {},
  fallbackMode: RcShearMode | null = null,
): RcShearMode | null {
  const mode = shear.mode ?? fallbackMode;

  if (typeof mode !== "string" || !SUPPORTED_MODES.has(mode)) {
    return null;
  }

  return mode as RcShearMode;
}

export function resolveMethod(
  shear: RcShearInput = {},
  fallbackMethod: string | null = null,
): RcShearMethod | null {
  const requested = shear.method ?? shear.formulation ?? fallbackMethod ?? DEFAULT_METHOD;

  return METHOD_ALIASES.get(String(requested).trim().toLowerCase()) ?? null;
}

function resolveBw({
  section,
  shear,
  resolver,
  warnings,
  sources,
}: {
  section: ReinforcedConcreteSection;
  shear: RcShearInput;
  resolver: UnitResolver;
  warnings: string[];
  sources: Record<string, string>;
}): number | null {
  const explicitWidth = shear.bw ?? shear.webWidth;
  if (Number.isFinite(explicitWidth)) {
    sources.bw = "explicit";
    return resolver.length(explicitWidth as number);
  }

  const concreteSection = concreteSectionFrom(section);

  if (Number.isFinite(concreteSection?.webWidth)) {
    sources.bw = "derived-t-section";
    return concreteSection?.webWidth as number;
  }

  if (sectionShape(section) === "rectangular" && Number.isFinite(concreteSection?.width)) {
    sources.bw = "derived-rectangular-section";
    return concreteSection?.width as number;
  }

  sources.bw = "missing";
  warnings.push("Shear web width bw cannot be derived for this section; pass shear.bw explicitly.");
  return null;
}

function groupsFrom(
  section: ReinforcedConcreteSection,
  shear: RcShearInput = {},
): RcLongitudinalReinforcementGroup[] {
  const metadataGroups = section.metadata.longitudinalReinforcementGroups;
  return [
    ...(shear.longitudinalReinforcementGroups ?? []),
    ...(Array.isArray(metadataGroups)
      ? (metadataGroups as RcLongitudinalReinforcementGroup[])
      : []),
  ];
}

function resolveLongitudinalGroup(
  section: ReinforcedConcreteSection,
  shear: RcShearInput = {},
): RcLongitudinalReinforcementGroup | null {
  if (shear.longitudinalReinforcementGroup) {
    return shear.longitudinalReinforcementGroup;
  }

  const groupId = shear.longitudinalReinforcementGroupId;

  if (!groupId) {
    return null;
  }

  return groupsFrom(section, shear).find((group) => group.id === groupId) ?? null;
}

function barsFromGroup(
  section: ReinforcedConcreteSection,
  group: RcLongitudinalReinforcementGroup | null,
) {
  if (!group?.barIds?.length) {
    return [];
  }

  const ids = new Set(group.barIds.map(String));

  return section
    .getReinforcementBars()
    .filter((bar, index) => ids.has(String(bar.id ?? `bar-${index + 1}`)));
}

function weightedCentroidY(
  bars: ReturnType<ReinforcedConcreteSection["getReinforcementBars"]>,
): number | null {
  const area = bars.reduce((sum, bar) => sum + bar.area, 0);

  if (!isFinitePositive(area)) {
    return null;
  }

  return bars.reduce((sum, bar) => sum + bar.area * Number(bar.y), 0) / area;
}

function resolveTensionFace({
  shear,
  group,
  mEd,
}: {
  shear: RcShearInput;
  group: RcLongitudinalReinforcementGroup | null;
  mEd: number;
}): string {
  const requested = shear.tensionFace ?? group?.face ?? "bottom";

  if (requested === "auto-from-moment-sign") {
    return mEd >= 0 ? "bottom" : "top";
  }

  return requested;
}

function effectiveDepthFromCentroid({
  section,
  centroidY,
  tensionFace,
}: {
  section: ReinforcedConcreteSection;
  centroidY: number;
  tensionFace: string;
}): number | null {
  const bounds = sectionBounds(section);

  if (tensionFace === "bottom") {
    return bounds.maxY - centroidY;
  }

  if (tensionFace === "top") {
    return centroidY - bounds.minY;
  }

  return null;
}

function resolveDAndAsl({
  section,
  shear,
  resolver,
  mEd,
  warnings,
  sources,
}: {
  section: ReinforcedConcreteSection;
  shear: RcShearInput;
  resolver: UnitResolver;
  mEd: number;
  warnings: string[];
  sources: Record<string, string>;
}) {
  const group = resolveLongitudinalGroup(section, shear);
  const bars = barsFromGroup(section, group);
  const tensionFace = resolveTensionFace({ shear, group, mEd });
  const explicitDepth = shear.effectiveDepth ?? shear.d;
  const explicitArea = shear.longitudinalReinforcementArea ?? shear.asl;
  let effectiveDepth = Number.isFinite(explicitDepth)
    ? resolver.length(explicitDepth as number)
    : null;
  let longitudinalArea = Number.isFinite(explicitArea)
    ? resolver.area(explicitArea as number)
    : null;

  if (effectiveDepth != null) {
    sources.d = "explicit";
  }

  if (longitudinalArea != null) {
    sources.asl = "explicit";
  }

  if ((effectiveDepth == null || longitudinalArea == null) && group) {
    const groupDepth = group.effectiveDepth ?? group.d;
    if (effectiveDepth == null && Number.isFinite(groupDepth)) {
      effectiveDepth = resolver.length(groupDepth as number);
      sources.d = "reinforcement-group-explicit";
    }

    const groupArea = group.longitudinalReinforcementArea ?? group.area ?? group.asl;
    if (longitudinalArea == null && Number.isFinite(groupArea)) {
      longitudinalArea = resolver.area(groupArea as number);
      sources.asl = "reinforcement-group-explicit";
    }

    if ((effectiveDepth == null || longitudinalArea == null) && bars.length > 0) {
      const barArea = bars.reduce((sum, bar) => sum + bar.area, 0);
      const centroidY = weightedCentroidY(bars);

      if (longitudinalArea == null && isFinitePositive(barArea)) {
        longitudinalArea = barArea;
        sources.asl = "derived-from-reinforcement-group";
      }

      if (effectiveDepth == null && Number.isFinite(centroidY)) {
        effectiveDepth = effectiveDepthFromCentroid({
          section,
          centroidY: centroidY as number,
          tensionFace,
        });
        sources.d = "derived-from-reinforcement-group";
      }
    }
  }

  if (effectiveDepth == null) {
    sources.d = "missing";
    warnings.push(
      "Effective depth d is required for RC shear verification; pass shear.effectiveDepth or a longitudinal reinforcement group.",
    );
  }

  if (longitudinalArea == null) {
    sources.asl = "missing";
  }

  return {
    effectiveDepth,
    longitudinalArea,
    tensionFace,
    groupId: group?.id ?? null,
    barIds: bars.map((bar, index) => bar.id ?? `bar-${index + 1}`),
  };
}

function resolveConcreteArea({
  section,
  shear,
  resolver,
  sources,
}: {
  section: ReinforcedConcreteSection;
  shear: RcShearInput;
  resolver: UnitResolver;
  sources: Record<string, string>;
}): number | null {
  const explicitArea = shear.concreteArea ?? shear.ac;
  if (Number.isFinite(explicitArea)) {
    sources.ac = "explicit";
    return resolver.area(explicitArea as number);
  }

  const concreteSection = concreteSectionFrom(section);
  sources.ac = "derived-concrete-section";
  return concreteSection?.area ?? section.area ?? null;
}

function resolveCompression({
  nEd,
  shear,
  resolver,
  warnings,
  sources,
}: {
  nEd: number;
  shear: RcShearInput;
  resolver: UnitResolver;
  warnings: string[];
  sources: Record<string, string>;
}): number {
  if (Number.isFinite(shear.nEdCompression)) {
    sources.nEdCompression = "explicit";
    return Math.max(resolver.force(shear.nEdCompression as number), 0);
  }

  const convention = shear.normalForceSignConvention ?? "compression-negative";
  let compression: number;

  if (convention === "compression-positive") {
    compression = nEd;
  } else if (convention === "compression-negative" || convention === "tension-positive") {
    compression = -nEd;
  } else {
    warnings.push(
      `Unsupported shear.normalForceSignConvention ${convention}; compression contribution ignored.`,
    );
    sources.nEdCompression = "ignored";
    return 0;
  }

  sources.nEdCompression = `from-nEd-${convention}`;

  if (compression < 0) {
    warnings.push(
      "Normal force is tensile for the selected convention; compression contribution in shear resistance was set to zero.",
    );
  }

  return Math.max(compression, 0);
}

function resolveTransverseReinforcement({
  shear,
  reinforcementMaterial,
  resolver,
  warnings,
  requireFyd = true,
}: {
  shear: RcShearInput;
  reinforcementMaterial: SteelMaterial | null;
  resolver: UnitResolver;
  warnings: string[];
  requireFyd?: boolean;
}): RcResolvedTransverseReinforcement | null {
  const transverse = shear.transverseReinforcement ?? {};
  const angle = transverse.angle ?? 90;

  if (angle !== 90) {
    warnings.push(
      "Only vertical stirrups with transverseReinforcement.angle = 90 are supported in this MVP.",
    );
    return null;
  }

  const legs = transverse.legs ?? transverse.numberOfLegs;
  const spacing = Number.isFinite(transverse.spacing)
    ? resolver.length(transverse.spacing as number)
    : null;
  const diameter = Number.isFinite(transverse.diameter)
    ? resolver.length(transverse.diameter as number)
    : null;
  const rawAreaPerLeg = transverse.areaPerLeg ?? transverse.area;
  const areaPerLeg = Number.isFinite(rawAreaPerLeg)
    ? resolver.area(rawAreaPerLeg as number)
    : diameter == null
      ? null
      : (Math.PI * diameter ** 2) / 4;
  const materialFyd = transverse.material?.fyd;
  const fyd = Number.isFinite(transverse.fyd)
    ? resolver.stress(transverse.fyd as number)
    : (materialFyd ?? reinforcementMaterial?.fyd ?? null);

  if (!isFinitePositive(legs)) {
    warnings.push("A positive transverseReinforcement.legs value is required.");
  }

  if (!isFinitePositive(spacing)) {
    warnings.push("A positive transverseReinforcement.spacing value is required.");
  }

  if (!isFinitePositive(areaPerLeg)) {
    warnings.push("Transverse reinforcement requires either diameter or areaPerLeg.");
  }

  if (requireFyd && !isFinitePositive(fyd)) {
    warnings.push(
      "Transverse reinforcement requires a design yield strength fyd or a reinforcement material with fyd.",
    );
  }

  if (
    !isFinitePositive(legs) ||
    !isFinitePositive(spacing) ||
    !isFinitePositive(areaPerLeg) ||
    (requireFyd && !isFinitePositive(fyd))
  ) {
    return null;
  }

  return {
    type: transverse.type ?? "stirrups",
    angle,
    legs,
    spacing,
    diameter,
    areaPerLeg,
    area: legs * areaPerLeg,
    areaPerSpacing: (legs * areaPerLeg) / spacing,
    fyd: isFinitePositive(fyd) ? fyd : null,
  };
}

function resolveCircularDiameter({
  section,
  shear,
  resolver,
  sources,
}: {
  section: ReinforcedConcreteSection;
  shear: RcShearInput;
  resolver: UnitResolver;
  sources: Record<string, string>;
}): number | null {
  const explicitDiameter = shear.sectionDiameter ?? shear.D;
  if (Number.isFinite(explicitDiameter)) {
    sources.diameter = "explicit";
    return resolver.length(explicitDiameter as number);
  }

  const concreteSection = concreteSectionFrom(section);

  if (Number.isFinite(concreteSection?.diameter)) {
    sources.diameter = "derived-circular-section";
    return concreteSection?.diameter as number;
  }

  sources.diameter = "missing";
  return null;
}

function resolveCosenzaLongitudinalArea({
  section,
  shear,
  resolver,
  sources,
}: {
  section: ReinforcedConcreteSection;
  shear: RcShearInput;
  resolver: UnitResolver;
  sources: Record<string, string>;
}): number | null {
  const explicitArea = shear.longitudinalReinforcementArea ?? shear.asl;
  if (Number.isFinite(explicitArea)) {
    sources.asl = "explicit";
    return resolver.area(explicitArea as number);
  }

  const area = section
    .getReinforcementBars()
    .reduce((sum, bar) => sum + (Number.isFinite(bar.area) ? bar.area : 0), 0);

  if (isFinitePositive(area)) {
    sources.asl = "derived-all-longitudinal-bars";
    return area;
  }

  sources.asl = "missing";
  return null;
}

function resolveCosenzaConcreteStrength({
  concreteMaterial,
  shear,
  resolver,
  sources,
}: {
  concreteMaterial: ConcreteMaterial;
  shear: RcShearInput;
  resolver: UnitResolver;
  sources: Record<string, string>;
}): number | null {
  const explicitStrength = shear.fcPrime ?? shear.concreteCylinderStrength ?? shear.fck;

  if (Number.isFinite(explicitStrength)) {
    sources.fcPrime = "explicit";
    return resolver.stress(explicitStrength as number);
  }

  if (Number.isFinite(concreteMaterial.fck)) {
    sources.fcPrime = "concrete-material-fck";
    return concreteMaterial.fck;
  }

  if (Number.isFinite(concreteMaterial.fcm)) {
    sources.fcPrime = "concrete-material-fcm";
    return concreteMaterial.fcm;
  }

  sources.fcPrime = "missing";
  return null;
}

export function resolveCosenzaParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  units,
  mode,
}: {
  section: ReinforcedConcreteSection;
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial | null;
  shear: RcShearInput;
  nEd: number;
  units: UnitSystemInput;
  mode: RcShearMode;
}): RcResolvedCosenzaParameters {
  const resolver = createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS);
  const warnings: string[] = [];
  const sources: Record<string, string> = {};
  const shape = sectionShape(section);
  const diameter = resolveCircularDiameter({ section, shear, resolver, sources });
  const concreteArea = resolveConcreteArea({ section, shear, resolver, sources });
  const longitudinalArea = resolveCosenzaLongitudinalArea({
    section,
    shear,
    resolver,
    sources,
  });
  const fcPrime = resolveCosenzaConcreteStrength({
    concreteMaterial,
    shear,
    resolver,
    sources,
  });
  const rhoL =
    isFinitePositive(longitudinalArea) && isFinitePositive(concreteArea)
      ? longitudinalArea / concreteArea
      : null;
  const transverseReinforcement =
    mode === "with-transverse-reinforcement"
      ? resolveTransverseReinforcement({
          shear,
          reinforcementMaterial,
          resolver,
          warnings,
          requireFyd: false,
        })
      : null;
  const rhoW =
    transverseReinforcement && isFinitePositive(diameter)
      ? transverseReinforcement.area / (transverseReinforcement.spacing * diameter)
      : null;

  if (shape !== "circular") {
    warnings.push(
      "Cosenza et al. (2016) shear resistance is available only for circular concrete sections.",
    );
  }

  if (Math.abs(nEd) > 1e-9) {
    warnings.push("Cosenza et al. (2016) does not include axial-force effects; nEd was ignored.");
  }

  return {
    mode,
    shape,
    diameter,
    concreteArea,
    longitudinalArea,
    rhoL,
    fcPrime,
    transverseReinforcement,
    rhoW,
    sources,
    warnings,
  };
}

export function resolveShearParameters({
  section,
  concreteMaterial,
  reinforcementMaterial,
  shear,
  nEd,
  mEd,
  units,
}: {
  section: ReinforcedConcreteSection;
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial | null;
  shear: RcShearInput;
  nEd: number;
  mEd: number;
  units: UnitSystemInput;
}): RcResolvedShearParameters {
  const resolver = createUnitResolver(units, DEFAULT_RC_SHEAR_UNITS);
  const warnings: string[] = [];
  const sources: Record<string, string> = {};
  const mode = resolveMode(shear);

  if (!mode) {
    warnings.push(
      "RC shear verification requires shear.mode: without-transverse-reinforcement or with-transverse-reinforcement.",
    );
  }

  const bw = resolveBw({ section, shear, resolver, warnings, sources });
  const { effectiveDepth, longitudinalArea, tensionFace, groupId, barIds } = resolveDAndAsl({
    section,
    shear,
    resolver,
    mEd,
    warnings,
    sources,
  });
  const concreteArea = resolveConcreteArea({ section, shear, resolver, sources });
  const nEdCompression = resolveCompression({
    nEd,
    shear,
    resolver,
    warnings,
    sources,
  });
  const sigmaCpRaw = isFinitePositive(concreteArea) ? nEdCompression / concreteArea : 0;
  const gammaC =
    shear.gammaC ??
    (typeof concreteMaterial.metadata.gammaC === "number" ? concreteMaterial.metadata.gammaC : 1.5);
  const alphaCc =
    shear.alphaCc ??
    (typeof concreteMaterial.metadata.alphaCc === "number"
      ? concreteMaterial.metadata.alphaCc
      : 0.85);
  const fck = Number.isFinite(shear.fck)
    ? resolver.stress(shear.fck as number)
    : (concreteMaterial.fck ?? null);
  const fcd = Number.isFinite(shear.fcd)
    ? resolver.stress(shear.fcd as number)
    : (Number.isFinite(shear.gammaC) || Number.isFinite(shear.alphaCc)) && Number.isFinite(fck)
      ? (alphaCc * (fck as number)) / gammaC
      : (concreteMaterial.fcd ??
        (Number.isFinite(fck) ? (alphaCc * (fck as number)) / gammaC : null));
  const sigmaCpLimit = Number.isFinite(fcd) ? 0.2 * (fcd as number) : Number.POSITIVE_INFINITY;
  const sigmaCp = Math.min(sigmaCpRaw, sigmaCpLimit);
  const rhoL =
    isFinitePositive(longitudinalArea) && isFinitePositive(bw) && isFinitePositive(effectiveDepth)
      ? longitudinalArea / (bw * effectiveDepth)
      : null;
  const rhoLEffective = Number.isFinite(rhoL) ? Math.min(rhoL as number, 0.02) : null;
  const transverseReinforcement =
    mode === "with-transverse-reinforcement"
      ? resolveTransverseReinforcement({
          shear,
          reinforcementMaterial,
          resolver,
          warnings,
        })
      : null;

  if (sigmaCpRaw > sigmaCpLimit) {
    warnings.push(
      "Concrete compression stress contribution was capped at 0.2 fcd for shear verification.",
    );
  }

  return {
    ok: warnings.length === 0,
    mode,
    bw,
    effectiveDepth,
    concreteArea,
    longitudinalArea,
    rhoL,
    rhoLEffective,
    nEdCompression,
    sigmaCpRaw,
    sigmaCp,
    fck,
    fcd,
    gammaC,
    alphaCc,
    tensionFace,
    groupId,
    barIds,
    transverseReinforcement,
    sources,
    warnings,
  };
}
