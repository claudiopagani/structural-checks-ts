// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/fem/SteelMemberFem3DContract.js.

type InputRecord = Record<string, unknown>;

const LIMIT_STATES = new Set(["ULS", "SLS", "SLU", "SLE"]);

function isRecord(value: unknown): value is InputRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): InputRecord {
  return isRecord(value) ? value : {};
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function entries(value: unknown): readonly unknown[] {
  if (isUnknownArray(value)) {
    return value;
  }
  return Object.values(asRecord(value));
}

function cloneRecord(value: unknown): InputRecord {
  return { ...asRecord(value) };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstFinite(...values: readonly unknown[]): number | null {
  return values.find((value): value is number => finiteOrNull(value) !== null) ?? null;
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function normalizeLimitState(value: unknown): string {
  const normalized = stringValue(value).trim().toUpperCase();

  if (normalized === "ULS") return "SLU";
  if (normalized === "SLS") return "SLE";
  return normalized;
}

export interface SteelMemberFem3DStation {
  id: unknown;
  station: number | null;
  coordinates: { x: number | null; y: number | null; z: number | null };
  actions: {
    N: number | null;
    Vy: number | null;
    Vz: number | null;
    My: number | null;
    Mz: number | null;
    T: number | null;
    B: number | null;
  };
  displacements: { u: number | null; v: number | null; w: number | null };
  rotations: { x: number | null; y: number | null; z: number | null };
  momentDiagram: InputRecord | null;
  metadata: InputRecord;
}

export interface SteelMemberFem3DCombination {
  id: string;
  limitState: string;
  combinationType: unknown;
  stations: SteelMemberFem3DStation[];
  momentDiagram: InputRecord | null;
  metadata: InputRecord;
}

export interface SteelMemberFem3DEnd {
  id: unknown;
  coordinates: { x: number | null; y: number | null; z: number | null };
  restraints: {
    ux: boolean;
    uy: boolean;
    uz: boolean;
    rx: boolean;
    ry: boolean;
    rz: boolean;
    warping: boolean;
  };
  metadata: InputRecord;
}

export interface SteelMemberFem3DMember {
  id: unknown;
  length: number | null;
  ends: { start: SteelMemberFem3DEnd; end: SteelMemberFem3DEnd };
  frameClassification: { sway: unknown; nonSway: unknown };
  effectiveLengths: { y: number | null; z: number | null; torsional: number | null };
  effectiveLengthFactors: { y: number | null; z: number | null; torsional: number | null };
  restraintSegments: Array<{
    id: unknown;
    from: number | null;
    to: number | null;
    lateral: unknown;
    torsional: unknown;
    warping: unknown;
    momentDiagram: InputRecord | null;
    metadata: InputRecord;
  }>;
  webPanels: Array<{
    id: unknown;
    from: number | null;
    to: number | null;
    length: number | null;
    endPost: unknown;
    stiffeners: InputRecord[];
    metadata: InputRecord;
  }>;
  stiffeners: InputRecord[];
  concentratedLoads: Array<{
    id: unknown;
    combinationId: unknown;
    station: number | null;
    force: number | null;
    bearingLength: number | null;
    loadType: unknown;
    metadata: InputRecord;
  }>;
  metadata: InputRecord;
}

export interface SteelMemberFem3DResult {
  schema: "strutture-js/steel-member-fem-3d";
  version: 1;
  units: InputRecord | null;
  member: SteelMemberFem3DMember;
  combinations: SteelMemberFem3DCombination[];
  metadata: InputRecord;
}

export interface SteelMemberFem3DValidationOptions {
  strict?: boolean;
}

export interface SteelMemberFem3DValidationResult {
  ok: boolean;
  value: SteelMemberFem3DResult;
  errors: string[];
  warnings: string[];
}

function normalizeStation(sample: unknown, index = 0): SteelMemberFem3DStation {
  const source = asRecord(sample);
  const principal = asRecord(source.principalActions);
  const coordinates = asRecord(source.coordinates ?? source.coordinate);
  const displacements = asRecord(source.displacements);
  const rotations = asRecord(source.rotations);
  const station = firstFinite(source.station, source.position, source.s, source.x);
  const vyIsFinite = finiteOrNull(source.Vy) !== null;

  return {
    id: source.id ?? `station-${index + 1}`,
    station,
    coordinates: {
      x: firstFinite(coordinates.x, source.coordinateX, station),
      y: firstFinite(coordinates.y, source.coordinateY),
      z: firstFinite(coordinates.z, source.coordinateZ),
    },
    actions: {
      N: firstFinite(source.N, source.n),
      Vy: firstFinite(source.Vy, source.vY, principal.vY, source.v),
      Vz: firstFinite(source.Vz, source.vZ, principal.vZ),
      My: firstFinite(source.My, source.mY, principal.mY, source.m),
      Mz: firstFinite(source.Mz, source.mZ, principal.mZ),
      T: firstFinite(source.T, source.t, source.torsion),
      B: firstFinite(source.B, source.bimoment, source.warpingBimoment),
    },
    displacements: {
      u: firstFinite(source.u, source.ux, displacements.u, displacements.ux),
      v: firstFinite(
        source.vDisplacement,
        source.uy,
        displacements.v,
        displacements.uy,
        vyIsFinite ? source.v : null,
      ),
      w: firstFinite(source.w, source.uz, displacements.w, displacements.uz),
    },
    rotations: {
      x: firstFinite(source.rotationX, source.rx, rotations.x, rotations.rx),
      y: firstFinite(source.rotationY, source.ry, rotations.y, rotations.ry),
      z: firstFinite(source.rotationZ, source.rz, rotations.z, rotations.rz),
    },
    momentDiagram: source.momentDiagram ? cloneRecord(source.momentDiagram) : null,
    metadata: cloneRecord(source.metadata),
  };
}

function normalizeCombination(result: unknown, index = 0): SteelMemberFem3DCombination {
  const source = asRecord(result);
  const context = asRecord(source.context);
  const internalForces = asRecord(source.internalForces);
  const rawStations = source.stations ?? source.stationResults ?? internalForces.samples ?? [];
  const limitState = normalizeLimitState(source.limitState ?? source.type ?? context.limitState);

  return {
    id: stringValue(
      source.combinationId ?? source.id ?? context.combinationId ?? `combination-${index + 1}`,
    ),
    limitState,
    combinationType: source.combinationType ?? context.combinationType ?? null,
    stations: entries(rawStations).map(normalizeStation),
    momentDiagram: source.momentDiagram ? cloneRecord(source.momentDiagram) : null,
    metadata: cloneRecord(source.metadata),
  };
}

function normalizeEnd(raw: unknown, id: string): SteelMemberFem3DEnd {
  const source = asRecord(raw);
  const coordinates = asRecord(source.coordinates ?? source.coordinate ?? source);

  return {
    id: source.id ?? id,
    coordinates: {
      x: finiteOrNull(coordinates.x),
      y: finiteOrNull(coordinates.y),
      z: finiteOrNull(coordinates.z),
    },
    restraints: {
      ux: Boolean(asRecord(source.restraints).ux),
      uy: Boolean(asRecord(source.restraints).uy),
      uz: Boolean(asRecord(source.restraints).uz),
      rx: Boolean(asRecord(source.restraints).rx),
      ry: Boolean(asRecord(source.restraints).ry),
      rz: Boolean(asRecord(source.restraints).rz),
      warping: Boolean(asRecord(source.restraints).warping),
    },
    metadata: cloneRecord(source.metadata),
  };
}

function normalizeMember(source: InputRecord, analysisResult: InputRecord): SteelMemberFem3DMember {
  const geometry = asRecord(analysisResult.geometry);
  const rawSupports = isUnknownArray(analysisResult.supports) ? analysisResult.supports : [];
  const startSupport = rawSupports.find((support) => asRecord(support).station === 0) ?? {};
  const length = firstFinite(source.length, geometry.length, geometry.horizontalSpan);
  const endSupport = rawSupports.find((support) => asRecord(support).station === length) ?? {};
  const ends = asRecord(source.ends);
  const stability = asRecord(source.stability ?? analysisResult.stability);

  return {
    id: source.id ?? analysisResult.memberId ?? analysisResult.id ?? null,
    length,
    ends: {
      start: normalizeEnd(ends.start ?? source.start ?? geometry.start ?? startSupport, "start"),
      end: normalizeEnd(ends.end ?? source.end ?? geometry.end ?? endSupport, "end"),
    },
    frameClassification: {
      sway: stability.sway ?? source.sway ?? null,
      nonSway: stability.nonSway ?? source.nonSway ?? null,
    },
    effectiveLengths: {
      y: finiteOrNull(stability.effectiveLengthY ?? stability.LcrY),
      z: finiteOrNull(stability.effectiveLengthZ ?? stability.LcrZ),
      torsional: finiteOrNull(stability.effectiveLengthTorsional ?? stability.LcrT),
    },
    effectiveLengthFactors: {
      y: finiteOrNull(stability.effectiveLengthFactorY ?? stability.kY),
      z: finiteOrNull(stability.effectiveLengthFactorZ ?? stability.kZ),
      torsional: finiteOrNull(stability.effectiveLengthFactorTorsional ?? stability.kT),
    },
    restraintSegments: entries(
      source.restraintSegments ?? stability.restraintSegments ?? stability.segments,
    ).map((item, index) => {
      const segment = asRecord(item);
      const from = segment.from ?? segment.start;
      const to = segment.to ?? segment.end;
      return {
        id: segment.id ?? `restraint-segment-${index + 1}`,
        from: finiteOrNull(from),
        to: finiteOrNull(to),
        lateral: segment.lateral ?? segment.laterallyRestrained ?? null,
        torsional: segment.torsional ?? segment.torsionallyRestrained ?? null,
        warping: segment.warping ?? segment.warpingRestrained ?? null,
        momentDiagram: segment.momentDiagram ? cloneRecord(segment.momentDiagram) : null,
        metadata: cloneRecord(segment.metadata),
      };
    }),
    webPanels: entries(source.webPanels ?? analysisResult.webPanels).map((item, index) => {
      const panel = asRecord(item);
      const from = panel.from ?? panel.start;
      const to = panel.to ?? panel.end;
      const numericFrom = finiteOrNull(from);
      const numericTo = finiteOrNull(to);
      return {
        id: panel.id ?? `web-panel-${index + 1}`,
        from: finiteOrNull(from),
        to: finiteOrNull(to),
        length: firstFinite(
          panel.length,
          numericTo !== null && numericFrom !== null ? numericTo - numericFrom : null,
        ),
        endPost: panel.endPost ?? "non-rigid",
        stiffeners: entries(panel.stiffeners).map(cloneRecord),
        metadata: cloneRecord(panel.metadata),
      };
    }),
    stiffeners: entries(source.stiffeners ?? analysisResult.stiffeners).map(cloneRecord),
    concentratedLoads: entries(source.concentratedLoads ?? analysisResult.concentratedLoads).map(
      (item, index) => {
        const load = asRecord(item);
        return {
          id: load.id ?? `concentrated-load-${index + 1}`,
          combinationId: load.combinationId ?? null,
          station: firstFinite(load.station, load.position, load.x),
          force: firstFinite(load.force, load.FEd, load.value),
          bearingLength: firstFinite(load.bearingLength, load.ss),
          loadType: load.loadType ?? load.type ?? "internal",
          metadata: cloneRecord(load.metadata),
        };
      },
    ),
    metadata: cloneRecord(source.metadata),
  };
}

export function validateSteelMemberFem3DResult(
  analysisResult: unknown,
  options: SteelMemberFem3DValidationOptions = {},
): SteelMemberFem3DValidationResult {
  const strict = options.strict ?? false;
  const result = asRecord(analysisResult);
  const source = asRecord(result.fem3d ?? analysisResult ?? {});
  const rawCombinations = source.combinations ?? result.combinations;
  const combinations = entries(rawCombinations).map(normalizeCombination);
  const member = normalizeMember(asRecord(source.member), result);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!analysisResult || typeof analysisResult !== "object") {
    errors.push("analysisResult must be an object.");
  }
  if (!result.units) errors.push("analysisResult.units is required.");
  if (combinations.length === 0) errors.push("At least one FEM combination is required.");
  if (strict) {
    if (member.length === null || member.length <= 0) {
      errors.push("member.length must be a positive number.");
    }
    for (const endId of ["start", "end"] as const) {
      for (const coordinate of ["x", "y", "z"] as const) {
        if (member.ends[endId].coordinates[coordinate] === null) {
          errors.push(`member.ends.${endId}.coordinates.${coordinate} is required.`);
        }
      }
    }
    if (
      typeof member.frameClassification.sway !== "boolean" &&
      typeof member.frameClassification.nonSway !== "boolean"
    ) {
      errors.push("member frame classification requires sway or nonSway.");
    }
    for (const axis of ["y", "z"] as const) {
      if (member.effectiveLengths[axis] === null && member.effectiveLengthFactors[axis] === null) {
        errors.push(`member requires effective length or effective-length factor about ${axis}.`);
      }
    }
  }

  combinations.forEach((combination) => {
    if (!LIMIT_STATES.has(combination.limitState)) {
      errors.push(`Combination ${combination.id} requires limitState SLU/ULS or SLE/SLS.`);
    }
    if (combination.stations.length === 0) {
      errors.push(`Combination ${combination.id} requires at least one station.`);
    }
    combination.stations.forEach((station) => {
      if (station.station === null) {
        errors.push(`Combination ${combination.id}, ${String(station.id)}: station is required.`);
      }
      for (const action of ["N", "Vy", "Vz", "My", "Mz", "T", "B"] as const) {
        if (station.actions[action] === null) {
          const message = `Combination ${combination.id}, ${String(station.id)}: action ${action} is missing.`;
          (strict ? errors : warnings).push(message);
        }
      }
      if (strict) {
        for (const coordinate of ["x", "y", "z"] as const) {
          if (station.coordinates[coordinate] === null) {
            errors.push(
              `Combination ${combination.id}, ${String(station.id)}: coordinate ${coordinate} is missing.`,
            );
          }
        }
        for (const displacement of ["u", "v", "w"] as const) {
          if (station.displacements[displacement] === null) {
            errors.push(
              `Combination ${combination.id}, ${String(station.id)}: displacement ${displacement} is missing.`,
            );
          }
        }
        for (const rotation of ["x", "y", "z"] as const) {
          if (station.rotations[rotation] === null) {
            errors.push(
              `Combination ${combination.id}, ${String(station.id)}: rotation ${rotation} is missing.`,
            );
          }
        }
      }
    });
  });

  const value: SteelMemberFem3DResult = {
    schema: "strutture-js/steel-member-fem-3d",
    version: 1,
    units: result.units ? cloneRecord(result.units) : null,
    member,
    combinations,
    metadata: cloneRecord(source.metadata),
  };

  return { ok: errors.length === 0, value, errors, warnings };
}

export function createSteelMemberFem3DResult(
  input: unknown,
  options: SteelMemberFem3DValidationOptions = { strict: true },
): SteelMemberFem3DResult {
  const validation = validateSteelMemberFem3DResult(input, options);

  if (!validation.ok) {
    throw new Error(`Invalid steel FEM 3D result: ${validation.errors.join(" ")}`);
  }

  return validation.value;
}

export function steelMemberFem3DToLegacyAnalysisResult(
  contract: SteelMemberFem3DResult,
): InputRecord {
  const combinations = Object.fromEntries(
    contract.combinations.map((combination) => {
      const samples = combination.stations.map((station) => ({
        id: station.id,
        station: station.station,
        n: station.actions.N ?? 0,
        v: station.actions.Vy ?? 0,
        m: station.actions.My ?? 0,
        vY: station.actions.Vy ?? 0,
        vZ: station.actions.Vz ?? 0,
        mY: station.actions.My ?? 0,
        mZ: station.actions.Mz ?? 0,
        t: station.actions.T ?? 0,
        bimoment: station.actions.B ?? 0,
        principalActions: {
          vY: station.actions.Vy ?? 0,
          vZ: station.actions.Vz ?? 0,
          mY: station.actions.My ?? 0,
          mZ: station.actions.Mz ?? 0,
        },
        coordinates: { ...station.coordinates },
        displacements: { ...station.displacements },
        rotations: { ...station.rotations },
      }));
      const deflectionSamples = combination.stations.filter(
        (station) => station.displacements.v !== null,
      );
      const maxDeflection = deflectionSamples.reduce<SteelMemberFem3DStation | null>(
        (selected, station) => {
          if (!selected) return station;
          const stationDisplacement = station.displacements.v;
          const selectedDisplacement = selected.displacements.v;
          return stationDisplacement !== null &&
            selectedDisplacement !== null &&
            Math.abs(stationDisplacement) > Math.abs(selectedDisplacement)
            ? station
            : selected;
        },
        null,
      );
      const entry = {
        id: combination.id,
        resultType: "steel-member-fem-3d-combination",
        units: { ...contract.units },
        context: {
          limitState: combination.limitState === "SLU" ? "ULS" : "SLE",
          combinationType: combination.combinationType,
          combinationId: combination.id,
        },
        geometry: { length: contract.member.length },
        supports: [
          { station: 0, restraints: { ...contract.member.ends.start.restraints } },
          {
            station: contract.member.length,
            restraints: { ...contract.member.ends.end.restraints },
          },
        ],
        internalForces: { samples },
        displacements: {
          maxAbsVerticalDisplacement: maxDeflection
            ? { station: maxDeflection.station, uy: maxDeflection.displacements.v }
            : null,
        },
        metadata: { ...combination.metadata },
      };
      return [combination.id, entry];
    }),
  );

  return {
    id: contract.member.id,
    units: { ...contract.units },
    geometry: { length: contract.member.length },
    combinations,
    metadata: { schema: contract.schema, version: contract.version },
  };
}
