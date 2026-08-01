import {
  assertExplicitUnitSystem,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  ElasticBeamSectionProvider,
  type BeamMaterialLike,
  type BeamSectionLike,
} from "./ElasticBeamSectionProvider.js";
import {
  normalizeSectionRotation,
  type NormalizedSectionRotation,
  type SectionRotationInput,
} from "./SectionRotation.js";

export const BEAM_SUPPORT_PRESETS = Object.freeze({
  free: Object.freeze({ ux: false, uy: false, rz: false }),
  roller: Object.freeze({ ux: false, uy: true, rz: false }),
  "sliding-support": Object.freeze({ ux: false, uy: true, rz: false }),
  hinge: Object.freeze({ ux: true, uy: true, rz: false }),
  pin: Object.freeze({ ux: true, uy: true, rz: false }),
  fixed: Object.freeze({ ux: true, uy: true, rz: true }),
});

export const DISTRIBUTED_LOAD_TYPES = new Set(["distributed", "uniform", "line"]);
export const POINT_LOAD_TYPES = new Set(["point", "nodal", "force", "moment"]);

const LOAD_DURATION_ORDER: Readonly<Record<string, number>> = Object.freeze({
  permanent: 5,
  long: 4,
  medium: 3,
  short: 2,
  instantaneous: 1,
});

export interface BeamActionLike extends Record<string, unknown> {
  permanentClass?: string;
  nature?: string;
  category?: string;
  loadDurationClass?: string | null;
  leadingEligible?: boolean;
}

interface BeamLoadCaseLike extends Record<string, unknown> {
  id?: string;
  action?: BeamActionLike | null;
}

export interface BeamLoadInput extends Record<string, unknown> {
  id?: string;
  actionType?: string;
  type?: string;
  value?: number;
  magnitude?: number;
  startValue?: number;
  endValue?: number;
  from?: number | string;
  to?: number | string;
  start?: number | string;
  end?: number | string;
  x?: number | string;
  position?: number | string;
  station?: number | string;
  direction?: string;
  loadProjection?: string;
  factor?: number;
  action?: BeamActionLike | null;
  loadCase?: BeamLoadCaseLike | null;
  loadCaseId?: string;
  nature?: string;
  category?: string;
  variableCategory?: string | null;
  loadDurationClass?: string | null;
  durationClass?: string;
  leadingEligible?: boolean;
  metadata?: Record<string, unknown>;
  components?: {
    fx?: number;
    fy?: number;
    mz?: number;
  };
}

export interface NormalizedBeamLoad extends BeamLoadInput {
  id: string;
  actionType: string;
  type: string;
  factor: number;
  loadCaseId: string;
  nature: string;
  variableCategory: string | null;
  loadDurationClass: string | null;
}

export interface BeamSupportDefinition extends Record<string, unknown> {
  id: string;
  position?: number | string;
  x?: number | string;
  station?: number | string;
  type?: string;
  preset?: string;
  restraints?: Record<string, boolean>;
  metadata?: Record<string, unknown>;
}

export interface BeamCombinationInput extends Record<string, unknown> {
  id?: string;
  name?: string;
  factors?: Record<string, number> | BeamCombinationFactorInput[];
  limitState?: string;
  combinationType?: string;
  type?: string;
  serviceCombination?: string;
  deformationState?: string;
  stiffnessState?: string;
  rcStiffnessState?: string;
  metadata?: Record<string, unknown>;
}

interface BeamCombinationFactorInput extends Record<string, unknown> {
  loadCaseId?: string;
  loadCase?: string | { id?: string } | null;
  factor?: number;
}

export interface NormalizedBeamCombination {
  id: string;
  name: string;
  factors: Record<string, number | undefined>;
  metadata: Record<string, unknown>;
}

export interface BeamAnalysisContext extends Record<string, unknown> {
  beamId: string;
  analysisModel: string;
  loadCaseFactors: Record<string, number>;
  activeLoads: BeamLoadParticipation[];
  governingLoadDurationClass: string;
  governingLoad: BeamLoadParticipation | null;
}

export interface BeamLoadParticipation extends Record<string, unknown> {
  id: string;
  actionType: string;
  loadCaseId: string;
  factor: number;
  nature: string;
  variableCategory: string | null;
  loadDurationClass: string | null;
  leadingEligible: boolean;
  metadata: Record<string, unknown>;
}

export interface SingleBeamModelOptions {
  id?: string;
  units: UnitSystemInput;
  geometry: BeamGeometryInput;
  sectionProvider?: BeamSectionProviderLike | null;
  section?: BeamSectionLike | null;
  material?: BeamMaterialLike | null;
  analysisModel?: string;
  elementClass?: unknown;
  supports?:
    | BeamSupportDefinition[]
    | { start?: string | BeamSupportDefinition; end?: string | BeamSupportDefinition };
  loads?: BeamLoadInput[] | Record<string, unknown>;
  combinations?:
    | BeamCombinationInput[]
    | { items?: BeamCombinationInput[]; combinations?: BeamCombinationInput[] }
    | false
    | null;
  discretization?: Record<string, unknown>;
  verificationStations?: unknown[] | Record<string, unknown> | null;
  sectionRotation?: number | SectionRotationInput | null;
  metadata?: Record<string, unknown>;
}

export interface BeamSectionProviderLike {
  getElasticBeamProperties: (context?: Record<string, unknown>) => Record<string, unknown>;
}

export interface BeamGeometryInput {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function stringifyValue(value: unknown, fallback: string): string {
  if (value == null) {
    return fallback;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

function normalizePresetName(type: unknown): string {
  return stringifyValue(type, "free")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
}

export function resolveBeamSupportPreset(type: unknown): Record<string, boolean> {
  const normalized = normalizePresetName(type);
  const aliases: Record<string, string> = {
    libero: "free",
    libera: "free",
    appoggio: "roller",
    "appoggio-scorrevole": "roller",
    scorrevole: "roller",
    cerniera: "hinge",
    incastro: "fixed",
  };
  const presetName = aliases[normalized] ?? normalized;
  const preset = BEAM_SUPPORT_PRESETS[presetName as keyof typeof BEAM_SUPPORT_PRESETS];

  if (!preset) {
    throw new Error(`Unsupported beam support preset: ${String(type)}.`);
  }

  return { ...preset };
}

function expandLoads(
  loads: BeamLoadInput[] | Record<string, unknown> | undefined,
): BeamLoadInput[] {
  if (Array.isArray(loads)) {
    return loads.map((load) => ({ ...load }));
  }

  if (!isRecord(loads)) {
    return [];
  }

  const expanded: BeamLoadInput[] = [];
  const pushGroup = (items: unknown, actionType: string): void => {
    const entries = Array.isArray(items) ? items : [items];

    for (const item of entries) {
      if (item == null) {
        continue;
      }

      if (typeof item === "number") {
        expanded.push({ actionType, value: item, type: "uniform" });
        continue;
      }

      if (isRecord(item)) {
        expanded.push({ actionType, ...item });
      }
    }
  };

  pushGroup(loads.g1 ?? loads.G1, "G1");
  pushGroup(loads.g2 ?? loads.G2, "G2");
  pushGroup(loads.qk ?? loads.Qk ?? loads.QK, "Qk");

  for (const [key, value] of Object.entries(loads)) {
    if (["g1", "G1", "g2", "G2", "qk", "Qk", "QK"].includes(key)) {
      continue;
    }

    pushGroup(value, key);
  }

  return expanded;
}

function resolveLoadCaseId(load: BeamLoadInput, index: number): string {
  if (load.loadCaseId) {
    return load.loadCaseId;
  }

  if (load.loadCase?.id) {
    return load.loadCase.id;
  }

  const actionType = String(load.actionType ?? "LOAD").toUpperCase();

  if (actionType === "QK" || actionType === "Q") {
    return load.id ?? `Qk-${index + 1}`;
  }

  if (actionType === "G1" || actionType === "G2") {
    return actionType;
  }

  return load.id ?? actionType;
}

function resolveActionType(load: BeamLoadInput): string {
  if (load.actionType) {
    return load.actionType;
  }

  if (load.action?.permanentClass) {
    return load.action.permanentClass;
  }

  if (load.loadCase?.action?.permanentClass) {
    return load.loadCase.action.permanentClass;
  }

  if (load.action?.category || load.loadCase?.action?.category) {
    return "Qk";
  }

  return load.category ?? "LOAD";
}

function resolveLoadNature(load: BeamLoadInput): string {
  if (load.nature) {
    return load.nature;
  }

  if (load.action?.nature) {
    return load.action.nature;
  }

  if (load.loadCase?.action?.nature) {
    return load.loadCase.action.nature;
  }

  const actionType = String(load.actionType ?? "").toUpperCase();

  if (actionType === "G1" || actionType === "G2") {
    return "permanent";
  }

  if (actionType === "QK" || actionType === "Q") {
    return "variable";
  }

  return load.variableCategory || load.category ? "variable" : "generic";
}

function resolveLoadDurationClass(load: BeamLoadInput): string | null {
  return (
    load.loadDurationClass ??
    load.durationClass ??
    load.action?.loadDurationClass ??
    load.loadCase?.action?.loadDurationClass ??
    (typeof load.metadata?.loadDurationClass === "string"
      ? load.metadata.loadDurationClass
      : null) ??
    (resolveLoadNature(load) === "permanent" ? "permanent" : null)
  );
}

export function normalizeLoads(
  loads: BeamLoadInput[] | Record<string, unknown> | undefined,
): NormalizedBeamLoad[] {
  return expandLoads(loads).map((load, index) => {
    const actionType = resolveActionType(load);
    const id = load.id ?? `${actionType}-${index + 1}`;
    const normalized: BeamLoadInput = {
      ...load,
      id,
      actionType,
      type: load.type ?? "uniform",
      factor: load.factor ?? 1,
    };

    return {
      ...normalized,
      id,
      actionType,
      type: normalized.type ?? "uniform",
      factor: normalized.factor ?? 1,
      loadCaseId: resolveLoadCaseId(normalized, index),
      nature: resolveLoadNature(normalized),
      variableCategory:
        normalized.variableCategory ??
        normalized.action?.category ??
        normalized.loadCase?.action?.category ??
        normalized.category ??
        null,
      loadDurationClass: resolveLoadDurationClass(normalized),
    };
  });
}

export function normalizeSupportDefinitions(
  supports: SingleBeamModelOptions["supports"],
): BeamSupportDefinition[] {
  if (Array.isArray(supports)) {
    return supports.map((support, index) => ({
      ...support,
      id: support.id ?? `support-${index + 1}`,
    }));
  }

  if (!supports || typeof supports !== "object") {
    return [];
  }

  const definitions: BeamSupportDefinition[] = [];

  if (supports.start != null) {
    const start: Partial<BeamSupportDefinition> =
      typeof supports.start === "string" ? { type: supports.start } : { ...supports.start };
    definitions.push({
      id: start.id ?? "start-support",
      position: "start",
      ...start,
    });
  }

  if (supports.end != null) {
    const end: Partial<BeamSupportDefinition> =
      typeof supports.end === "string" ? { type: supports.end } : { ...supports.end };
    definitions.push({
      id: end.id ?? "end-support",
      position: "end",
      ...end,
    });
  }

  return definitions;
}

export function normalizeLoadDirection(load: Pick<BeamLoadInput, "direction">): {
  referenceSystem: "global";
  direction: "x" | "y" | "mz";
} {
  const rawDirection = String(load.direction ?? "global-y")
    .trim()
    .toLowerCase();

  if (["global-x", "x", "fx"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "x" };
  }

  if (["global-y", "y", "fy", "vertical"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "y" };
  }

  if (["moment", "moment-z", "mz", "rz"].includes(rawDirection)) {
    return { referenceSystem: "global", direction: "mz" };
  }

  throw new Error(`Unsupported beam load direction: ${String(load.direction)}.`);
}

export function normalizeProjection(value: unknown): "horizontal" | "beam-axis" {
  const projection = stringifyValue(value, "horizontal").trim().toLowerCase();
  const aliases: Record<string, "horizontal" | "beam-axis"> = {
    axis: "beam-axis",
    local: "beam-axis",
    member: "beam-axis",
    beam_axis: "beam-axis",
    "beam axis": "beam-axis",
    horizontal: "horizontal",
    "global-x": "horizontal",
  };
  const normalized = aliases[projection] ?? projection;

  if (normalized !== "horizontal" && normalized !== "beam-axis") {
    throw new Error(`Unsupported loadProjection: ${String(value)}.`);
  }

  return normalized;
}

export function projectedLineLoadValue(
  value: number,
  load: BeamLoadInput,
  geometry: { horizontalSpan: number; length: number },
): number {
  const projection = normalizeProjection(load.loadProjection);

  if (projection === "beam-axis") {
    return value;
  }

  return value * (geometry.horizontalSpan / geometry.length);
}

export function groupLoadsByCase(
  loads: readonly NormalizedBeamLoad[],
): Map<string, NormalizedBeamLoad[]> {
  const groups = new Map<string, NormalizedBeamLoad[]>();

  for (const load of loads) {
    if (!groups.has(load.loadCaseId)) {
      groups.set(load.loadCaseId, []);
    }

    groups.get(load.loadCaseId)?.push(load);
  }

  return groups;
}

function normalizeCombinationFactors(
  factors: BeamCombinationInput["factors"],
): Record<string, number | undefined> {
  if (Array.isArray(factors)) {
    return Object.fromEntries(
      factors.map((item) => [
        String(
          item.loadCaseId ??
            (typeof item.loadCase === "object" ? item.loadCase?.id : item.loadCase),
        ),
        typeof item.factor === "number" ? item.factor : undefined,
      ]),
    );
  }

  return { ...(factors ?? {}) };
}

function inferLimitState(combination: BeamCombinationInput): string | null {
  const rawValue =
    combination.limitState ??
    combination.combinationType ??
    combination.type ??
    combination.id ??
    "";
  const normalized = String(rawValue).trim().toUpperCase();

  if (normalized.includes("ULS") || normalized.includes("SLU")) {
    return "ULS";
  }

  if (normalized.includes("SLE") || normalized.includes("SLS")) {
    return "SLE";
  }

  return null;
}

export function normalizeCombinations(
  combinations: SingleBeamModelOptions["combinations"],
  loadCaseIds: readonly string[],
): NormalizedBeamCombination[] {
  if (combinations === false) {
    return [];
  }

  if (Array.isArray(combinations)) {
    return combinations.map((combination, index) => ({
      id: combination.id ?? `combination-${index + 1}`,
      name: combination.name ?? combination.id ?? `Combination ${index + 1}`,
      factors: normalizeCombinationFactors(combination.factors),
      metadata: {
        ...combination.metadata,
        combinationType: combination.combinationType ?? combination.type ?? null,
        limitState:
          combination.limitState ??
          combination.metadata?.limitState ??
          inferLimitState(combination),
        serviceCombination:
          combination.serviceCombination ?? combination.metadata?.serviceCombination ?? null,
        deformationState:
          combination.deformationState ?? combination.metadata?.deformationState ?? null,
        stiffnessState: combination.stiffnessState ?? combination.metadata?.stiffnessState ?? null,
        rcStiffnessState:
          combination.rcStiffnessState ?? combination.metadata?.rcStiffnessState ?? null,
      },
    }));
  }

  if (Array.isArray(combinations?.items)) {
    return normalizeCombinations(combinations.items, loadCaseIds);
  }

  if (Array.isArray(combinations?.combinations)) {
    return normalizeCombinations(combinations.combinations, loadCaseIds);
  }

  return [
    {
      id: "characteristic",
      name: "Characteristic",
      factors: Object.fromEntries(loadCaseIds.map((id) => [id, 1])),
      metadata: {
        generated: true,
        limitState: null,
      },
    },
  ];
}

export function loadsForCombination(
  loads: readonly NormalizedBeamLoad[],
  factors: Record<string, number | undefined>,
): NormalizedBeamLoad[] {
  return loads
    .map((load) => ({
      ...load,
      factor: (load.factor ?? 1) * (factors[load.loadCaseId] ?? 0),
    }))
    .filter((load) => load.factor !== 0);
}

function normalizeDurationOrder(loadDurationClass: string | null): string {
  const normalized = String(loadDurationClass ?? "")
    .trim()
    .toLowerCase();
  const aliases: Record<string, string> = {
    permanente: "permanent",
    lunga: "long",
    "lunga-durata": "long",
    media: "medium",
    "media-durata": "medium",
    breve: "short",
    "breve-durata": "short",
    istantanea: "instantaneous",
  };

  return aliases[normalized] ?? normalized;
}

function loadParticipation(load: NormalizedBeamLoad): BeamLoadParticipation {
  return {
    id: load.id,
    actionType: load.actionType,
    loadCaseId: load.loadCaseId,
    factor: load.factor ?? 1,
    nature: load.nature ?? resolveLoadNature(load),
    variableCategory: load.variableCategory ?? null,
    loadDurationClass: load.loadDurationClass ?? resolveLoadDurationClass(load),
    leadingEligible:
      load.leadingEligible ??
      load.action?.leadingEligible ??
      load.loadCase?.action?.leadingEligible ??
      true,
    metadata: { ...load.metadata },
  };
}

function resolveGoverningLoadDuration(activeLoads: BeamLoadParticipation[]): {
  loadDurationClass: string;
  load: BeamLoadParticipation | null;
} {
  const loadsWithDuration = activeLoads
    .map((load) => ({
      ...load,
      normalizedLoadDurationClass: normalizeDurationOrder(load.loadDurationClass),
    }))
    .filter((load) => LOAD_DURATION_ORDER[load.normalizedLoadDurationClass] !== undefined);

  if (loadsWithDuration.length === 0) {
    return {
      loadDurationClass: "permanent",
      load: null,
    };
  }

  const load = loadsWithDuration.reduce((current, candidate) =>
    (LOAD_DURATION_ORDER[candidate.normalizedLoadDurationClass] ?? 0) <
    (LOAD_DURATION_ORDER[current.normalizedLoadDurationClass] ?? 0)
      ? candidate
      : current,
  );

  return {
    loadDurationClass: load.normalizedLoadDurationClass,
    load,
  };
}

function loadCaseFactorsFromLoads(loads: readonly NormalizedBeamLoad[]): Record<string, number> {
  return loads.reduce<Record<string, number>>((acc, load) => {
    acc[load.loadCaseId] = load.factor ?? 1;
    return acc;
  }, {});
}

export function createBeamAnalysisContext(
  model: SingleBeamModel,
  loads: readonly NormalizedBeamLoad[],
  context: Record<string, unknown> = {},
): BeamAnalysisContext {
  const activeLoads = loads.filter((load) => (load.factor ?? 1) !== 0).map(loadParticipation);
  const governingDuration = resolveGoverningLoadDuration(activeLoads);

  return {
    ...context,
    beamId: model.id,
    analysisModel: model.analysisModel,
    loadCaseFactors: {
      ...((context.factors as Record<string, number> | undefined) ??
        loadCaseFactorsFromLoads(loads)),
    },
    activeLoads,
    governingLoadDurationClass:
      (context.governingLoadDurationClass as string | undefined) ??
      governingDuration.loadDurationClass,
    governingLoad:
      (context.governingLoad as BeamLoadParticipation | undefined) ?? governingDuration.load,
  };
}

export class SingleBeamModel {
  id: string;
  units: UnitSystem;
  geometry: BeamGeometryInput;
  sectionProvider: BeamSectionProviderLike;
  analysisModel: string;
  elementClass: unknown;
  supports: BeamSupportDefinition[];
  loads: NormalizedBeamLoad[];
  combinations: SingleBeamModelOptions["combinations"];
  discretization: Record<string, unknown>;
  verificationStations: unknown[] | Record<string, unknown> | null;
  sectionRotation: NormalizedSectionRotation;
  metadata: Record<string, unknown>;

  constructor({
    id = "single-beam",
    units,
    geometry,
    sectionProvider = null,
    section = null,
    material = null,
    analysisModel = "euler-bernoulli",
    elementClass = null,
    supports = {},
    loads = [],
    combinations = null,
    discretization = {},
    verificationStations = null,
    sectionRotation = null,
    metadata = {},
  }: SingleBeamModelOptions) {
    if (!id) {
      throw new Error("A SingleBeamModel id is required.");
    }

    assertExplicitUnitSystem(units, "SingleBeamModel");

    this.id = id;
    this.units = units as UnitSystem;
    this.geometry = geometry;
    this.sectionProvider =
      sectionProvider ??
      new ElasticBeamSectionProvider({
        section,
        material,
      });
    this.analysisModel = analysisModel;
    this.elementClass = elementClass;
    this.supports = normalizeSupportDefinitions(supports);
    this.loads = normalizeLoads(loads);
    this.combinations = combinations;
    this.discretization = { ...discretization };
    this.verificationStations = Array.isArray(verificationStations)
      ? [...verificationStations]
      : verificationStations
        ? { ...verificationStations }
        : null;
    this.sectionRotation = normalizeSectionRotation(sectionRotation);
    this.metadata = { ...metadata };
  }
}
