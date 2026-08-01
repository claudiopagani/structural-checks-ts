import {
  VerificationResult,
  type VerificationCheck,
} from "../../core/results/VerificationResult.js";
import { governingCheck, round } from "../../core/results/checkUtils.js";
import { RESULT_STATUS, type ResultStatus } from "../../core/results/resultStatus.js";
import {
  RectangularFootingContactAnalysis,
  integrateFootingPressurePolygon,
  integrateFootingPressureStrip,
  type RectangularFootingContactResult,
} from "../../domain/foundations/index.js";
import { RectangularSection } from "../../domain/geometry/RectangularSection.js";
import { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import { ReinforcementBar } from "../../domain/reinforcement/ReinforcementBar.js";
import { PunchingActionState, PunchingConnectionModel } from "../../domain/slabs/punching/index.js";
import {
  PunchingVerificationRequest,
  type PunchingVerificationRequestOptions,
  verifyPunching,
} from "../reinforced-concrete-punching/index.js";
import { ReinforcedConcreteSectionVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteSectionVerification.js";
import { ReinforcedConcreteShearVerification } from "../reinforced-concrete-sections/checks/ReinforcedConcreteShearVerification.js";
import { ReinforcedConcreteSectionModel } from "../reinforced-concrete-sections/models/ReinforcedConcreteSectionModel.js";
import {
  calculateEn1992AnchorageLength,
  calculateEn1992DesignBondStrength,
  calculateEn1992LocalBearingResistance,
} from "../../norms/en1992/reinforced-concrete/index.js";
import { EN1992_RC_EXTERNAL_REFERENCES } from "../../norms/en1992/normativeReferences.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import {
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../../norms/ntc2018/normativeReferences.js";
import type {
  NormalizedFootingAnchorage,
  ReinforcedConcreteIsolatedFootingModel,
} from "./ReinforcedConcreteIsolatedFootingModel.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" } as const);
const UNIT_WIDTH = 1000;
const PUNCHING_2004 = "EN1992_1_1_2004_A1_2014";
const FOOTING_NORMATIVE_REFERENCES = Object.freeze([
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign,
  NTC2018_RC_CHAPTER_4_REFERENCES.flexureAndAxialForce,
  NTC2018_RC_CHAPTER_4_REFERENCES.shearWithoutTransverseReinforcement,
  NTC2018_RC_CHAPTER_4_REFERENCES.punching,
  NTC2018_RC_CHAPTER_4_REFERENCES.anchorage,
  EN1992_RC_EXTERNAL_REFERENCES.punching2004,
  EN1992_RC_EXTERNAL_REFERENCES.localBearing,
  EN1992_RC_EXTERNAL_REFERENCES.bondAndAnchorage,
]);

interface FootingCheck extends VerificationCheck {
  id: string;
  description: string;
  demand: number | null;
  capacity: number | null;
  utilizationRatio: number | null;
  ok: boolean;
  metadata: Record<string, unknown>;
}

type FootingDirection = "x" | "y";

interface StripCandidate extends Record<string, unknown> {
  side: "negative" | "positive";
  fixedCoordinate: number;
  columnFaceCoordinate: number;
  shearSectionCoordinate: number;
  edgeCoordinate: number;
  momentPerUnitWidth: number;
  signedMomentPerUnitWidth: number;
  shearPerUnitWidth: number;
  bending: ReturnType<typeof integrateFootingPressureStrip>;
  shear: ReturnType<typeof integrateFootingPressureStrip>;
}

interface DirectionDemand {
  direction: FootingDirection;
  candidates: StripCandidate[];
  bending: StripCandidate;
  shear: StripCandidate;
}

interface DirectionVerification {
  direction: FootingDirection;
  effectiveDepth: number;
  reinforcementAreaPerMeter: number;
  demand: DirectionDemand;
  mEd: number;
  vEd: number;
  bendingResult: VerificationResult;
  shearResult: ReturnType<ReinforcedConcreteShearVerification["verifySectionActions"]>;
  checks: FootingCheck[];
}

interface PunchingOutcome {
  applicable: boolean;
  status: ResultStatus;
  checks: VerificationCheck[];
  outputs: Record<string, unknown>;
  warnings: unknown[];
  assumptions: unknown[];
}

interface FootingVerificationOptions {
  code?: string;
  metadata?: Record<string, unknown>;
}

interface PunchingOptions {
  enabled?: boolean;
  code?: { id?: string } & Record<string, unknown>;
  contactIntegrationSegmentsPerCorner?: number;
  concreteAggregate?: (Record<string, unknown> & { lowerSize?: number }) | null;
}

function footingMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return withNormativeReferences(metadata, FOOTING_NORMATIVE_REFERENCES);
}

function totalVerticalForce(model: ReinforcedConcreteIsolatedFootingModel): number {
  return (
    model.actions.columnVerticalForce +
    model.actions.uniformDownwardPressure * model.geometry.widthX * model.geometry.widthY
  );
}

function polygonArea(points: ReadonlyArray<{ x: number; y: number }>): number {
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length] as { x: number; y: number };
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}

function createFootingStrip({
  model,
  direction,
}: {
  model: ReinforcedConcreteIsolatedFootingModel;
  direction: FootingDirection;
}) {
  const layer = model.reinforcement.bottom[direction];
  const concreteSection = new RectangularSection({
    id: `${model.id}-${direction}-footing-strip-concrete`,
    width: UNIT_WIDTH,
    height: model.geometry.thickness,
    units: INTERNAL_UNITS,
  });
  const reinforcementBar = new ReinforcementBar({
    id: `bottom-${direction}-equivalent-layer`,
    diameter: layer.diameter,
    area: layer.areaPerMeter,
    material: model.materials.reinforcementMaterial,
    y: layer.axisFromBottom,
    z: UNIT_WIDTH / 2,
    units: INTERNAL_UNITS,
    metadata: {
      equivalentDistributedArea: true,
      direction,
      spacing: layer.spacing,
      barsPerMeter: layer.barsPerMeter,
    },
  });
  const section = new ReinforcedConcreteSection({
    id: `${model.id}-${direction}-footing-strip`,
    concreteSection,
    reinforcementBars: [reinforcementBar],
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    units: INTERNAL_UNITS,
    metadata: {
      direction,
      unitWidth: UNIT_WIDTH,
      footingModelId: model.id,
    },
  });

  return {
    section,
    layer,
    effectiveDepth: model.geometry.thickness - layer.axisFromBottom,
  };
}

function criticalStripDemand({
  model,
  contact,
  direction,
  effectiveDepth,
}: {
  model: ReinforcedConcreteIsolatedFootingModel;
  contact: RectangularFootingContactResult;
  direction: FootingDirection;
  effectiveDepth: number;
}): DirectionDemand {
  const dimension = model.geometry[direction === "x" ? "widthX" : "widthY"];
  const transverseDimension = model.geometry[direction === "x" ? "widthY" : "widthX"];
  const columnDimension = model.column[direction === "x" ? "widthX" : "widthY"];
  const fixedCoordinates = [-transverseDimension / 2, 0, transverseDimension / 2];
  const candidates: StripCandidate[] = [];

  for (const side of [-1, 1] as const) {
    const face = (side * columnDimension) / 2;
    const edge = (side * dimension) / 2;
    const shearSection = face + side * effectiveDepth;

    for (const fixedCoordinate of fixedCoordinates) {
      const bending = integrateFootingPressureStrip({
        contact,
        axis: direction,
        from: face,
        to: edge,
        fixedCoordinate,
        momentOrigin: face,
        uniformDownwardPressure: model.actions.uniformDownwardPressure,
      });
      const shear: ReturnType<typeof integrateFootingPressureStrip> =
        Math.abs(shearSection) >= dimension / 2
          ? ({ soilForce: 0, downwardForce: 0, netForce: 0 } as ReturnType<
              typeof integrateFootingPressureStrip
            >)
          : integrateFootingPressureStrip({
              contact,
              axis: direction,
              from: shearSection,
              to: edge,
              fixedCoordinate,
              uniformDownwardPressure: model.actions.uniformDownwardPressure,
            });
      const bendingMoment = Number(bending.netMoment);

      candidates.push({
        side: side < 0 ? "negative" : "positive",
        fixedCoordinate,
        columnFaceCoordinate: face,
        shearSectionCoordinate: shearSection,
        edgeCoordinate: edge,
        momentPerUnitWidth: Math.abs(bendingMoment),
        signedMomentPerUnitWidth: side * bendingMoment,
        shearPerUnitWidth: Math.abs(shear.netForce),
        bending,
        shear,
      });
    }
  }

  const bending = candidates.reduce<StripCandidate | null>(
    (selected, candidate) =>
      selected == null || candidate.momentPerUnitWidth > selected.momentPerUnitWidth
        ? candidate
        : selected,
    null,
  );
  const shear = candidates.reduce<StripCandidate | null>(
    (selected, candidate) =>
      selected == null || candidate.shearPerUnitWidth > selected.shearPerUnitWidth
        ? candidate
        : selected,
    null,
  );
  if (!bending || !shear) {
    throw new Error(`No ${direction}-direction footing strip demand candidates were generated.`);
  }

  return { direction, candidates, bending, shear };
}

function asFootingCheck(
  check: VerificationCheck | undefined,
  overrides: Omit<FootingCheck, "metadata"> & { metadata: Record<string, unknown> },
): FootingCheck {
  return { ...check, ...overrides } as FootingCheck;
}

function verifyDirection({
  model,
  contact,
  direction,
}: {
  model: ReinforcedConcreteIsolatedFootingModel;
  contact: RectangularFootingContactResult;
  direction: FootingDirection;
}): DirectionVerification {
  const strip = createFootingStrip({ model, direction });
  const demand = criticalStripDemand({
    model,
    contact,
    direction,
    effectiveDepth: strip.effectiveDepth,
  });
  const mEd = demand.bending.momentPerUnitWidth * UNIT_WIDTH;
  const vEd = demand.shear.shearPerUnitWidth * UNIT_WIDTH;
  const sectionModel = new ReinforcedConcreteSectionModel({
    id: `${model.id}-${direction}-footing-bending`,
    section: strip.section,
    materials: model.materials,
    analysisType: "uls-uniaxial-resistance",
    analysisSettings: { compressedEdge: "top" },
    mesh: model.mesh,
    solver: model.solver,
    actions: { nEd: 0, mEd },
    units: INTERNAL_UNITS,
  });
  const bendingResult = new ReinforcedConcreteSectionVerification().verify(sectionModel);
  const sourceBendingCheck = bendingResult.checks[0];
  const bendingCheck = asFootingCheck(sourceBendingCheck, {
    id: `rc-footing-bending-${direction}`,
    description: `Footing bottom reinforcement bending resistance in ${direction.toUpperCase()}`,
    demand: sourceBendingCheck?.demand ?? null,
    capacity: sourceBendingCheck?.capacity ?? null,
    utilizationRatio: sourceBendingCheck?.utilizationRatio ?? null,
    ok: sourceBendingCheck?.ok === true,
    metadata: {
      ...((sourceBendingCheck?.metadata as Record<string, unknown> | undefined) ?? {}),
      method: "cantilever-unit-strip-from-contact-pressure",
      direction,
      unitWidth: UNIT_WIDTH,
      criticalPosition: demand.bending,
    },
  });
  const shearResult = new ReinforcedConcreteShearVerification().verifySectionActions({
    nEd: 0,
    vEd,
    mEd,
    section: strip.section,
    concreteMaterial: model.materials.concreteMaterial,
    reinforcementMaterial: model.materials.reinforcementMaterial,
    shear: {
      mode: "without-transverse-reinforcement",
      bw: UNIT_WIDTH,
      effectiveDepth: strip.effectiveDepth,
      longitudinalReinforcementArea: strip.layer.areaPerMeter,
      tensionFace: "bottom",
    },
    units: INTERNAL_UNITS,
  });
  const sourceShearCheck = shearResult.checks[0];
  const shearCheck = asFootingCheck(sourceShearCheck, {
    id: `rc-footing-one-way-shear-${direction}`,
    description: `Footing one-way shear resistance in ${direction.toUpperCase()}`,
    demand: sourceShearCheck?.demand ?? null,
    capacity: sourceShearCheck?.capacity ?? null,
    utilizationRatio: sourceShearCheck?.utilizationRatio ?? null,
    ok: sourceShearCheck?.ok === true,
    metadata: {
      ...((sourceShearCheck?.metadata as Record<string, unknown> | undefined) ?? {}),
      method: "cantilever-unit-strip-at-effective-depth",
      direction,
      unitWidth: UNIT_WIDTH,
      criticalPosition: demand.shear,
    },
  });

  return {
    direction,
    effectiveDepth: strip.effectiveDepth,
    reinforcementAreaPerMeter: strip.layer.areaPerMeter,
    demand,
    mEd,
    vEd,
    bendingResult,
    shearResult,
    checks: [bendingCheck, shearCheck],
  };
}

function punchingPerimeterFits(
  model: ReinforcedConcreteIsolatedFootingModel,
  effectiveDepth: number,
): boolean {
  return (
    model.column.widthX + 4 * effectiveDepth <= model.geometry.widthX + 1e-9 &&
    model.column.widthY + 4 * effectiveDepth <= model.geometry.widthY + 1e-9
  );
}

function roundedRectanglePolygon(
  width: number,
  height: number,
  offset: number,
  segmentsPerCorner = 16,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const corners = [
    { x: width / 2, y: -height / 2, start: -Math.PI / 2 },
    { x: width / 2, y: height / 2, start: 0 },
    { x: -width / 2, y: height / 2, start: Math.PI / 2 },
    { x: -width / 2, y: -height / 2, start: Math.PI },
  ];

  for (const corner of corners) {
    for (let index = 0; index <= segmentsPerCorner; index += 1) {
      const angle = corner.start + (Math.PI / 2) * (index / segmentsPerCorner);
      points.push({
        x: corner.x + offset * Math.cos(angle),
        y: corner.y + offset * Math.sin(angle),
      });
    }
  }
  return points;
}

function verifyPunchingForFooting({
  model,
  contact,
  directions,
}: {
  model: ReinforcedConcreteIsolatedFootingModel;
  contact: RectangularFootingContactResult;
  directions: Record<FootingDirection, DirectionVerification>;
}): PunchingOutcome {
  const effectiveDepthX = directions.x.effectiveDepth;
  const effectiveDepthY = directions.y.effectiveDepth;
  const effectiveDepth = (effectiveDepthX + effectiveDepthY) / 2;
  const punching = model.punching as PunchingOptions;

  if (!punchingPerimeterFits(model, effectiveDepth)) {
    return {
      applicable: false,
      status: RESULT_STATUS.OK,
      checks: [
        {
          id: "rc-footing-punching-basic-perimeter-fit",
          description: "Basic punching control perimeter lies inside the footing",
          demand: round(
            Math.max(
              model.column.widthX + 4 * effectiveDepth,
              model.column.widthY + 4 * effectiveDepth,
            ),
          ),
          capacity: round(Math.max(model.geometry.widthX, model.geometry.widthY)),
          utilizationRatio: 0,
          ok: true,
          metadata: withNormativeReferences(
            {
              method: "EN1992-1-1-2004-control-perimeter-at-2d",
              nonApplicabilityReason:
                "The basic control perimeter at 2d reaches or crosses the footing boundary; one-way shear remains checked.",
            },
            [NTC2018_RC_CHAPTER_4_REFERENCES.punching, EN1992_RC_EXTERNAL_REFERENCES.punching2004],
          ),
        },
      ],
      outputs: { effectiveDepth, basicPerimeterInsideFooting: false },
      warnings: [],
      assumptions: [
        "Punching is treated as non-applicable when the complete basic perimeter at 2d cannot develop inside the isolated footing.",
      ],
    };
  }

  if (punching.enabled === false) {
    return {
      applicable: true,
      status: RESULT_STATUS.NOT_ANALYZED,
      checks: [],
      outputs: { effectiveDepth, basicPerimeterInsideFooting: true },
      warnings: ["Punching applies geometrically but was explicitly disabled."],
      assumptions: [],
    };
  }
  if (punching.code?.id !== PUNCHING_2004) {
    return {
      applicable: true,
      status: RESULT_STATUS.NOT_SUPPORTED,
      checks: [],
      outputs: { effectiveDepth, basicPerimeterInsideFooting: true },
      warnings: [
        "The first footing integration requires an explicit EN 1992-1-1:2004+A1:2014 punching code selection; other generations need a dedicated footing-demand integration.",
      ],
      assumptions: [],
    };
  }

  const offset = 2 * effectiveDepth;
  const perimeterPolygon = roundedRectanglePolygon(
    model.column.widthX,
    model.column.widthY,
    offset,
    punching.contactIntegrationSegmentsPerCorner ?? 24,
  );
  const enclosedContact = integrateFootingPressurePolygon({
    contact,
    polygon: perimeterPolygon,
  });
  const enclosedArea = polygonArea(perimeterPolygon);
  const enclosedContactArea = enclosedContact.area;
  const enclosedSoilForce = enclosedContact.force;
  const enclosedDownwardForce = model.actions.uniformDownwardPressure * enclosedArea;
  const enclosedUpwardForce = Math.max(0, enclosedSoilForce - enclosedDownwardForce);
  const punchingForce = Math.max(0, model.actions.columnVerticalForce - enclosedUpwardForce);
  const connection = new PunchingConnectionModel({
    id: `${model.id}-footing-punching`,
    units: INTERNAL_UNITS,
    slab: {
      thickness: model.geometry.thickness,
      boundary: [
        { x: -model.geometry.widthX / 2, y: -model.geometry.widthY / 2 },
        { x: model.geometry.widthX / 2, y: -model.geometry.widthY / 2 },
        { x: model.geometry.widthX / 2, y: model.geometry.widthY / 2 },
        { x: -model.geometry.widthX / 2, y: model.geometry.widthY / 2 },
      ],
      openings: [],
      beams: [],
    },
    support: {
      id: `${model.id}-column`,
      kind: "column",
      position: "interior",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: model.column.widthX,
        sizeY: model.column.widthY,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck: model.materials.concreteMaterial.fck },
      concreteAggregate: punching.concreteAggregate ?? null,
    },
    reinforcement: {
      flexuralTension: {
        x: {
          effectiveDepth: effectiveDepthX,
          ratio: model.reinforcement.bottom.x.areaPerMeter / (UNIT_WIDTH * effectiveDepthX),
        },
        y: {
          effectiveDepth: effectiveDepthY,
          ratio: model.reinforcement.bottom.y.areaPerMeter / (UNIT_WIDTH * effectiveDepthY),
        },
        source: { method: "isolated-footing-bottom-reinforcement" },
      },
      punching: model.reinforcement.punching,
    },
  });
  const action = new PunchingActionState({
    id: `${model.id}-uls-punching`,
    connectionId: connection.id,
    localFrameId: connection.localFrame.id,
    combinationType: "ULS",
    units: INTERNAL_UNITS,
    components: {
      fz: model.actions.columnVerticalForce,
      mx: model.actions.momentX,
      my: model.actions.momentY,
    },
    punchingDemand: {
      punchingForce,
      lineOfAction: {
        x: model.actions.momentY / model.actions.columnVerticalForce,
        y: model.actions.momentX / model.actions.columnVerticalForce,
      },
      source: { method: "column-force-minus-enclosed-effective-soil-reaction" },
    },
    source: {
      method: "manual",
      reference: "isolated-footing-local-equilibrium",
    },
  });
  const result = verifyPunching(
    new PunchingVerificationRequest({
      id: `${model.id}-punching-request`,
      connection,
      actionStates: [action],
      code: punching.code as Exclude<PunchingVerificationRequestOptions["code"], undefined>,
    }),
  );

  return {
    applicable: true,
    status: result.status,
    checks: result.checks,
    outputs: {
      effectiveDepth,
      basicPerimeterInsideFooting: true,
      enclosedArea: round(enclosedArea),
      enclosedContactArea: round(enclosedContactArea),
      enclosedSoilForce: round(enclosedSoilForce),
      enclosedDownwardForce: round(enclosedDownwardForce),
      enclosedUpwardForce: round(enclosedUpwardForce),
      punchingForce: round(punchingForce),
      verification: result.toJSON(),
    },
    warnings: result.warnings,
    assumptions: [
      ...result.assumptions,
      "The effective soil reaction inside the 2d perimeter is integrated over the compression-only contact polygon; the rounded perimeter is discretized explicitly.",
    ],
  };
}

function verifyLocalBearing(model: ReinforcedConcreteIsolatedFootingModel) {
  const loadedArea = model.column.widthX * model.column.widthY;
  const distributionWidthX = Math.min(
    model.geometry.widthX,
    3 * model.column.widthX,
    model.column.widthX + model.geometry.thickness,
  );
  const distributionWidthY = Math.min(
    model.geometry.widthY,
    3 * model.column.widthY,
    model.column.widthY + model.geometry.thickness,
  );
  const distributionArea =
    model.localBearing.distributionArea ?? distributionWidthX * distributionWidthY;
  const fcd = Number(model.materials.concreteMaterial.fcd);
  const bearing = calculateEn1992LocalBearingResistance({
    loadedArea,
    distributionArea,
    fcd,
    resistanceReductionFactor: model.localBearing.resistanceReductionFactor,
  });
  const eccentric =
    Math.abs(model.actions.momentX) > 1e-9 ||
    Math.abs(model.actions.momentY) > 1e-9 ||
    Math.hypot(model.actions.horizontalX, model.actions.horizontalY) > 1e-9;
  const maximumInterfacePressure =
    model.actions.columnVerticalForce / loadedArea +
    (6 * Math.abs(model.actions.momentX)) / (model.column.widthX * model.column.widthY ** 2) +
    (6 * Math.abs(model.actions.momentY)) / (model.column.widthY * model.column.widthX ** 2);
  const reducedFcd = model.localBearing.resistanceReductionFactor * fcd;
  const check: FootingCheck = eccentric
    ? {
        id: "rc-footing-column-interface-crushing",
        description: "Conservative local crushing at eccentric column-footing interface",
        demand: round(maximumInterfacePressure),
        capacity: round(reducedFcd),
        utilizationRatio: round(maximumInterfacePressure / reducedFcd),
        ok: maximumInterfacePressure <= reducedFcd,
        metadata: withNormativeReferences(
          {
            method: "nonuniform-interface-peak-stress-no-dispersion-enhancement",
            reference: "EN1992-1-1:2004-6.7(3)",
          },
          [EN1992_RC_EXTERNAL_REFERENCES.localBearing],
        ),
      }
    : {
        id: "rc-footing-column-interface-crushing",
        description: "Local concrete bearing at column-footing interface",
        demand: round(model.actions.columnVerticalForce),
        capacity: round(bearing.resistance),
        utilizationRatio: round(model.actions.columnVerticalForce / bearing.resistance),
        ok: model.actions.columnVerticalForce <= bearing.resistance,
        metadata: withNormativeReferences({ ...bearing, loadedArea, distributionArea }, [
          EN1992_RC_EXTERNAL_REFERENCES.localBearing,
        ]),
      };

  return {
    check,
    outputs: {
      loadedArea,
      distributionArea,
      distributionWidthX,
      distributionWidthY,
      maximumInterfacePressure,
      eccentric,
      ...bearing,
    },
    warnings:
      bearing.enhancement > 1
        ? [
            "Local-bearing enhancement requires transverse splitting forces to be carried by the footing reinforcement or a justified local strut-and-tie model.",
          ]
        : [],
  };
}

function optionalAnchorNumber(anchor: NormalizedFootingAnchorage, key: string, fallback: number) {
  const value = anchor[key];
  return value == null ? fallback : Number(value);
}

function verifyFootingAnchorages(model: ReinforcedConcreteIsolatedFootingModel): FootingCheck[] {
  const fctd =
    (0.7 * Number(model.materials.concreteMaterial.fctm)) /
    Number(model.materials.concreteMaterial.metadata.gammaC);
  const fyd = Number(model.materials.reinforcementMaterial.fyd);
  const anchors: Array<[string, NormalizedFootingAnchorage]> = [
    ["column-bars", model.anchorage.columnBars],
    ["footing-bars-x", model.anchorage.footingBars.x],
    ["footing-bars-y", model.anchorage.footingBars.y],
  ].filter((entry): entry is [string, NormalizedFootingAnchorage] => entry[1] != null);

  return anchors.map(([id, anchor]) => {
    const bond = calculateEn1992DesignBondStrength({
      fctd: anchor.fctd ?? fctd,
      barDiameter: anchor.diameter,
      bondConditionFactor: optionalAnchorNumber(anchor, "bondConditionFactor", 1),
    });
    const required = calculateEn1992AnchorageLength({
      barDiameter: anchor.diameter,
      designSteelStress: anchor.designSteelStress ?? fyd,
      fbd: bond.fbd,
      tension: anchor.tension !== false,
      alpha1: optionalAnchorNumber(anchor, "alpha1", 1),
      alpha2: optionalAnchorNumber(anchor, "alpha2", 1),
      alpha3: optionalAnchorNumber(anchor, "alpha3", 1),
      alpha4: optionalAnchorNumber(anchor, "alpha4", 1),
      alpha5: optionalAnchorNumber(anchor, "alpha5", 1),
      nationalMinimumDiameterMultiple: 20,
      nationalMinimumLength: 150,
    });

    return {
      id: `rc-footing-anchorage-${id}`,
      description: `Anchorage of ${id.replaceAll("-", " ")}`,
      demand: round(required.designLength),
      capacity: round(anchor.availableLength),
      utilizationRatio: round(required.designLength / anchor.availableLength),
      ok: required.designLength <= anchor.availableLength,
      metadata: withNormativeReferences({ ...required, fbd: round(bond.fbd) }, [
        NTC2018_RC_CHAPTER_4_REFERENCES.anchorage,
        EN1992_RC_EXTERNAL_REFERENCES.bondAndAnchorage,
      ]),
    };
  });
}

export class ReinforcedConcreteIsolatedFootingVerification {
  code: string;
  metadata: Record<string, unknown>;

  constructor({ code = "NTC2018", metadata = {} }: FootingVerificationOptions = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model: ReinforcedConcreteIsolatedFootingModel): VerificationResult {
    const nEd = totalVerticalForce(model);
    const contact = new RectangularFootingContactAnalysis().analyze({
      widthX: model.geometry.widthX,
      widthY: model.geometry.widthY,
      nEd,
      mxEd: model.actions.momentX,
      myEd: model.actions.momentY,
    });
    const equilibriumUtilization = contact.equilibriumUtilization ?? Number.NaN;
    const contactCheck: FootingCheck = {
      id: "rc-footing-compressive-equilibrium",
      description: "Compressive soil-contact equilibrium inside the footing footprint",
      demand: round(equilibriumUtilization),
      capacity: 1,
      utilizationRatio: round(equilibriumUtilization),
      ok: contact.status !== "no-compressive-equilibrium",
      metadata: withNormativeReferences(
        {
          contactType: contact.contactType,
          reference: "rigid-rectangular-base-no-tension-contact",
        },
        [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign],
      ),
    };

    if (contact.status === "no-compressive-equilibrium") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_VERIFIED,
        summary: "The vertical resultant cannot be equilibrated by compressive footing contact.",
        checks: [contactCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "The resultant lies outside the footing footprint or no compressive vertical force is available.",
        ],
        assumptions: [
          "Soil contact has zero tensile strength and the footing base is treated as rigid for pressure distribution.",
        ],
        metadata: footingMetadata({ code: this.code, ...this.metadata }),
      });
    }
    if (contact.status === "not-supported") {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Biaxial partial contact requires a nonlinear compression-only contact solution.",
        checks: [contactCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "Elastic corner pressures detect uplift in biaxial bending, but they are not used as a design pressure after contact loss.",
        ],
        assumptions: [
          "No biaxial effective-area or rectangularized contact approximation is applied.",
        ],
        metadata: footingMetadata({ code: this.code, ...this.metadata }),
      });
    }

    const maximumPressure = Number(contact.maximumPressure);
    const bearingCheck: FootingCheck = {
      id: "rc-footing-bearing-pressure",
      description: "Maximum footing contact pressure against assigned design bearing resistance",
      demand: round(maximumPressure),
      capacity: round(model.soil.designBearingResistance),
      utilizationRatio: round(maximumPressure / model.soil.designBearingResistance),
      ok: maximumPressure <= model.soil.designBearingResistance,
      metadata: withNormativeReferences(
        {
          resistanceSource: model.soil.bearingResistanceSource,
          geotechnicalResistanceCalculatedByModule: false,
        },
        [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign],
      ),
    };
    const horizontalDemand = Math.hypot(model.actions.horizontalX, model.actions.horizontalY);
    const slidingResistance = model.soil.designSlidingResistance;
    const slidingMissing = horizontalDemand > 1e-9 && !Number.isFinite(slidingResistance);
    const slidingCheck: FootingCheck | null = slidingMissing
      ? null
      : {
          id: "rc-footing-sliding",
          description: "Horizontal action against assigned design sliding resistance",
          demand: round(horizontalDemand),
          capacity: round(slidingResistance),
          utilizationRatio: round(
            horizontalDemand === 0 ? 0 : horizontalDemand / Number(slidingResistance),
          ),
          ok: horizontalDemand === 0 || horizontalDemand <= Number(slidingResistance),
          metadata: withNormativeReferences(
            {
              resistanceSource: model.soil.slidingResistanceSource,
              geotechnicalResistanceCalculatedByModule: false,
            },
            [NTC2018_RC_OUTSIDE_CORPUS_REFERENCES.foundationDesign],
          ),
        };

    if (slidingMissing) {
      return new VerificationResult({
        applicationId: "reinforced-concrete-isolated-footings",
        status: RESULT_STATUS.NOT_SUPPORTED,
        summary: "Footing sliding resistance is missing for a non-zero horizontal action.",
        checks: [contactCheck, bearingCheck],
        outputs: { footingId: model.id, contact },
        warnings: [
          "Pass soil.designSlidingResistance from a justified geotechnical verification; the structural module does not derive it from an assumed friction coefficient.",
        ],
        assumptions: [],
        metadata: footingMetadata({ code: this.code, ...this.metadata }),
      });
    }

    const directions = Object.fromEntries(
      (["x", "y"] as const).map((direction) => [
        direction,
        verifyDirection({ model, contact, direction }),
      ]),
    ) as Record<FootingDirection, DirectionVerification>;
    const punching = verifyPunchingForFooting({ model, contact, directions });
    const localBearing = verifyLocalBearing(model);
    const anchorageChecks = verifyFootingAnchorages(model);
    const checks: FootingCheck[] = [
      contactCheck,
      bearingCheck,
      ...(slidingCheck ? [slidingCheck] : []),
      ...directions.x.checks,
      ...directions.y.checks,
      ...(punching.checks as FootingCheck[]),
      localBearing.check,
      ...anchorageChecks,
    ];
    const structuralStatuses: ResultStatus[] = [
      directions.x.bendingResult.status,
      directions.x.shearResult.status,
      directions.y.bendingResult.status,
      directions.y.shearResult.status,
      punching.status,
    ];
    const unsupported = structuralStatuses.some(
      (status) => status === RESULT_STATUS.NOT_SUPPORTED || status === RESULT_STATUS.NOT_ANALYZED,
    );
    const ok =
      checks.every((check) => check.ok === true) &&
      structuralStatuses.every((status) => status === RESULT_STATUS.OK);
    const governing = governingCheck(checks);

    return new VerificationResult({
      applicationId: "reinforced-concrete-isolated-footings",
      status: unsupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ok
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Isolated RC footing contact, assigned geotechnical resistance and local structural verification.",
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      utilizationRatio: governing?.utilizationRatio ?? null,
      checks,
      outputs: {
        footingId: model.id,
        totalVerticalForce: round(nEd),
        contact,
        directions: Object.fromEntries(
          Object.entries(directions).map(([direction, result]) => [
            direction,
            {
              effectiveDepth: round(result.effectiveDepth),
              reinforcementAreaPerMeter: round(result.reinforcementAreaPerMeter),
              mEd: round(result.mEd),
              vEd: round(result.vEd),
              demand: result.demand,
              bending: result.bendingResult.toJSON(),
              shear: result.shearResult,
            },
          ]),
        ),
        punching: punching.outputs,
        localBearing: localBearing.outputs,
        anchorage: { checkedCount: anchorageChecks.length },
      },
      warnings: [
        ...directions.x.bendingResult.warnings,
        ...directions.x.shearResult.warnings,
        ...directions.y.bendingResult.warnings,
        ...directions.y.shearResult.warnings,
        ...punching.warnings,
        ...localBearing.warnings,
        ...(anchorageChecks.length === 0
          ? [
              "Column and footing bar anchorage were not checked because no anchorage contracts were supplied.",
            ]
          : []),
        ...(model.soil.bearingResistanceSource == null
          ? [
              "The assigned design bearing resistance has no documented source in the input metadata.",
            ]
          : []),
      ],
      assumptions: [
        ...directions.x.bendingResult.assumptions,
        ...directions.x.shearResult.assumptions,
        ...directions.y.bendingResult.assumptions,
        ...directions.y.shearResult.assumptions,
        ...punching.assumptions,
        "The footing is rigid for contact analysis; structural strip actions and punching reaction are integrated from the compression-only pressure plane.",
        "The column is centered and unrotated, and all actions are reduced to the center of the footing base.",
        "The assigned bearing and sliding resistances already include the geotechnical design approach and partial factors selected by the responsible geotechnical verification.",
      ],
      metadata: footingMetadata({
        code: this.code,
        method: "rigid-rectangular-footing-compression-only-contact-plus-rc-checks",
        governingCheckId: governing?.id ?? null,
        geotechnicalCapacityCalculated: false,
        ...this.metadata,
      }),
    });
  }
}
