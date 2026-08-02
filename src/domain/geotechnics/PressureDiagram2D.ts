export const PRESSURE_DIAGRAM_2D_SCHEMA_VERSION = "geotechnical-pressure-diagram-2d/v1";

type PressureComponent =
  | "soilNormal"
  | "soilTangent"
  | "effectiveSoilNormal"
  | "effectiveSoilTangent"
  | "totalStressSoilNormal"
  | "totalStressSoilTangent"
  | "waterNormal"
  | "totalNormal"
  | "totalTangent";

const PRESSURE_COMPONENTS: readonly PressureComponent[] = Object.freeze([
  "soilNormal",
  "soilTangent",
  "effectiveSoilNormal",
  "effectiveSoilTangent",
  "totalStressSoilNormal",
  "totalStressSoilTangent",
  "waterNormal",
  "totalNormal",
  "totalTangent",
]);

export interface PressureComponentValues extends Record<string, unknown> {
  soilNormal?: number | null;
  soilTangent?: number | null;
  effectiveSoilNormal?: number | null;
  effectiveSoilTangent?: number | null;
  totalStressSoilNormal?: number | null;
  totalStressSoilTangent?: number | null;
  waterNormal?: number | null;
  totalNormal?: number | null;
  totalTangent?: number | null;
}

export interface PressureDiagramSegment {
  topElevation: number;
  bottomElevation: number;
  top: PressureComponentValues;
  bottom: PressureComponentValues;
  [key: string]: unknown;
}

export interface PressureComponentResult {
  forcePerUnitWidth: number;
  momentPerUnitWidth: number;
  applicationElevation: number | null;
  integratedSegmentCount?: number;
  unavailableSegmentCount?: number;
  coverage?: "complete" | "not-applicable" | "partial";
}

export type PressureIntegrationResults = {
  [component in PressureComponent]: PressureComponentResult;
};

export interface PressureIntegrationOptions {
  referenceElevation?: number | null;
}

export interface PressureDiagramMethod extends Record<string, unknown> {
  id: string;
}

export interface PressureDiagramReferenceLine {
  topElevation: number;
  bottomElevation: number;
  localCoordinateSystem: {
    normalPositive: "from-retained-ground-into-structure";
    tangentPositive: "downward-along-wall";
  };
}

export interface PressureDiagramUnits {
  elevation: "m";
  pressure: "kN/m2";
  forcePerUnitWidth: "kN/m";
  momentPerUnitWidth: "kN*m/m";
}

export interface PressureDiagram2DOptions {
  profileId?: string;
  state?: string;
  method?: PressureDiagramMethod;
  topElevation?: number;
  bottomElevation?: number;
  segments?: PressureDiagramSegment[];
  metadata?: Record<string, unknown>;
}

export interface PressureDiagram2DJson {
  schemaVersion: string;
  profileId: string;
  state: string;
  method: PressureDiagramMethod;
  referenceLine: PressureDiagramReferenceLine;
  segments: PressureDiagramSegment[];
  resultants: PressureIntegrationResults;
  units: PressureDiagramUnits;
  metadata: Record<string, unknown>;
}

interface MutablePressureComponentResult {
  forcePerUnitWidth: number;
  momentPerUnitWidth: number;
  integratedSegmentCount: number;
  unavailableSegmentCount: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createEmptyIntegrationResults(): PressureIntegrationResults {
  return {
    soilNormal: { forcePerUnitWidth: 0, momentPerUnitWidth: 0, applicationElevation: null },
    soilTangent: { forcePerUnitWidth: 0, momentPerUnitWidth: 0, applicationElevation: null },
    effectiveSoilNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      applicationElevation: null,
    },
    effectiveSoilTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      applicationElevation: null,
    },
    totalStressSoilNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      applicationElevation: null,
    },
    totalStressSoilTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      applicationElevation: null,
    },
    waterNormal: { forcePerUnitWidth: 0, momentPerUnitWidth: 0, applicationElevation: null },
    totalNormal: { forcePerUnitWidth: 0, momentPerUnitWidth: 0, applicationElevation: null },
    totalTangent: { forcePerUnitWidth: 0, momentPerUnitWidth: 0, applicationElevation: null },
  };
}

function createMutableIntegrationResults(): {
  [component in PressureComponent]: MutablePressureComponentResult;
} {
  return {
    soilNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    soilTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    effectiveSoilNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    effectiveSoilTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    totalStressSoilNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    totalStressSoilTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    waterNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    totalNormal: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
    totalTangent: {
      forcePerUnitWidth: 0,
      momentPerUnitWidth: 0,
      integratedSegmentCount: 0,
      unavailableSegmentCount: 0,
    },
  };
}

function isPressureSegmentArray(value: unknown): value is PressureDiagramSegment[] {
  return Array.isArray(value);
}

function integrateLinearPressure({
  topElevation,
  bottomElevation,
  topPressure,
  bottomPressure,
  referenceElevation,
}: {
  topElevation: number;
  bottomElevation: number;
  topPressure: number;
  bottomPressure: number;
  referenceElevation: number;
}): { force: number; moment: number } {
  const height = topElevation - bottomElevation;
  const force = (height * (topPressure + bottomPressure)) / 2;
  const firstMomentFromBottom = (height ** 2 * (bottomPressure + 2 * topPressure)) / 6;
  const moment = force * (bottomElevation - referenceElevation) + firstMomentFromBottom;

  return { force, moment };
}

export function integratePressureSegments(
  segments?: readonly PressureDiagramSegment[] | null,
  { referenceElevation = null }: PressureIntegrationOptions = {},
): PressureIntegrationResults {
  if (!isPressureSegmentArray(segments) || segments.length === 0) {
    return createEmptyIntegrationResults();
  }

  const reference =
    referenceElevation ?? Math.min(...segments.map((segment) => segment.bottomElevation));
  const totals = createMutableIntegrationResults();

  for (const segment of segments) {
    for (const component of PRESSURE_COMPONENTS) {
      const topPressure = segment.top[component];
      const bottomPressure = segment.bottom[component];
      if (!isFiniteNumber(topPressure) || !isFiniteNumber(bottomPressure)) {
        totals[component].unavailableSegmentCount += 1;
        continue;
      }
      const integrated = integrateLinearPressure({
        topElevation: segment.topElevation,
        bottomElevation: segment.bottomElevation,
        topPressure,
        bottomPressure,
        referenceElevation: reference,
      });
      totals[component].forcePerUnitWidth += integrated.force;
      totals[component].momentPerUnitWidth += integrated.moment;
      totals[component].integratedSegmentCount += 1;
    }
  }

  const result = createEmptyIntegrationResults();
  for (const component of PRESSURE_COMPONENTS) {
    const value = totals[component];
    result[component] = {
      ...value,
      applicationElevation:
        Math.abs(value.forcePerUnitWidth) > 1e-14
          ? reference + value.momentPerUnitWidth / value.forcePerUnitWidth
          : null,
      coverage:
        value.unavailableSegmentCount === 0
          ? "complete"
          : value.integratedSegmentCount === 0
            ? "not-applicable"
            : "partial",
    };
  }
  return result;
}

export class PressureDiagram2D {
  readonly schemaVersion: string;
  readonly profileId: string;
  readonly state: string;
  readonly method: PressureDiagramMethod;
  readonly referenceLine: PressureDiagramReferenceLine;
  readonly segments: PressureDiagramSegment[];
  readonly resultants: PressureIntegrationResults;
  readonly units: PressureDiagramUnits;
  readonly metadata: Record<string, unknown>;

  constructor({
    profileId,
    state,
    method,
    topElevation,
    bottomElevation,
    segments,
    metadata = {},
  }: PressureDiagram2DOptions = {}) {
    if (!profileId) throw new Error("PressureDiagram2D profileId is required.");
    if (!state) throw new Error("PressureDiagram2D state is required.");
    if (!method?.id) throw new Error("PressureDiagram2D method.id is required.");
    if (!isPressureSegmentArray(segments) || segments.length === 0) {
      throw new Error("PressureDiagram2D requires at least one segment.");
    }

    this.schemaVersion = PRESSURE_DIAGRAM_2D_SCHEMA_VERSION;
    this.profileId = profileId;
    this.state = state;
    this.method = structuredClone(method);
    this.referenceLine = {
      topElevation: finite(Number(topElevation), "topElevation"),
      bottomElevation: finite(Number(bottomElevation), "bottomElevation"),
      localCoordinateSystem: {
        normalPositive: "from-retained-ground-into-structure",
        tangentPositive: "downward-along-wall",
      },
    };
    this.segments = structuredClone(segments);
    this.resultants = integratePressureSegments(this.segments, {
      referenceElevation: this.referenceLine.bottomElevation,
    });
    this.units = {
      elevation: "m",
      pressure: "kN/m2",
      forcePerUnitWidth: "kN/m",
      momentPerUnitWidth: "kN*m/m",
    };
    this.metadata = structuredClone(metadata ?? {});
  }

  toJSON(): PressureDiagram2DJson {
    return {
      schemaVersion: this.schemaVersion,
      profileId: this.profileId,
      state: this.state,
      method: structuredClone(this.method),
      referenceLine: structuredClone(this.referenceLine),
      segments: structuredClone(this.segments),
      resultants: structuredClone(this.resultants),
      units: { ...this.units },
      metadata: structuredClone(this.metadata),
    };
  }
}
