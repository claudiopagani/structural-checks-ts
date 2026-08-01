import { VerificationResult } from "../../../core/results/VerificationResult.js";
import {
  governingCheck,
  isFinitePositive,
  round,
  utilizationCheck,
  type UtilizationCheck,
} from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { withNormativeReferences } from "../../../norms/normativeReference.js";
import { NTC2018_RC_CHAPTER_4_REFERENCES } from "../../../norms/ntc2018/normativeReferences.js";
import {
  computeWithTransverseResistanceAtCotTheta,
  type FixedCotThetaShearResistance,
} from "./shear/ntc2018ShearResistance.js";
import { resolveShearParameters } from "./shear/shearParameterResolvers.js";
import type { RcShearInput } from "./shear/types.js";
import type {
  RcTorsionInput,
  RcTorsionSectionActionInput,
  RcTorsionVerificationData,
  RcTorsionVerificationInput,
  RcTorsionVerificationOptions,
} from "./torsion/types.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystemInput;
const COT_THETA_MIN = 1;
const COT_THETA_MAX = 2.5;

interface TorsionGeometry {
  concreteArea: number | null;
  sectionPerimeter: number | null;
  edgeDistance: number | null;
  baseThickness: number | null;
  effectiveWallThickness: number | null;
  medianArea: number | null;
  medianPerimeter: number | null;
}

interface ResolvedTorsionTransverseReinforcement {
  area: number;
  spacing: number;
  areaPerSpacing: number;
  diameter: number | null;
  fyd: number;
  closed: true;
}

interface ResolvedTorsionLongitudinalReinforcement {
  area: number;
  fyd: number;
}

interface ResolvedCotTheta {
  value: number;
  source: "explicit" | "pure-torsion-compatible-reinforcement";
  unclamped: number;
}

interface VerifyTorsionActionsOptions {
  code: string;
  section: ReinforcedConcreteSection;
  concreteMaterial: ConcreteMaterial;
  reinforcementMaterial: SteelMaterial | null;
  tEd: number | null;
  vEd: number | null;
  nEd: number | null;
  mEd: number | null;
  torsion: RcTorsionInput;
  shear: RcShearInput | null;
  units: UnitSystemInput | null | undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function polygonPerimeter(
  points: readonly { y: number; z: number }[] | null | undefined = [],
): number | null {
  if (points == null || points.length < 3) {
    return null;
  }

  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + Math.hypot(next.y - point.y, next.z - point.z);
  }, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveGeometry({
  section,
  torsion,
  resolver,
  warnings,
  sources,
}: {
  section: ReinforcedConcreteSection;
  torsion: RcTorsionInput;
  resolver: UnitResolver;
  warnings: string[];
  sources: Record<string, string>;
}): TorsionGeometry {
  const concreteSection = section.concreteSection ?? section;
  const concreteAreaInput = torsion.concreteArea ?? torsion.ac;
  const concreteArea = isFiniteNumber(concreteAreaInput)
    ? resolver.area(concreteAreaInput)
    : concreteSection.area;
  const sectionPerimeterInput = torsion.sectionPerimeter ?? torsion.perimeter;
  const sectionPerimeter = isFiniteNumber(sectionPerimeterInput)
    ? resolver.length(sectionPerimeterInput)
    : isFiniteNumber(concreteSection.width) && isFiniteNumber(concreteSection.height)
      ? 2 * (concreteSection.width + concreteSection.height)
      : polygonPerimeter(concreteSection.outlinePoints);

  sources.concreteArea = isFiniteNumber(concreteAreaInput) ? "explicit" : "section";
  sources.sectionPerimeter = isFiniteNumber(sectionPerimeterInput) ? "explicit" : "section";

  const edgeDistanceInput = torsion.edgeToLongitudinalBarCenter ?? torsion.edgeDistance;
  const edgeDistance = isFiniteNumber(edgeDistanceInput)
    ? resolver.length(edgeDistanceInput)
    : null;
  const baseThickness =
    isFinitePositive(concreteArea) && isFinitePositive(sectionPerimeter)
      ? concreteArea / sectionPerimeter
      : null;
  const explicitThicknessInput = torsion.effectiveWallThickness ?? torsion.t;
  const explicitThickness = isFiniteNumber(explicitThicknessInput)
    ? resolver.length(explicitThicknessInput)
    : null;
  const effectiveWallThickness =
    explicitThickness ??
    (isFinitePositive(baseThickness)
      ? Math.max(baseThickness, isFinitePositive(edgeDistance) ? 2 * edgeDistance : 0)
      : null);

  sources.effectiveWallThickness = explicitThickness != null ? "explicit" : "derived-Ac-over-u";

  if (explicitThickness == null && edgeDistance == null) {
    warnings.push(
      "The NTC lower bound t >= 2 times the edge-to-longitudinal-bar-center distance was not checked; pass torsion.edgeToLongitudinalBarCenter or torsion.effectiveWallThickness.",
    );
  }

  const medianAreaInput = torsion.medianArea ?? torsion.ak;
  const medianPerimeterInput = torsion.medianPerimeter ?? torsion.um;
  let medianArea = isFiniteNumber(medianAreaInput) ? resolver.area(medianAreaInput) : null;
  let medianPerimeter = isFiniteNumber(medianPerimeterInput)
    ? resolver.length(medianPerimeterInput)
    : null;

  if (
    (medianArea == null || medianPerimeter == null) &&
    isFinitePositive(concreteSection.width) &&
    isFinitePositive(concreteSection.height) &&
    isFinitePositive(effectiveWallThickness)
  ) {
    const medianWidth = concreteSection.width - effectiveWallThickness;
    const medianHeight = concreteSection.height - effectiveWallThickness;

    if (medianWidth > 0 && medianHeight > 0) {
      medianArea ??= medianWidth * medianHeight;
      medianPerimeter ??= 2 * (medianWidth + medianHeight);
      sources.medianGeometry = "derived-rectangular-section";
    }
  }

  if (medianArea == null || medianPerimeter == null) {
    sources.medianGeometry = "missing";
    warnings.push(
      "Torsion medianArea and medianPerimeter are required when they cannot be derived from a rectangular section.",
    );
  }

  return {
    concreteArea,
    sectionPerimeter,
    edgeDistance,
    baseThickness,
    effectiveWallThickness,
    medianArea,
    medianPerimeter,
  };
}

function resolveTransverseReinforcement({
  torsion,
  reinforcementMaterial,
  resolver,
  warnings,
}: {
  torsion: RcTorsionInput;
  reinforcementMaterial: SteelMaterial | null;
  resolver: UnitResolver;
  warnings: string[];
}): ResolvedTorsionTransverseReinforcement | null {
  const transverse = torsion.transverseReinforcement ?? {};
  const diameter = isFiniteNumber(transverse.diameter)
    ? resolver.length(transverse.diameter)
    : null;
  const areaInput = transverse.areaPerLeg ?? transverse.area;
  const area = isFiniteNumber(areaInput)
    ? resolver.area(areaInput)
    : isFinitePositive(diameter)
      ? (Math.PI * diameter ** 2) / 4
      : null;
  const spacing = isFiniteNumber(transverse.spacing) ? resolver.length(transverse.spacing) : null;
  const fyd = isFiniteNumber(transverse.fyd)
    ? resolver.stress(transverse.fyd)
    : (transverse.material?.fyd ?? reinforcementMaterial?.fyd ?? null);

  if (transverse.closed === false) {
    warnings.push("Torsion reinforcement requires closed transverse stirrups.");
    return null;
  }

  if (!isFinitePositive(area) || !isFinitePositive(spacing) || !isFinitePositive(fyd)) {
    warnings.push(
      "Torsion transverse reinforcement requires areaPerLeg or diameter, spacing and fyd.",
    );
    return null;
  }

  return {
    area,
    spacing,
    areaPerSpacing: area / spacing,
    diameter,
    fyd,
    closed: true,
  };
}

function resolveLongitudinalReinforcement({
  torsion,
  reinforcementMaterial,
  resolver,
  warnings,
}: {
  torsion: RcTorsionInput;
  reinforcementMaterial: SteelMaterial | null;
  resolver: UnitResolver;
  warnings: string[];
}): ResolvedTorsionLongitudinalReinforcement | null {
  const longitudinal = torsion.longitudinalReinforcement ?? {};
  const areaInput =
    longitudinal.area ??
    torsion.torsionalLongitudinalReinforcementArea ??
    torsion.longitudinalReinforcementArea;
  const area = isFiniteNumber(areaInput) ? resolver.area(areaInput) : null;
  const fydInput = longitudinal.fyd ?? torsion.longitudinalFyd;
  const fyd = isFiniteNumber(fydInput)
    ? resolver.stress(fydInput)
    : (longitudinal.material?.fyd ?? reinforcementMaterial?.fyd ?? null);

  if (!isFinitePositive(area) || !isFinitePositive(fyd)) {
    warnings.push(
      "Torsion longitudinal reinforcement requires an explicit area assigned to torsion and fyd.",
    );
    return null;
  }

  return { area, fyd };
}

function resolveCotTheta({
  torsion,
  transverse,
  longitudinal,
  geometry,
  warnings,
}: {
  torsion: RcTorsionInput;
  transverse: ResolvedTorsionTransverseReinforcement | null;
  longitudinal: ResolvedTorsionLongitudinalReinforcement | null;
  geometry: TorsionGeometry;
  warnings: string[];
}): ResolvedCotTheta | null {
  const requested = torsion.cotTheta;

  if (isFiniteNumber(requested)) {
    if (requested < COT_THETA_MIN || requested > COT_THETA_MAX) {
      warnings.push(`torsion.cotTheta must lie in [${COT_THETA_MIN}, ${COT_THETA_MAX}].`);
      return null;
    }

    return {
      value: requested,
      source: "explicit",
      unclamped: requested,
    };
  }

  if (transverse && longitudinal && isFinitePositive(geometry.medianPerimeter)) {
    const aL = longitudinal.area / geometry.medianPerimeter;
    const aS = transverse.area / transverse.spacing;
    const compatible = Math.sqrt(aL / aS);

    return {
      value: clamp(compatible, COT_THETA_MIN, COT_THETA_MAX),
      source: "pure-torsion-compatible-reinforcement",
      unclamped: compatible,
    };
  }

  warnings.push("torsion.cotTheta could not be derived from complete reinforcement data.");
  return null;
}

function missingParameters({
  geometry,
  transverse,
  longitudinal,
  cotTheta,
  fcdPrime,
}: {
  geometry: TorsionGeometry;
  transverse: ResolvedTorsionTransverseReinforcement | null;
  longitudinal: ResolvedTorsionLongitudinalReinforcement | null;
  cotTheta: ResolvedCotTheta | null;
  fcdPrime: number;
}): string[] {
  const missing: string[] = [];

  if (!isFinitePositive(geometry.effectiveWallThickness)) {
    missing.push("effectiveWallThickness");
  }
  if (!isFinitePositive(geometry.medianArea)) missing.push("medianArea");
  if (!isFinitePositive(geometry.medianPerimeter)) missing.push("medianPerimeter");
  if (!transverse) missing.push("transverseReinforcement");
  if (!longitudinal) missing.push("longitudinalReinforcement");
  if (!cotTheta) missing.push("cotTheta");
  if (!isFinitePositive(fcdPrime)) missing.push("fcdPrime");

  return missing;
}

function verifyTorsionActions({
  code,
  section,
  concreteMaterial,
  reinforcementMaterial,
  tEd,
  vEd,
  nEd,
  mEd,
  torsion,
  shear,
  units,
}: VerifyTorsionActionsOptions): RcTorsionVerificationData {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const convertedTEd = Math.abs(resolver.moment(tEd ?? 0));
  const convertedVEd = Math.abs(resolver.force(vEd ?? 0));
  const convertedNEd = resolver.force(nEd ?? 0);
  const convertedMEd = resolver.moment(mEd ?? 0);
  const warnings: string[] = [];
  const sources: Record<string, string> = {};

  if (torsion.equilibriumRequired === false) {
    return {
      status: RESULT_STATUS.NOT_ANALYZED,
      utilizationRatio: null,
      demand: convertedTEd,
      capacity: null,
      checks: [],
      outputs: { tEd: convertedTEd, vEd: convertedVEd },
      warnings: [
        "Torsion was classified as compatibility torsion; no ULS torsion resistance check was performed.",
      ],
      assumptions: [],
      metadata: withNormativeReferences(
        {
          code,
          method: "ntc2018-4.1.2.3.6",
          equilibriumRequired: false,
        },
        [NTC2018_RC_CHAPTER_4_REFERENCES.torsion],
      ),
    };
  }

  const geometry = resolveGeometry({ section, torsion, resolver, warnings, sources });
  const transverse = resolveTransverseReinforcement({
    torsion,
    reinforcementMaterial,
    resolver,
    warnings,
  });
  const longitudinal = resolveLongitudinalReinforcement({
    torsion,
    reinforcementMaterial,
    resolver,
    warnings,
  });
  const cotTheta = resolveCotTheta({
    torsion,
    transverse,
    longitudinal,
    geometry,
    warnings,
  });
  const explicitFcdPrime = torsion.fcdPrime;
  const fcdPrime = isFiniteNumber(explicitFcdPrime)
    ? resolver.stress(explicitFcdPrime)
    : (torsion.fcdPrimeFactor ?? 0.5) * (concreteMaterial.fcd ?? 0);
  const missing = missingParameters({
    geometry,
    transverse,
    longitudinal,
    cotTheta,
    fcdPrime,
  });

  if (missing.length > 0) {
    return {
      status: RESULT_STATUS.NOT_VERIFIED,
      utilizationRatio: null,
      demand: convertedTEd,
      capacity: null,
      checks: [],
      outputs: {
        tEd: convertedTEd,
        vEd: convertedVEd,
        geometry,
        sources,
      },
      warnings,
      assumptions: [
        "NTC 2018 4.1.2.3.6 torsion resistance was not evaluated because required parameters are incomplete.",
      ],
      metadata: withNormativeReferences(
        {
          code,
          method: "ntc2018-4.1.2.3.6",
          missingParameters: missing,
        },
        [NTC2018_RC_CHAPTER_4_REFERENCES.torsion],
      ),
    };
  }

  const medianArea = geometry.medianArea as number;
  const effectiveWallThickness = geometry.effectiveWallThickness as number;
  const medianPerimeter = geometry.medianPerimeter as number;
  const resolvedTransverse = transverse as ResolvedTorsionTransverseReinforcement;
  const resolvedLongitudinal = longitudinal as ResolvedTorsionLongitudinalReinforcement;
  const resolvedCotTheta = cotTheta as ResolvedCotTheta;

  // NTC 2018 § 4.1.2.3.6, formulas [4.1.35]-[4.1.37].
  const cot = resolvedCotTheta.value;
  const trcd = (2 * medianArea * effectiveWallThickness * fcdPrime * cot) / (1 + cot ** 2);
  const trsd = 2 * medianArea * resolvedTransverse.areaPerSpacing * resolvedTransverse.fyd * cot;
  const trld =
    (2 * medianArea * resolvedLongitudinal.area * resolvedLongitudinal.fyd) /
    (medianPerimeter * cot);
  const torsionChecks: UtilizationCheck[] = [
    utilizationCheck({
      id: "rc-torsion-concrete-strut",
      description: "Torsion resistance of concrete compression struts",
      demand: convertedTEd,
      capacity: trcd,
      metadata: withNormativeReferences({ reference: "NTC2018-4.1.35" }, [
        NTC2018_RC_CHAPTER_4_REFERENCES.torsion,
      ]),
    }),
    utilizationCheck({
      id: "rc-torsion-transverse-reinforcement",
      description: "Torsion resistance of closed transverse reinforcement",
      demand: convertedTEd,
      capacity: trsd,
      metadata: withNormativeReferences({ reference: "NTC2018-4.1.36" }, [
        NTC2018_RC_CHAPTER_4_REFERENCES.torsion,
      ]),
    }),
    utilizationCheck({
      id: "rc-torsion-longitudinal-reinforcement",
      description: "Torsion resistance of longitudinal reinforcement assigned to torsion",
      demand: convertedTEd,
      capacity: trld,
      metadata: withNormativeReferences({ reference: "NTC2018-4.1.37" }, [
        NTC2018_RC_CHAPTER_4_REFERENCES.torsion,
      ]),
    }),
  ];
  let shearAtCotTheta: FixedCotThetaShearResistance | null = null;

  if (convertedVEd > 1e-9) {
    if (!shear) {
      warnings.push(
        "Combined shear-torsion resistance requires the shear parameters used for the member verification.",
      );
    } else {
      const shearInput: RcShearInput = {
        ...shear,
        mode: "with-transverse-reinforcement",
        torsionHandled: true,
      };
      const shearParams = resolveShearParameters({
        section,
        concreteMaterial,
        reinforcementMaterial,
        shear: shearInput,
        nEd: convertedNEd,
        mEd: convertedMEd,
        units: INTERNAL_UNITS,
      });
      shearAtCotTheta = computeWithTransverseResistanceAtCotTheta({
        params: shearParams,
        shear: shearInput,
        units: INTERNAL_UNITS,
        cotTheta: cot,
      });
      warnings.push(...shearAtCotTheta.warnings);

      if (shearAtCotTheta.available) {
        // NTC 2018 § 4.1.2.3.6, formula [4.1.40].
        const interaction = convertedTEd / trcd + convertedVEd / shearAtCotTheta.vRcd;

        torsionChecks.push({
          id: "rc-shear-torsion-concrete-interaction",
          description: "Combined shear and torsion resistance of concrete struts",
          demand: round(interaction),
          capacity: 1,
          utilizationRatio: round(interaction),
          ok: interaction <= 1,
          metadata: withNormativeReferences(
            {
              reference: "NTC2018-4.1.40",
              tEd: round(convertedTEd),
              trcd: round(trcd),
              vEd: round(convertedVEd),
              vRcd: round(shearAtCotTheta.vRcd),
              cotTheta: round(cot),
            },
            [NTC2018_RC_CHAPTER_4_REFERENCES.torsion],
          ),
        });
      }
    }
  }

  const combinedMissing = convertedVEd > 1e-9 && !shearAtCotTheta?.available;
  const governing = governingCheck(torsionChecks);
  const allChecksPass = torsionChecks.every((check) => check.ok === true);
  const torsionCapacity = Math.min(trcd, trsd, trld);

  warnings.push(
    "Longitudinal torsion reinforcement is checked as an explicitly assigned area; its additive placement with flexural reinforcement is not detailed by this MVP.",
  );

  return {
    status: !combinedMissing && allChecksPass ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
    utilizationRatio: governing?.utilizationRatio ?? null,
    demand: governing?.demand ?? convertedTEd,
    capacity: governing?.capacity ?? torsionCapacity,
    checks: torsionChecks,
    outputs: {
      tEd: round(convertedTEd),
      vEd: round(convertedVEd),
      cotTheta: round(cot),
      cotThetaSource: resolvedCotTheta.source,
      cotThetaUnclamped: round(resolvedCotTheta.unclamped),
      geometry: {
        concreteArea: round(geometry.concreteArea),
        sectionPerimeter: round(geometry.sectionPerimeter),
        edgeDistance: round(geometry.edgeDistance),
        baseThickness: round(geometry.baseThickness),
        effectiveWallThickness: round(geometry.effectiveWallThickness),
        medianArea: round(geometry.medianArea),
        medianPerimeter: round(geometry.medianPerimeter),
      },
      reinforcement: {
        transverse: {
          area: round(resolvedTransverse.area),
          spacing: round(resolvedTransverse.spacing),
          areaPerSpacing: round(resolvedTransverse.areaPerSpacing, 9),
          fyd: round(resolvedTransverse.fyd),
        },
        longitudinal: {
          area: round(resolvedLongitudinal.area),
          fyd: round(resolvedLongitudinal.fyd),
        },
      },
      fcdPrime: round(fcdPrime),
      trcd: round(trcd),
      trsd: round(trsd),
      trld: round(trld),
      trd: round(torsionCapacity),
      shearAtCotTheta: shearAtCotTheta?.available
        ? {
            vRsd: round(shearAtCotTheta.vRsd),
            vRcd: round(shearAtCotTheta.vRcd),
            z: round(shearAtCotTheta.z),
            fcdPrime: round(shearAtCotTheta.fcdPrime),
            alphaC: round(shearAtCotTheta.alphaC),
          }
        : null,
      sources,
    },
    warnings,
    assumptions: [
      "NTC 2018 4.1.2.3.6 peripheral space-truss resistance is used for solid or hollow prismatic sections within its stated scope.",
      "The same cotTheta is used for torsion and the concrete shear-torsion interaction check.",
      "The default reduced concrete strength is f'cd = 0.5 fcd unless torsion.fcdPrime or torsion.fcdPrimeFactor is supplied.",
    ],
    metadata: withNormativeReferences(
      {
        code,
        method: "ntc2018-4.1.2.3.6",
        governingCheckId: governing?.id ?? null,
        missingParameters: combinedMissing ? ["combinedShearTorsionParameters"] : [],
      },
      [
        NTC2018_RC_CHAPTER_4_REFERENCES.torsion,
        ...(convertedVEd > 1e-9
          ? [NTC2018_RC_CHAPTER_4_REFERENCES.shearWithTransverseReinforcement]
          : []),
      ],
    ),
  };
}

export class ReinforcedConcreteTorsionVerification {
  code: string;
  torsion: RcTorsionInput;
  shear: RcShearInput | null;
  metadata: Record<string, unknown>;

  constructor({
    code = "NTC2018",
    torsion = {},
    shear = null,
    metadata = {},
  }: RcTorsionVerificationOptions = {}) {
    this.code = code;
    this.torsion = { ...torsion };
    this.shear = shear;
    this.metadata = { ...metadata };
  }

  verifySectionActions(input: RcTorsionSectionActionInput = {}): RcTorsionVerificationData {
    const context = input.context ?? {};
    const section = input.section === undefined ? context.section : input.section;
    const concreteMaterial =
      input.concreteMaterial === undefined
        ? (context.concreteMaterial ??
          (section?.concreteMaterial as ConcreteMaterial | null | undefined))
        : input.concreteMaterial;
    const reinforcementMaterial =
      input.reinforcementMaterial === undefined
        ? (context.reinforcementMaterial ??
          (section?.reinforcementMaterial as SteelMaterial | null | undefined))
        : input.reinforcementMaterial;
    const torsion = input.torsion ?? context.torsion ?? this.torsion;
    const shear = input.shear === undefined ? (context.shear ?? this.shear) : input.shear;
    const units =
      input.units ??
      context.units ??
      torsion.units ??
      (section?.metadata.unitSystem as UnitSystemInput | undefined) ??
      INTERNAL_UNITS;
    const tEd = input.tEd ?? 0;

    if (!section || !concreteMaterial) {
      return {
        status: RESULT_STATUS.NOT_VERIFIED,
        utilizationRatio: null,
        demand: Math.abs(tEd),
        capacity: null,
        checks: [],
        outputs: {},
        warnings: ["RC torsion verification requires a section and a concrete material."],
        assumptions: [],
        metadata: {
          code: this.code,
          method: "ntc2018-4.1.2.3.6",
        },
      };
    }

    return verifyTorsionActions({
      code: this.code,
      section,
      concreteMaterial,
      reinforcementMaterial: reinforcementMaterial ?? null,
      tEd,
      vEd: input.vEd ?? 0,
      nEd: input.nEd ?? 0,
      mEd: input.mEd ?? 0,
      torsion: { ...this.torsion, ...torsion },
      shear: shear ?? null,
      units,
    });
  }

  verify(options: RcTorsionVerificationInput = {}): VerificationResult {
    const actions = options.actions ?? {};
    const result = this.verifySectionActions({
      ...options,
      tEd: actions.tEd ?? actions.t ?? 0,
      vEd: actions.vEd ?? actions.v ?? 0,
      nEd: actions.nEd ?? actions.n ?? 0,
      mEd: actions.mEd ?? actions.m ?? 0,
      context: {
        ...(options.section === undefined ? {} : { section: options.section }),
        ...(options.concreteMaterial === undefined
          ? {}
          : { concreteMaterial: options.concreteMaterial }),
        ...(options.reinforcementMaterial === undefined
          ? {}
          : { reinforcementMaterial: options.reinforcementMaterial }),
        ...(options.torsion === undefined ? {} : { torsion: options.torsion }),
        ...(options.shear === undefined ? {} : { shear: options.shear }),
        ...(options.units === undefined ? {} : { units: options.units }),
      },
    });

    return new VerificationResult({
      applicationId: "reinforced-concrete-torsion",
      ...result,
      metadata: {
        ...result.metadata,
        ...this.metadata,
      },
    });
  }
}
