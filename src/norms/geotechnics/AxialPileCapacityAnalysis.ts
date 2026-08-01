import { assertExplicitUnitSystem, type UnitSystemInput } from "../../domain/units/UnitSystem.js";
import {
  AxialPileLoadScenario,
  type AxialPileLoadScenarioInput,
} from "../../domain/geotechnics/AxialPileLoadScenario.js";
import {
  DeepFoundationModel,
  type DeepFoundationModelInput,
} from "../../domain/geotechnics/DeepFoundationModel.js";
import {
  GeotechnicalDesignSituation,
  type GeotechnicalDesignSituationInput,
  type ParameterResolution,
} from "../../domain/geotechnics/GeotechnicalDesignSituation.js";
import { GroundModel, type GroundModelInput } from "../../domain/geotechnics/GroundModel.js";
import type { GroundLayer, GroundProfile } from "../../domain/geotechnics/GroundProfile.js";
import {
  GEOTECHNICAL_INTERNAL_UNITS,
  type SoilRecord,
} from "../../domain/geotechnics/SoilMaterial.js";
import { VerticalStressProfile } from "../../domain/geotechnics/VerticalStressProfile.js";
import { withNormativeReferences } from "../normativeReference.js";
import { GEOTECHNICAL_EXTERNAL_REFERENCES } from "./normativeReferences.js";

export const AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION = "axial-pile-capacity-result/v1";
export const AXIAL_PILE_CAPACITY_REFERENCE =
  "USACE EM 1110-2-2906 (1991), paragraphs 4-3a(1)-(4), equations for axial pile capacity";

const TOLERANCE = 1e-10;
const USACE_LAYER_PROXIMITY_MINIMUM = 1.524;

export interface AxialPileCapacityAnalysisInput {
  groundModel?: GroundModel | GroundModelInput;
  designSituation?: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput;
  pile?: DeepFoundationModel | DeepFoundationModelInput;
  scenario?: AxialPileLoadScenario | AxialPileLoadScenarioInput;
  profileId?: string | null;
  units?: UnitSystemInput | null;
}

export interface AxialPileCapacityAnalysisResult {
  status: string;
  summary: string;
  outputs: SoilRecord;
  warnings: unknown[];
  assumptions: unknown[];
  metadata: SoilRecord;
}

function result({
  status,
  summary,
  outputs = {},
  warnings = [],
  assumptions = [],
  metadata = {},
}: AxialPileCapacityAnalysisResult): AxialPileCapacityAnalysisResult {
  return { status, summary, outputs, warnings, assumptions, metadata };
}

function normalizeGroundModel(
  value: GroundModel | GroundModelInput | undefined,
  units: UnitSystemInput,
): GroundModel {
  return value instanceof GroundModel
    ? value
    : new GroundModel({ ...value, units: value?.units ?? units });
}

function normalizeDesignSituation(
  value: GeotechnicalDesignSituation | GeotechnicalDesignSituationInput | undefined,
  groundModel: GroundModel,
  units: UnitSystemInput,
): GeotechnicalDesignSituation {
  return value instanceof GeotechnicalDesignSituation
    ? value
    : new GeotechnicalDesignSituation({
        ...value,
        groundModel,
        units: value?.units ?? units,
      });
}

function normalizePile(
  value: DeepFoundationModel | DeepFoundationModelInput | undefined,
  units: UnitSystemInput,
): DeepFoundationModel {
  return value instanceof DeepFoundationModel
    ? value
    : new DeepFoundationModel({ ...value, units: value?.units ?? units });
}

function normalizeScenario(
  value: AxialPileLoadScenario | AxialPileLoadScenarioInput | undefined,
  units: UnitSystemInput,
): AxialPileLoadScenario {
  return value instanceof AxialPileLoadScenario
    ? value
    : new AxialPileLoadScenario({ ...value, units: value?.units ?? units });
}

function numeric(record: SoilRecord, key: string): number {
  return Number(record[key]);
}

function nullableNumeric(record: SoilRecord, key: string): number | null {
  const value = record[key];
  return value == null ? null : Number(value);
}

function cap(value: number, maximum: number | null): number {
  return maximum == null ? value : Math.min(value, maximum);
}

function averageCappedLinear(
  topValue: number,
  bottomValue: number,
  maximum: number | null,
): number {
  if (maximum == null) return (topValue + bottomValue) / 2;
  const top = Math.max(topValue, 0);
  const bottom = Math.max(bottomValue, 0);
  if (top <= maximum && bottom <= maximum) return (top + bottom) / 2;
  if (top >= maximum && bottom >= maximum) return maximum;
  const low = Math.min(top, bottom);
  const high = Math.max(top, bottom);
  const lowFraction = (maximum - low) / (high - low);
  return (lowFraction * (low + maximum)) / 2 + (1 - lowFraction) * maximum;
}

interface ShaftInterval {
  layer: GroundLayer;
  topElevation: number;
  bottomElevation: number;
}

function shaftLayerIntervals(
  profile: GroundProfile,
  topElevation: number,
  toeElevation: number,
): ShaftInterval[] {
  return profile.layers.flatMap((layer) => {
    const top = Math.min(layer.topElevation, topElevation);
    const bottom = Math.max(layer.bottomElevation, toeElevation);
    if (top <= bottom + TOLERANCE) return [];
    return [{ layer, topElevation: top, bottomElevation: bottom }];
  });
}

function resolveLayerParameters(
  designSituation: GeotechnicalDesignSituation,
  groundModel: GroundModel,
  layer: GroundLayer,
): ParameterResolution {
  return designSituation.resolveParameterSet({
    groundModel,
    layerId: layer.id,
    materialId: layer.materialId,
  });
}

function requireStrengthModel(
  parameterResolution: ParameterResolution,
  expected: string,
  method: unknown,
  layerId: string,
): void {
  const actual = parameterResolution.parameterSet.strength.model;
  if (actual !== expected) {
    throw new Error(
      `${String(method)} in layer ${layerId} requires strength model ${expected}, not ${actual}.`,
    );
  }
}

function betaStressLimit(method: SoilRecord): number | null {
  let limit = nullableNumeric(method, "maximumEffectiveVerticalStress");
  const maximumUnitResistance = nullableNumeric(method, "maximumUnitResistance");
  const beta = numeric(method, "beta");
  if (maximumUnitResistance != null && beta > 0) {
    const unitLimit = maximumUnitResistance / beta;
    limit = limit == null ? unitLimit : Math.min(limit, unitLimit);
  }
  return limit;
}

function calculateEffectiveStressShaft({
  interval,
  method,
  stressProfile,
  shaftPerimeter,
}: {
  interval: ShaftInterval;
  method: SoilRecord;
  stressProfile: VerticalStressProfile;
  shaftPerimeter: number;
}) {
  const breakpoints = stressProfile.breakpoints({
    topElevation: interval.topElevation,
    bottomElevation: interval.bottomElevation,
  });
  const stressLimit = betaStressLimit(method);
  const subsegments: SoilRecord[] = [];
  let resistance = 0;
  for (let index = 0; index < breakpoints.length - 1; index += 1) {
    const topElevation = breakpoints[index] as number;
    const bottomElevation = breakpoints[index + 1] as number;
    const length = topElevation - bottomElevation;
    const topStress = Math.max(stressProfile.evaluate(topElevation).effectiveVerticalStress, 0);
    const bottomStress = Math.max(
      stressProfile.evaluate(bottomElevation).effectiveVerticalStress,
      0,
    );
    const averageEffectiveStress = averageCappedLinear(topStress, bottomStress, stressLimit);
    const averageUnitResistance = cap(
      numeric(method, "beta") * averageEffectiveStress,
      nullableNumeric(method, "maximumUnitResistance"),
    );
    const sideArea = shaftPerimeter * length;
    const segmentResistance = averageUnitResistance * sideArea;
    resistance += segmentResistance;
    subsegments.push({
      topElevation,
      bottomElevation,
      length,
      effectiveVerticalStress: {
        top: topStress,
        bottom: bottomStress,
        averageAfterLimit: averageEffectiveStress,
        limit: stressLimit,
      },
      averageUnitResistance,
      sideArea,
      resistance: segmentResistance,
    });
  }
  return { resistance, subsegments };
}

function calculateShaftLayer({
  interval,
  method,
  parameterResolution,
  stressProfile,
  shaftPerimeter,
}: {
  interval: ShaftInterval;
  method: SoilRecord;
  parameterResolution: ParameterResolution;
  stressProfile: VerticalStressProfile;
  shaftPerimeter: number;
}): SoilRecord {
  const length = interval.topElevation - interval.bottomElevation;
  const sideArea = shaftPerimeter * length;
  let resistance: number;
  let averageUnitResistance: number;
  let subsegments: SoilRecord[] = [];
  if (method.method === "alpha-undrained") {
    requireStrengthModel(
      parameterResolution,
      "total-stress-undrained",
      method.method,
      interval.layer.id,
    );
    averageUnitResistance = cap(
      numeric(method, "adhesionFactor") *
        Number(parameterResolution.parameterSet.strength.undrainedShearStrength),
      nullableNumeric(method, "maximumUnitResistance"),
    );
    resistance = averageUnitResistance * sideArea;
  } else if (method.method === "effective-stress") {
    requireStrengthModel(
      parameterResolution,
      "mohr-coulomb-effective",
      method.method,
      interval.layer.id,
    );
    const calculated = calculateEffectiveStressShaft({
      interval,
      method,
      stressProfile,
      shaftPerimeter,
    });
    resistance = calculated.resistance;
    subsegments = calculated.subsegments;
    averageUnitResistance = resistance / sideArea;
  } else {
    averageUnitResistance = cap(
      numeric(method, "assignedUnitResistance"),
      nullableNumeric(method, "maximumUnitResistance"),
    );
    resistance = averageUnitResistance * sideArea;
  }
  return {
    layerId: interval.layer.id,
    materialId: interval.layer.materialId,
    topElevation: interval.topElevation,
    bottomElevation: interval.bottomElevation,
    length,
    shaftPerimeter,
    sideArea,
    method: structuredClone(method),
    parameterResolution,
    averageUnitResistance,
    resistance,
    subsegments,
  };
}

function toeLayer(
  profile: GroundProfile,
  bearingLayerId: unknown,
  toeElevation: number,
): GroundLayer {
  const layer = profile.layers.find(({ id }) => id === bearingLayerId);
  if (!layer) {
    throw new Error(`Unknown base bearing layer: ${String(bearingLayerId)}.`);
  }
  const isAtOrBelowTop = toeElevation <= layer.topElevation + TOLERANCE;
  const isAboveBottom = toeElevation > layer.bottomElevation + TOLERANCE;
  if (!isAtOrBelowTop || !isAboveBottom) {
    throw new Error(
      `Pile toe elevation ${toeElevation} is not in bearing layer ${layer.id}; at an interface select the layer below the toe explicitly.`,
    );
  }
  return layer;
}

function calculateBase({
  profile,
  groundModel,
  designSituation,
  pile,
  method,
  stressProfile,
}: {
  profile: GroundProfile;
  groundModel: GroundModel;
  designSituation: GeotechnicalDesignSituation;
  pile: DeepFoundationModel;
  method: SoilRecord;
  stressProfile: VerticalStressProfile;
}): SoilRecord {
  const layer = toeLayer(profile, method.bearingLayerId, pile.placement.toeElevation);
  const parameterResolution = resolveLayerParameters(designSituation, groundModel, layer);
  const toeStress = stressProfile.evaluate(pile.placement.toeElevation);
  let unitResistance: number;
  if (method.method === "undrained-nc") {
    requireStrengthModel(parameterResolution, "total-stress-undrained", method.method, layer.id);
    unitResistance =
      numeric(method, "bearingCapacityFactor") *
      Number(parameterResolution.parameterSet.strength.undrainedShearStrength);
  } else if (method.method === "effective-stress-nq") {
    requireStrengthModel(parameterResolution, "mohr-coulomb-effective", method.method, layer.id);
    unitResistance =
      numeric(method, "bearingCapacityFactor") *
      Math.min(
        Math.max(toeStress.effectiveVerticalStress, 0),
        nullableNumeric(method, "maximumEffectiveVerticalStress") ?? Infinity,
      );
  } else {
    unitResistance = numeric(method, "assignedUnitResistance");
  }
  unitResistance = cap(unitResistance, nullableNumeric(method, "maximumUnitResistance"));
  return {
    status: "included",
    layerId: layer.id,
    materialId: layer.materialId,
    toeElevation: pile.placement.toeElevation,
    baseArea: pile.geometry.baseArea,
    method: structuredClone(method),
    parameterResolution,
    stressAtToe: toeStress,
    unitResistance,
    resistance: unitResistance * pile.geometry.baseArea,
  };
}

function layerBoundaryAssessment(profile: GroundProfile, pile: DeepFoundationModel): SoilRecord {
  const influenceDistance = Math.max(
    USACE_LAYER_PROXIMITY_MINIMUM,
    8 * pile.geometry.equivalentDiameter,
  );
  const boundaries = profile.layers
    .slice(1)
    .map((layer) => ({
      elevation: layer.topElevation,
      distanceFromToe: Math.abs(layer.topElevation - pile.placement.toeElevation),
      lowerLayerId: layer.id,
    }))
    .sort((left, right) => left.distanceFromToe - right.distanceFromToe);
  const nearby = boundaries.filter(
    ({ distanceFromToe }) => distanceFromToe <= influenceDistance + TOLERANCE,
  );
  return {
    status: nearby.length > 0 ? "review-required" : "no-boundary-in-screening-zone",
    influenceDistance,
    criterion:
      "screen for dissimilar layers within max(1.524 m, 8 equivalent diameters); no automatic resistance reduction",
    nearbyBoundaries: nearby,
  };
}

function capacityConversion({
  scenario,
  shaftResistance,
  baseResistance,
}: {
  scenario: AxialPileLoadScenario;
  shaftResistance: number;
  baseResistance: number;
}): SoilRecord {
  const conversion = scenario.resistanceConversion;
  if (conversion == null) {
    return {
      status: "not-performed",
      calculatedUltimateResistance: shaftResistance + baseResistance,
      convertedResistance: null,
      reason: "No explicit resistance conversion was supplied; no design resistance is inferred.",
    };
  }
  const convertedShaft = shaftResistance / numeric(conversion, "shaftDivisor");
  const convertedBase =
    scenario.direction === "compression" ? baseResistance / numeric(conversion, "baseDivisor") : 0;
  return {
    status: "performed",
    model: conversion.model,
    calculatedUltimateResistance: shaftResistance + baseResistance,
    convertedShaftResistance: convertedShaft,
    convertedBaseResistance: convertedBase,
    convertedResistance: (convertedShaft + convertedBase) / numeric(conversion, "overallDivisor"),
    conversion: structuredClone(conversion),
  };
}

export class AxialPileCapacityAnalysis {
  analyze(input: AxialPileCapacityAnalysisInput = {}): AxialPileCapacityAnalysisResult {
    try {
      const { groundModel: groundModelInput, designSituation: designSituationInput } = input;
      const { pile: pileInput, scenario: scenarioInput, profileId = null, units = null } = input;
      const explicitUnits = assertExplicitUnitSystem(units, "AxialPileCapacityAnalysis");
      const groundModel = normalizeGroundModel(groundModelInput, explicitUnits);
      const designSituation = normalizeDesignSituation(
        designSituationInput,
        groundModel,
        explicitUnits,
      );
      designSituation.validateAgainst(groundModel);
      if (designSituation.limitState !== "ULS") {
        return result({
          status: "not-supported",
          summary: "Axial pile capacity requires limitState=ULS.",
          outputs: {},
          warnings: [],
          assumptions: [],
          metadata: {},
        });
      }
      if (designSituation.seismic.model !== "none") {
        return result({
          status: "not-supported",
          summary: "Seismic axial pile capacity is not implemented in this static solver.",
          outputs: {},
          warnings: [],
          assumptions: [],
          metadata: {},
        });
      }
      const pile = normalizePile(pileInput, explicitUnits);
      const scenario = normalizeScenario(scenarioInput, explicitUnits);
      const profile = groundModel.getProfile(
        profileId ?? designSituation.spatialSelection.profileId,
      );
      if (!profile) {
        return result({
          status: "not-supported",
          summary: "A GroundProfile is required for axial pile capacity.",
          outputs: {},
          warnings: [],
          assumptions: [],
          metadata: {},
        });
      }
      if (pile.placement.soilContactTopElevation > profile.groundSurfaceElevation + TOLERANCE) {
        throw new Error("Pile soilContactTopElevation cannot be above the GroundProfile surface.");
      }
      if (
        pile.placement.toeElevation <= profile.bottomElevation + TOLERANCE ||
        pile.placement.soilContactTopElevation > profile.groundSurfaceElevation + TOLERANCE
      ) {
        throw new Error(
          "The GroundProfile must contain the complete soil-contact shaft and extend below the pile toe.",
        );
      }
      const intervals = shaftLayerIntervals(
        profile,
        pile.placement.soilContactTopElevation,
        pile.placement.toeElevation,
      );
      if (intervals.length === 0) {
        throw new Error("No GroundProfile layer intersects the pile shaft.");
      }
      const stressProfile = new VerticalStressProfile({
        profile,
        surcharge: scenario.surfaceSurcharge,
      });
      const shaftContributions = intervals.map((interval) => {
        const method = scenario.shaftResistanceByLayer[interval.layer.id];
        if (!method) {
          throw new Error(
            `Missing shaft-resistance definition for intersected layer ${interval.layer.id}.`,
          );
        }
        return calculateShaftLayer({
          interval,
          method,
          parameterResolution: resolveLayerParameters(designSituation, groundModel, interval.layer),
          stressProfile,
          shaftPerimeter: pile.geometry.shaftPerimeter,
        });
      });
      const shaftResistance = shaftContributions.reduce(
        (sum, contribution) => sum + Number(contribution.resistance),
        0,
      );
      const base: SoilRecord =
        scenario.direction === "compression"
          ? calculateBase({
              profile,
              groundModel,
              designSituation,
              pile,
              method: scenario.baseResistance as SoilRecord,
              stressProfile,
            })
          : {
              status: "not-included",
              reason: "Pile tip resistance is excluded from tension capacity.",
              resistance: 0,
            };
      const boundaryAssessment: SoilRecord =
        scenario.direction === "compression"
          ? layerBoundaryAssessment(profile, pile)
          : {
              status: "not-applicable",
              reason: "Pile tip resistance is excluded from the selected tension capacity.",
              influenceDistance: null,
              nearbyBoundaries: [],
            };
      const conversion = capacityConversion({
        scenario,
        shaftResistance,
        baseResistance: Number(base.resistance),
      });
      const demand = scenario.action?.axialForce ?? null;
      const convertedResistance = conversion.convertedResistance;
      const verification: SoilRecord =
        demand == null
          ? {
              status: "not-performed",
              reason: "No pile-head axial action was supplied.",
              demand: null,
              capacity: convertedResistance,
              utilizationRatio: null,
            }
          : conversion.status !== "performed"
            ? {
                status: "not-performed",
                reason:
                  "An action was supplied, but design verification requires an explicit resistance conversion.",
                demand,
                capacity: null,
                utilizationRatio: null,
                calculatedUltimateCapacityRatio:
                  Number(demand) / Number(conversion.calculatedUltimateResistance),
              }
            : {
                status:
                  Number(demand) <= Number(convertedResistance) + TOLERANCE ? "ok" : "not-verified",
                demand,
                capacity: convertedResistance,
                utilizationRatio: Number(demand) / Number(convertedResistance),
                ok: Number(demand) <= Number(convertedResistance) + TOLERANCE,
              };
      const status = verification.status === "not-verified" ? "not-verified" : "ok";
      const warnings = [
        ...(scenario.resistanceConversion == null
          ? [
              "No normative or project resistance conversion is implicit; the reported total is a calculated ultimate resistance only.",
            ]
          : []),
        ...(scenario.action != null && !scenario.action.includesPileSelfWeight
          ? [
              "The pile-head action does not declare pile self-weight as included; self-weight is not added by this geotechnical solver.",
            ]
          : []),
        ...(boundaryAssessment.status === "review-required"
          ? [
              "A material boundary lies in the USACE toe screening zone; its influence on base resistance must be assessed by the selected method or reflected in assigned coefficients.",
            ]
          : []),
        "Peak shaft resistance compatibility between different layers is not solved; layer contributions are summed from the supplied method coefficients.",
      ];

      return result({
        status,
        summary:
          status === "not-verified"
            ? "Axial pile capacity was calculated, but the explicit design check is not verified."
            : "Single vertical pile axial capacity analysis completed.",
        outputs: {
          schemaVersion: AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION,
          groundModelId: groundModel.id,
          designSituationId: designSituation.id,
          profileId: profile.id,
          pile: pile.toJSON(),
          scenario: scenario.toJSON(),
          shaft: { resistance: shaftResistance, contributions: shaftContributions },
          base,
          capacity: {
            direction: scenario.direction,
            calculatedUltimateShaftResistance: shaftResistance,
            calculatedUltimateBaseResistance: base.resistance,
            calculatedUltimateResistance: conversion.calculatedUltimateResistance,
            convertedResistance: conversion.convertedResistance,
            conversion,
          },
          demand:
            scenario.action == null
              ? null
              : {
                  axialForce: scenario.action.axialForce,
                  direction: scenario.direction,
                  referencePoint: scenario.action.referencePoint,
                  basis: scenario.action.basis,
                },
          verification,
          checks:
            verification.status === "not-performed"
              ? []
              : [
                  {
                    id: "axial-geotechnical-resistance",
                    demand: verification.demand,
                    capacity: verification.capacity,
                    utilizationRatio: verification.utilizationRatio,
                    ok: verification.ok,
                  },
                ],
          utilizationRatio: verification.utilizationRatio,
          toeLayerBoundaryAssessment: boundaryAssessment,
          structuralCoupling: {
            level: "single-pile-capacity-mode",
            pileId: pile.id,
            actionReferencePoint: "pile-head",
            capacityMode: {
              status: "available",
              direction: scenario.direction,
              calculatedUltimateResistance: conversion.calculatedUltimateResistance,
              convertedResistance: conversion.convertedResistance,
            },
            responseMode: {
              status: "not-implemented",
              reason:
                "Axial t-z and q-z transfer laws require a separately sourced and validated response model.",
            },
            pileGroupTransfer: {
              status: "not-implemented",
              reason:
                "Pile-cap load distribution, group efficiency and pile interaction are outside the single-pile increment.",
            },
            structuralVerification: {
              status: "not-analyzed",
              reason:
                "Structural resistance of the pile section is checked by a structural module using pile actions.",
            },
          },
        },
        warnings,
        assumptions: [
          "The pile is single, vertical and has constant shaft perimeter and base area.",
          "Shaft resistance is integrated independently over each intersected GroundProfile layer.",
          "Effective-stress shaft resistance uses beta times effective vertical stress; beta may be assigned directly or resolved as K tan(delta).",
          "Undrained shaft resistance uses alpha times undrained shear strength.",
          "Compression capacity is shaft plus tip resistance; tension capacity contains shaft resistance only.",
          "Groundwater is hydrostatic as represented by GroundProfile and affects effective vertical stress.",
          "Negative skin friction, settlement, cyclic degradation, pile groups, inclined piles and seismic effects are excluded.",
        ],
        metadata: withNormativeReferences(
          {
            references: [AXIAL_PILE_CAPACITY_REFERENCE],
            sourceUrl:
              "https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2906.pdf",
            designSituation: designSituation.toJSON(),
            units: {
              force: GEOTECHNICAL_INTERNAL_UNITS.force,
              length: GEOTECHNICAL_INTERNAL_UNITS.length,
              stress: "kN/m2",
            },
          },
          [GEOTECHNICAL_EXTERNAL_REFERENCES.axialPileCapacityUsace],
        ),
      });
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error(String(error));
      return result({
        status: "failed",
        summary: "Axial pile capacity analysis failed.",
        outputs: {},
        warnings: [resolvedError.message],
        assumptions: [],
        metadata: { errorName: resolvedError.name },
      });
    }
  }
}
