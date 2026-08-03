// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/checks/SteelFem3DVerification.js.

import { RESULT_STATUS, type ResultStatus } from "../../../core/results/resultStatus.js";
import {
  steelNotSupportedCheck,
  verifySteelBendingShearInteraction,
  verifySteelConcentratedWebLoad,
  verifySteelShearTorsionInteraction,
  verifySteelWebShearBuckling,
  type SteelAdvancedLoadLike,
  type SteelAdvancedMaterialLike,
  type SteelAdvancedPanelLike,
  type SteelAdvancedSectionLike,
} from "./SteelAdvancedMemberChecks.js";

function round(value: number, decimals?: number): number;
function round(value: unknown, decimals?: number): unknown;
function round(value: unknown, decimals = 6): unknown {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(decimals))
    : value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface SteelFem3DPointLike {
  readonly [key: string]: unknown;
}

export interface SteelFem3DActionsLike {
  N?: number | null;
  Vy?: number | null;
  T?: number | null;
  B?: number | null;
  My?: number | null;
}

export interface SteelFem3DStationLike {
  station: number;
  coordinates?: SteelFem3DPointLike | null;
  actions: SteelFem3DActionsLike;
}

export interface SteelFem3DCombinationLike {
  id?: string | null;
  limitState?: string | null;
  stations: readonly SteelFem3DStationLike[];
}

export interface SteelFem3DWebPanelLike extends SteelAdvancedPanelLike {
  from?: number | null;
  to?: number | null;
  length?: number | null;
  id?: string | null;
}

export interface SteelFem3DConcentratedLoadLike extends SteelAdvancedLoadLike {
  combinationId?: string | null;
  station: number;
  force?: number | null;
  bearingLength?: number | null;
}

export interface SteelFem3DMemberLike {
  frameClassification: {
    sway: boolean;
    nonSway: boolean;
  };
  effectiveLengths: Record<string, unknown>;
  effectiveLengthFactors: Record<string, unknown>;
  webPanels: readonly SteelFem3DWebPanelLike[];
  concentratedLoads: readonly SteelFem3DConcentratedLoadLike[];
}

export interface SteelFem3DContractLike {
  member: SteelFem3DMemberLike;
  combinations: readonly SteelFem3DCombinationLike[];
}

export interface SteelFem3DSectionLike extends SteelAdvancedSectionLike {
  plasticSectionModulusY?: number | null;
  elasticSectionModulusY?: number | null;
  shearAreaY?: number | null;
  area?: number | null;
  height?: number | null;
  flangeThickness?: number | null;
  rootRadius?: number | null;
  webThickness?: number | null;
}

export interface SteelFem3DMaterialLike extends SteelAdvancedMaterialLike {
  fyk?: number | null;
}

export interface SteelFem3DUnitConversionLike {
  force(value: number): number;
  length(value: number): number;
  moment(value: number): number;
}

export interface SteelFem3DServiceabilityOptions {
  vibration?: { enabled?: boolean } | null;
}

export interface SteelFem3DResistanceOptions {
  class4Detected?: boolean;
  coldFormed?: boolean;
  fatigue?: { enabled?: boolean } | null;
}

export interface VerifySteelFem3DAdvancedOptions {
  contract: SteelFem3DContractLike;
  section: SteelFem3DSectionLike;
  material: SteelFem3DMaterialLike;
  resultToSectionUnits: SteelFem3DUnitConversionLike;
  sectionToResultUnits: SteelFem3DUnitConversionLike;
  serviceability?: SteelFem3DServiceabilityOptions;
  resistance?: SteelFem3DResistanceOptions;
  stability?: Record<string, unknown>;
}

export interface SteelFem3DCheckLike {
  id: string;
  description: string;
  status?: ResultStatus;
  demand?: number | null;
  capacity?: number | null;
  utilizationRatio?: number | null;
  ok?: boolean | null;
  metadata?: Record<string, unknown>;
  warnings?: string[];
  assumptions?: string[];
}

export interface SteelFem3DAdvancedResult {
  checks: SteelFem3DCheckLike[];
  warnings: string[];
  assumptions: string[];
  activeNotSupported: SteelFem3DCheckLike[];
  unsupportedFeatures: SteelFem3DCheckLike[];
  vibration: {
    status: "requires-input";
    automatic: false;
    requiredInputs: string[];
    reference: string;
    availableFemFields: string[];
    metadata: { requested: boolean };
  };
  status: ResultStatus;
}

function inSegment(station: number, segment: SteelFem3DWebPanelLike): boolean {
  return (
    (!Number.isFinite(segment.from) || station >= Number(segment.from) - 1e-9) &&
    (!Number.isFinite(segment.to) || station <= Number(segment.to) + 1e-9)
  );
}

function maxSample(
  samples: readonly SteelFem3DStationLike[],
  selector: (sample: SteelFem3DStationLike) => number,
  segment: SteelFem3DWebPanelLike | null = null,
): SteelFem3DStationLike | null {
  return samples
    .filter((sample) => !segment || inSegment(sample.station, segment))
    .reduce<SteelFem3DStationLike | null>(
      (selected, sample) =>
        !selected || Math.abs(selector(sample)) > Math.abs(selector(selected)) ? sample : selected,
      null,
    );
}

function decorate(
  check: SteelFem3DCheckLike,
  combination: SteelFem3DCombinationLike,
  station: SteelFem3DStationLike | null = null,
  segment: SteelFem3DWebPanelLike | null = null,
  restraintAssumptions: Record<string, unknown> = {},
): SteelFem3DCheckLike {
  return {
    ...check,
    metadata: {
      norm: "NTC 2018 / Circolare 2019",
      combinationId: combination?.id ?? null,
      limitState: combination?.limitState ?? null,
      station: station?.station ?? null,
      coordinates: station?.coordinates ? { ...station.coordinates } : null,
      governingSegment: segment?.id ?? null,
      restraintAssumptions: { ...restraintAssumptions },
      ...check.metadata,
    },
    warnings: [...(check.warnings ?? [])],
    assumptions: [...(check.assumptions ?? [])],
  };
}

function convertOptional(
  value: number | null | undefined,
  converter: (value: number) => number,
): number | null {
  return value == null ? null : converter(value);
}

function featureAt(index: number): SteelFem3DCheckLike {
  const feature = steelUnsupportedFeatureCatalog()[index];
  if (feature === undefined) {
    throw new Error("Steel unsupported feature catalog entry is unavailable.");
  }
  return feature;
}

export function steelUnsupportedFeatureCatalog(): SteelFem3DCheckLike[] {
  return [
    steelNotSupportedCheck({
      id: "steel-warping-torsion",
      description: "Warping torsion and bimoment verification",
      missingInputs: [
        "warping normal/shear stress distribution",
        "sectorial coordinates",
        "warping restraints and load eccentricities",
      ],
      reference: "NTC 2018 §4.2.4.1.2.7; UNI EN 1993-1-1 §6.2.7",
    }),
    steelNotSupportedCheck({
      id: "steel-torsional-flexural-torsional-buckling",
      description:
        "Torsional and flexural-torsional buckling of non-doubly-symmetric open sections",
      missingInputs: [
        "shear-centre coordinates",
        "warping constant",
        "torsional effective length",
        "end warping restraints",
        "elastic critical loads Ncr,T and Ncr,TF",
      ],
      reference: "Circolare 2019 C4.2.4.1.3.1; UNI EN 1993-1-1 §6.3.1.4",
    }),
    steelNotSupportedCheck({
      id: "steel-class-4-effective-properties",
      description: "Class 4 effective properties and stability",
      missingInputs: [
        "effective area Aeff",
        "effective section moduli Weff,y/Weff,z",
        "neutral-axis shift",
        "plate buckling reduction factors",
      ],
      reference: "NTC 2018 §4.2.4.1.2.2; UNI EN 1993-1-5 §4",
    }),
    steelNotSupportedCheck({
      id: "steel-fatigue",
      description: "Steel fatigue verification",
      missingInputs: [
        "stress-range spectrum",
        "detail category",
        "cycle counts",
        "partial factors and damage accumulation rule",
      ],
      reference: "NTC 2018 §4.2.4.1.4; UNI EN 1993-1-9",
    }),
    steelNotSupportedCheck({
      id: "steel-built-up-cold-formed",
      description: "Built-up members and cold-formed profiles",
      missingInputs: [
        "component spacing and connectors",
        "built-up shear stiffness",
        "local/distortional buckling data",
        "cold-forming corner properties",
      ],
      reference: "NTC 2018 §4.2.4; UNI EN 1993-1-1 §6.4 and UNI EN 1993-1-3",
    }),
  ];
}

export function verifySteelFem3DAdvanced(
  options: VerifySteelFem3DAdvancedOptions,
): SteelFem3DAdvancedResult {
  if (options === null) {
    throw new TypeError(
      "Cannot destructure property 'contract' of '(intermediate value)(intermediate value)(intermediate value)' as it is null.",
    );
  }
  const {
    contract,
    section,
    material,
    resultToSectionUnits,
    sectionToResultUnits,
    serviceability = {},
    resistance = {},
    stability: _stability = {},
  } = options;
  void _stability;

  const checks: SteelFem3DCheckLike[] = [];
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const activeNotSupported: SteelFem3DCheckLike[] = [];
  const family = String(section?.family ?? "").toUpperCase();
  const fy = material?.fyk;
  const gammaM0 = material?.metadata?.gammaM0 ?? 1.05;
  const bendingCapacity = sectionToResultUnits.moment(
    (Number(section?.plasticSectionModulusY ?? section?.elasticSectionModulusY) * Number(fy)) /
      Number(gammaM0),
  );
  const shearArea = section?.shearAreaY ?? section?.area;
  const shearCapacity = sectionToResultUnits.force(
    (Number(shearArea) * Number(fy)) / (Math.sqrt(3) * Number(gammaM0)),
  );
  const member = contract.member;
  const activateUnsupported = (check: SteelFem3DCheckLike): void => {
    if (!activeNotSupported.some((item) => item.id === check.id)) {
      activeNotSupported.push(check);
      checks.push(check);
      warnings.push(...(check.warnings ?? []));
    }
  };
  const restraintAssumptions = {
    sway: member.frameClassification.sway,
    nonSway: member.frameClassification.nonSway,
    effectiveLengths: { ...member.effectiveLengths },
    effectiveLengthFactors: { ...member.effectiveLengthFactors },
  };

  for (const combination of contract.combinations) {
    if (combination.limitState === "SLU") {
      for (const panel of member.webPanels) {
        const sample = maxSample(combination.stations, (item) => item.actions.Vy ?? 0, panel);
        if (!sample) continue;
        const result = verifySteelWebShearBuckling({
          section,
          material,
          vEd: resultToSectionUnits.force(sample.actions.Vy ?? 0),
          panel: {
            ...panel,
            length: convertOptional(panel.length, (value) => resultToSectionUnits.length(value)),
          },
        });
        const decorated = decorate(result.check, combination, sample, panel, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) {
          decorated.capacity = round(sectionToResultUnits.force(Number(decorated.capacity)));
        }
        decorated.demand = round(Math.abs(sample.actions.Vy ?? 0));
        checks.push(decorated);
        warnings.push(...(decorated.warnings ?? []));
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }

      const bendingShearSample = resistance.class4Detected
        ? null
        : maxSample(combination.stations, (item) => {
            const m = Math.abs(item.actions.My ?? 0) / Math.max(bendingCapacity, 1e-12);
            const v = Math.abs(item.actions.Vy ?? 0) / Math.max(shearCapacity, 1e-12);
            return m + v;
          });
      if (bendingShearSample) {
        const result = verifySteelBendingShearInteraction({
          section,
          material,
          mEd: resultToSectionUnits.moment(bendingShearSample.actions.My ?? 0),
          vEd: resultToSectionUnits.force(bendingShearSample.actions.Vy ?? 0),
          bendingCapacity: resultToSectionUnits.moment(bendingCapacity),
          shearCapacity: resultToSectionUnits.force(shearCapacity),
        });
        const decorated = decorate(
          result.check,
          combination,
          bendingShearSample,
          null,
          restraintAssumptions,
        );
        if (Number.isFinite(decorated.capacity)) {
          decorated.capacity = round(sectionToResultUnits.moment(Number(decorated.capacity)));
        }
        decorated.demand = round(Math.abs(bendingShearSample.actions.My ?? 0));
        checks.push(decorated);
      }

      for (const load of member.concentratedLoads.filter(
        (item) => !item.combinationId || item.combinationId === combination.id,
      )) {
        const panel = member.webPanels.find((item) => inSegment(load.station, item));
        const loadForCheck: SteelAdvancedLoadLike = {
          ...load,
          force: convertOptional(load.force, (value) => resultToSectionUnits.force(value)),
          bearingLength: convertOptional(load.bearingLength, (value) =>
            resultToSectionUnits.length(value),
          ),
        };
        const panelForCheck: SteelAdvancedPanelLike = panel
          ? {
              ...panel,
              length: convertOptional(panel.length, (value) => resultToSectionUnits.length(value)),
            }
          : {};
        const result = verifySteelConcentratedWebLoad({
          section,
          material,
          load: loadForCheck,
          panel: panelForCheck,
        });
        const station =
          combination.stations.find((item) => Math.abs(item.station - load.station) <= 1e-9) ??
          null;
        const decorated = decorate(result.check, combination, station, panel, restraintAssumptions);
        if (Number.isFinite(decorated.capacity)) {
          decorated.capacity = round(sectionToResultUnits.force(Number(decorated.capacity)));
        }
        decorated.demand = isFiniteNumber(load.force) ? round(Math.abs(load.force)) : null;
        checks.push(decorated);
        warnings.push(...(decorated.warnings ?? []));
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }

      const torsionSample = maxSample(combination.stations, (item) => item.actions.T ?? 0);
      const bimomentSample = maxSample(combination.stations, (item) => item.actions.B ?? 0);
      if (bimomentSample && Math.abs(bimomentSample.actions.B ?? 0) > 1e-9) {
        const unsupported = decorate(
          featureAt(0),
          combination,
          bimomentSample,
          null,
          restraintAssumptions,
        );
        checks.push(unsupported);
        activeNotSupported.push(unsupported);
        warnings.push(...(unsupported.warnings ?? []));
      } else if (torsionSample && Math.abs(torsionSample.actions.T ?? 0) > 1e-9) {
        const result = verifySteelShearTorsionInteraction({
          section,
          material,
          vEd: resultToSectionUnits.force(torsionSample.actions.Vy ?? 0),
          tEd: resultToSectionUnits.moment(torsionSample.actions.T ?? 0),
          shearCapacity: resultToSectionUnits.force(shearCapacity),
        });
        const decorated = decorate(
          result.check,
          combination,
          torsionSample,
          null,
          restraintAssumptions,
        );
        if (Number.isFinite(decorated.capacity)) {
          decorated.capacity = round(sectionToResultUnits.force(Number(decorated.capacity)));
        }
        decorated.demand = round(Math.abs(torsionSample.actions.Vy ?? 0));
        checks.push(decorated);
        warnings.push(...(decorated.warnings ?? []));
        if (decorated.status === RESULT_STATUS.NOT_SUPPORTED) activeNotSupported.push(decorated);
      }
    }
  }

  const hasCompressionDemand = contract.combinations.some(
    (combination) =>
      combination.limitState === "SLU" &&
      combination.stations.some((sample) => Math.abs(sample.actions.N ?? 0) > 1e-9),
  );
  if (["L", "LU", "T", "UPN"].includes(family) && hasCompressionDemand) {
    activateUnsupported(featureAt(1));
  }
  const height = section?.height;
  const flangeThickness = section?.flangeThickness;
  const webThickness = section?.webThickness;
  const hw =
    isFiniteNumber(height) && isFiniteNumber(flangeThickness)
      ? height - 2 * flangeThickness - 2 * (section.rootRadius ?? 0)
      : null;
  const epsilon = isFiniteNumber(fy) && fy > 0 ? Math.sqrt(235 / fy) : null;
  if (
    ["IPE", "HEA", "HEB", "HEM"].includes(family) &&
    member.webPanels.length === 0 &&
    isFiniteNumber(fy) &&
    isFiniteNumber(hw) &&
    isFiniteNumber(webThickness) &&
    isFiniteNumber(epsilon) &&
    hw / webThickness > (72 * epsilon) / (fy <= 460 ? 1.2 : 1)
  ) {
    activateUnsupported(
      steelNotSupportedCheck({
        id: "steel-web-shear-buckling",
        description: "Web shear buckling",
        missingInputs: [
          "web panel boundaries",
          "transverse stiffener positions",
          "end-post classification",
        ],
        reference: "NTC 2018 §4.2.4.1.2.6; UNI EN 1993-1-5 §5",
      }),
    );
  }
  if (family === "COMPOUND" || resistance.coldFormed === true) {
    activateUnsupported(featureAt(4));
  }
  if (resistance.fatigue?.enabled === true) activateUnsupported(featureAt(3));

  const vibration: SteelFem3DAdvancedResult["vibration"] = {
    status: "requires-input",
    automatic: false,
    requiredInputs: [
      "modal frequencies",
      "modal masses",
      "damping ratio",
      "occupancy/excitation model",
      "acceleration or response limits",
    ],
    reference: "NTC 2018 §4.2.4.2.2 and §7.2.6; ISO 10137",
    availableFemFields: ["combinationId", "station", "u", "v", "w", "rotations"],
    metadata: { requested: serviceability.vibration?.enabled === true },
  };

  return {
    checks,
    warnings: [...new Set(warnings)],
    assumptions,
    activeNotSupported,
    unsupportedFeatures: steelUnsupportedFeatureCatalog(),
    vibration,
    status:
      activeNotSupported.length > 0
        ? RESULT_STATUS.NOT_SUPPORTED
        : checks.every((check) => check.ok !== false)
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
  };
}
