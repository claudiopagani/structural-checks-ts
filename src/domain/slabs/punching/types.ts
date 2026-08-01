import type { UnitSystem, UnitSystemInput } from "../../units/UnitSystem.js";

export interface PunchingPlanPoint {
  x: number;
  y: number;
}

export interface PunchingPoint3D extends PunchingPlanPoint {
  z: number;
}

export interface PunchingDirection3D {
  x: number;
  y: number;
  z: number;
}

export interface PunchingActionComponents {
  fz: number;
  mx: number;
  my: number;
}

export interface PunchingActionComponentsInput {
  fz?: number;
  mx?: number;
  my?: number;
  fx?: number;
  fy?: number;
  mz?: number;
}

export interface PunchingDemandInput {
  supportReaction?: number | null;
  punchingForce?: number | null;
  punchingForceByPerimeter?: Record<string, number | null>;
  enclosedLoadByPerimeter?: Record<string, number | null>;
  lineOfAction?: Partial<PunchingPlanPoint> | null;
  source?: Record<string, unknown>;
}

export interface PunchingDemand {
  supportReaction: number | null;
  punchingForce: number | null;
  punchingForceByPerimeter: Record<string, number | null>;
  enclosedLoadByPerimeter: Record<string, number | null>;
  lineOfAction: PunchingPlanPoint | null;
  source: Record<string, unknown>;
}

export interface PunchingActionSource extends Record<string, unknown> {
  method?: "manual" | "joint-equilibrium" | "integrated-contour";
}

export interface PunchingActionStateOptions {
  id?: string;
  connectionId?: string;
  localFrameId?: string | null;
  combinationType?: string | null;
  units?: UnitSystemInput | null;
  referencePoint?: Partial<PunchingPoint3D>;
  components?: PunchingActionComponentsInput;
  punchingDemand?: PunchingDemandInput | null;
  source?: PunchingActionSource | null;
  metadata?: Record<string, unknown>;
}

export interface PunchingActionStateJson {
  id: string;
  connectionId: string;
  localFrameId: string | null;
  schemaVersion: string;
  combinationType: string | null;
  units: UnitSystem;
  referencePoint: PunchingPoint3D;
  components: PunchingActionComponents;
  punchingDemand: PunchingDemand | null;
  source: PunchingActionSource;
  metadata: Record<string, unknown>;
}

export interface PunchingLineSegmentInput {
  type: "line";
  start?: Partial<PunchingPlanPoint>;
  end?: Partial<PunchingPlanPoint>;
}

export interface PunchingArcSegmentInput {
  type: "arc";
  center?: Partial<PunchingPlanPoint>;
  radius?: number;
  startAngle?: number;
  sweepAngle?: number;
}

export type PunchingSegmentInput = PunchingLineSegmentInput | PunchingArcSegmentInput;

export interface PunchingLineSegment {
  type: "line";
  start: PunchingPlanPoint;
  end: PunchingPlanPoint;
  length: number;
}

export interface PunchingArcSegment {
  type: "arc";
  center: PunchingPlanPoint;
  radius: number;
  startAngle: number;
  sweepAngle: number;
  length: number;
}

export type PunchingSegment = PunchingLineSegment | PunchingArcSegment;

export interface PunchingPerimeterComponentInput {
  closed?: boolean;
  segments?: PunchingSegmentInput[];
}

export interface PunchingPerimeterComponent {
  closed: boolean;
  segments: PunchingSegment[];
}

export interface PunchingControlPerimeterProperties {
  length: number;
  lineCentroid: PunchingPlanPoint;
  componentCount: number;
  segmentCount: number;
}

export interface PunchingControlPerimeterOptions {
  id?: string;
  codeId?: string;
  role?: string;
  position?: string;
  offset?: number;
  units?: UnitSystemInput | null;
  components?: PunchingPerimeterComponentInput[];
  source?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PunchingControlPerimeterJson {
  id: string;
  schemaVersion: string;
  codeId: string;
  role: string;
  position: string;
  offset: number;
  units: UnitSystem;
  components: PunchingPerimeterComponent[];
  properties: PunchingControlPerimeterProperties;
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface PunchingJointContributorInput {
  id?: string;
  kind?: string;
  side?: string | null;
  referencePoint?: Partial<PunchingPoint3D>;
  components?: PunchingActionComponentsInput;
  metadata?: Record<string, unknown>;
}

export interface PunchingJointContributor {
  id: string;
  kind: string;
  side: string | null;
  referencePoint: PunchingPoint3D;
  components: PunchingActionComponents;
  reducedComponents: PunchingActionComponents;
  metadata: Record<string, unknown>;
}

export interface ResolvePunchingTransferOptions {
  id?: string;
  connectionId?: string;
  localFrameId?: string | null;
  combinationType?: string | null;
  units?: UnitSystemInput | null;
  referencePoint?: Partial<PunchingPoint3D>;
  contributors?: PunchingJointContributorInput[];
  metadata?: Record<string, unknown>;
}

export type PunchingSupportPosition = "interior" | "edge" | "corner";

export interface PunchingLocalFrameInput {
  id?: string;
  origin?: Partial<PunchingPoint3D>;
  xAxis?: Partial<PunchingDirection3D>;
  yAxis?: Partial<PunchingDirection3D>;
  zAxis?: Partial<PunchingDirection3D>;
}

export interface PunchingLocalFrame {
  id: string;
  origin: PunchingPoint3D;
  xAxis: PunchingDirection3D;
  yAxis: PunchingDirection3D;
  zAxis: PunchingDirection3D;
}

export interface PunchingSlabOpeningInput {
  id?: string;
  boundary?: Array<Partial<PunchingPlanPoint>>;
}

export interface PunchingSlabOpening {
  id: string;
  boundary: PunchingPlanPoint[];
}

export interface PunchingSlabInput {
  thickness?: number;
  boundary?: Array<Partial<PunchingPlanPoint>>;
  openings?: PunchingSlabOpeningInput[];
  beams?: unknown[];
}

export interface PunchingSlab {
  thickness: number;
  boundary: PunchingPlanPoint[];
  openings: PunchingSlabOpening[];
  beams: unknown[];
}

export interface PunchingCircularFootprintInput {
  shape: "circle";
  center?: Partial<PunchingPlanPoint>;
  diameter?: number;
}

export interface PunchingRectangularFootprintInput {
  shape: "rectangle";
  center?: Partial<PunchingPlanPoint>;
  sizeX?: number;
  sizeY?: number;
  rotation?: number;
}

export interface PunchingPolygonFootprintInput {
  shape: "polygon";
  center?: Partial<PunchingPlanPoint>;
  boundary?: Array<Partial<PunchingPlanPoint>>;
}

export type PunchingFootprintInput =
  | PunchingCircularFootprintInput
  | PunchingRectangularFootprintInput
  | PunchingPolygonFootprintInput;

export type PunchingFootprint =
  | {
      shape: "circle";
      center: PunchingPlanPoint;
      diameter: number;
    }
  | {
      shape: "rectangle";
      center: PunchingPlanPoint;
      sizeX: number;
      sizeY: number;
      rotation: number;
    }
  | {
      shape: "polygon";
      center: PunchingPlanPoint;
      boundary: PunchingPlanPoint[];
    };

export interface PunchingSupportInput {
  id?: string;
  kind?: string;
  position?: PunchingSupportPosition | null;
  footprint?: PunchingFootprintInput;
  capital?: Record<string, unknown> | null;
  memberIdsAbove?: string[] | null;
  memberIdsBelow?: string[] | null;
}

export interface PunchingSupport {
  id: string;
  kind: string;
  position: PunchingSupportPosition | null;
  footprint: PunchingFootprint;
  capital: Record<string, unknown> | null;
  memberIdsAbove: string[];
  memberIdsBelow: string[];
}

export interface PunchingFlexuralTensionDirectionInput {
  effectiveDepth?: number;
  ratio?: number;
}

export interface PunchingFlexuralTensionInput {
  x?: PunchingFlexuralTensionDirectionInput;
  y?: PunchingFlexuralTensionDirectionInput;
  source?: Record<string, unknown>;
}

export interface PunchingFlexuralTensionDirection {
  effectiveDepth: number;
  ratio: number;
}

export interface PunchingFlexuralTension {
  x: PunchingFlexuralTensionDirection;
  y: PunchingFlexuralTensionDirection;
  source: Record<string, unknown>;
}

export interface PunchingReinforcementLayoutInput {
  legDiameter?: number | null;
  legArea?: number | null;
  areaPerPerimeter?: number | null;
  radialSpacing?: number | null;
  tangentialSpacing?: number | null;
  firstPerimeterOffset?: number | null;
  perimeterCount?: number;
}

export interface PunchingReinforcementInput extends Record<string, unknown> {
  flexuralTension?: PunchingFlexuralTensionInput | null;
  punching?: {
    present?: boolean;
    system?: "studs" | "links";
    orientation?: string;
    steel?: {
      fywk?: number | null;
      gammaS?: number | null;
      fywd?: number | null;
    };
    layout?: PunchingReinforcementLayoutInput;
    source?: Record<string, unknown>;
  } | null;
}

export type NormalizedPunchingReinforcement =
  | { present: false }
  | {
      present: true;
      system: "studs" | "links";
      orientation: "vertical";
      steel: {
        fywk: number | null;
        gammaS: number | null;
        fywd: number | null;
      };
      layout: {
        legDiameter: number | null;
        legArea: number | null;
        areaPerPerimeter: number | null;
        radialSpacing: number | null;
        tangentialSpacing: number | null;
        firstPerimeterOffset: number | null;
        perimeterCount: number;
      };
      source: Record<string, unknown>;
    };

export interface PunchingReinforcement extends Record<string, unknown> {
  flexuralTension: PunchingFlexuralTension | null;
  punching: NormalizedPunchingReinforcement;
}

export interface PunchingMaterialMapInput extends Record<string, unknown> {
  concrete?: unknown;
  concreteAggregate?: (Record<string, unknown> & { lowerSize?: number }) | null;
}

export interface PunchingConnectionModelOptions {
  id?: string;
  units?: UnitSystemInput | null;
  localFrame?: PunchingLocalFrameInput;
  slab?: PunchingSlabInput;
  support?: PunchingSupportInput;
  materials?: PunchingMaterialMapInput;
  reinforcement?: PunchingReinforcementInput;
  metadata?: Record<string, unknown>;
}

export interface PunchingConnectionModelJson {
  id: string;
  schemaVersion: string;
  units: UnitSystem;
  localFrame: PunchingLocalFrame;
  slab: PunchingSlab;
  support: PunchingSupport;
  materials: Record<string, unknown>;
  reinforcement: PunchingReinforcement;
  metadata: Record<string, unknown>;
}
