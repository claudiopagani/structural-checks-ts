// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/masonry-wall-openings/analysis/AlignmentStaticAnalysis.js.

import { CalculationResult } from "../../../core/results/CalculationResult.js";
import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import {
  createElasticBeamSectionProvider,
  createSteelBeamSectionProvider,
  SingleBeamAnalysis,
} from "../../../domain/beams/index.js";
import type { SingleBeamAnalysisOutput } from "../../../domain/beams/SingleBeamAnalysis.js";
import type {
  BeamMaterialLike,
  BeamSectionLike,
} from "../../../domain/beams/ElasticBeamSectionProvider.js";
import type { BeamSectionProviderLike } from "../../../domain/beams/SingleBeamInput.js";
import type {
  SteelBeamMaterialLike,
  SteelBeamSectionLike,
} from "../../../domain/beams/SteelBeamSectionProvider.js";
import { createSteelProfileSection } from "../../../domain/geometry/createSteelProfileSection.js";
import { RectangularSection } from "../../../domain/geometry/RectangularSection.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  createNTC2018PermanentAction,
  createNTC2018StructuralSteelMaterial,
  createNTC2018VariableAction,
} from "../../../norms/ntc2018/index.js";
import { MasonryPierVerticalVerification } from "../../masonry-piers/checks/MasonryPierVerticalVerification.js";
import {
  MasonryPierModel,
  type MasonryPierDesignInput,
} from "../../masonry-piers/models/MasonryPierModel.js";
import { SteelMemberVerification } from "../../steel-frames/checks/SteelMemberVerification.js";
import type {
  SteelMemberVerificationPolicyMaterial,
  SteelMemberVerificationPolicySection,
} from "../../steel-frames/checks/SteelMemberVerificationPolicies.js";
import { extractEquivalentFrameMembers } from "../geometry/extractEquivalentFrameMembers.js";
import { resolveMasonryUnitWeight } from "../materials/resolveMasonryMaterialProperty.js";
import { resolveAlignmentMechanicalState } from "../materials/resolveAlignmentMechanicalState.js";
import { sanitizeAlignmentOpenings } from "../geometry/sanitizeAlignmentOpenings.js";
import type { EquivalentFrameMembersResult } from "../geometry/extractEquivalentFrameMembers.js";
import type {
  AlignmentMechanicalStateOptions,
  AlignmentMechanicalStateResolution,
} from "../materials/resolveAlignmentMechanicalState.js";
import type {
  MasonryWallOpeningsModel,
  MasonryWallOpeningsNormalizedWall,
} from "../models/MasonryWallOpeningsModel.js";
import type { SanitizedAlignmentOpening } from "../geometry/sanitizeAlignmentOpenings.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import {
  NTC2018_STRUCTURAL_STEEL_GRADES,
  type NTC2018StructuralSteelGrade,
} from "../../../norms/ntc2018/materials/ntc2018MaterialCatalogs.js";

type JsonRecord = Record<string, unknown>;

interface ActionLike {
  getPartialFactor(options: { effect: string }): number | null;
  getCombinationFactor(factor: string): number | null;
}

type LineLoadKind = "direct" | "permanent" | "variable";

interface LineLoadEntry {
  id: string;
  key: string;
  value: number;
  kind: LineLoadKind;
  leading?: boolean;
  action?: ActionLike;
}

function actionOf(entry: LineLoadEntry): ActionLike {
  if (!entry.action) {
    throw new Error(`Line-load entry ${entry.id} has no action.`);
  }
  return entry.action;
}

function partialFactor(entry: LineLoadEntry): number {
  return actionOf(entry).getPartialFactor({ effect: "unfavourable" }) ?? 0;
}

function combinationFactor(entry: LineLoadEntry, factor: string): number {
  return actionOf(entry).getCombinationFactor(factor) ?? 0;
}

interface LineLoadFactor {
  entryId: string;
  key: string;
  factor: number;
  contribution: number;
}

interface LineLoadResolution {
  value: number;
  entries: LineLoadEntry[];
  factors: LineLoadFactor[];
  combinationType: string;
  leadingVariableId?: string | null;
}

interface OpeningWallOverlap {
  wall: MasonryWallOpeningsNormalizedWall;
  xStart: number;
  xEnd: number;
  width: number;
  openingTop: number;
}

interface OpeningLoadTransfer {
  overlaps: OpeningLoadOverlap[];
  topLoad: number;
  openingBandLoad: number;
}

interface OpeningLoadOverlap {
  wallId: string;
  xStart: number;
  xEnd: number;
  width: number;
  lineLoadIntensity: number;
  topLoad: number;
  tributaryHeight: number;
  masonryBandIntensity: number;
  masonryBandLoad: number;
}

interface PierResult {
  id: string;
  wallId: string;
  sourceWallIds: string[];
  x: number;
  length: number;
  effectiveLength: number;
  tributaryInterval: { xStart: number; xEnd: number };
  tributaryLoadByWall: Record<string, number>;
  topDistributedLoad: number;
  transferredOpeningLoad: number;
  axialForce: number;
  selfWeight: number;
  baseReaction: number;
  verification: JsonRecord | null;
  verificationError: string | null;
}

interface RingFrameResult {
  id: string;
  openingId: string;
  topLoad: number;
  openingBandLoad: number;
  totalInterceptedLoad: number;
  leftReaction: number;
  rightReaction: number;
  leftPierId: string | null;
  rightPierId: string | null;
}

interface LintelAnalysisSummary {
  resultId: string;
  maxAbsBendingMoment: number | null;
  maxAbsShearForce: number | null;
  maxAbsVerticalDisplacement: number | null;
}

interface LintelOutput {
  id: string;
  openingId: string;
  span: number;
  bearingLength: number;
  topLoad: number;
  openingBandLoad: number;
  totalAppliedLoad: number;
  status: string;
  providerKind: "steel" | "generic" | null;
  analysis: LintelAnalysisSummary | null;
  verification: JsonRecord | null;
}

interface LintelProvider {
  sectionProvider: BeamSectionProviderLike | null;
  section: BeamSectionLike | null;
  material: BeamMaterialLike | null;
  providerKind: "steel" | "generic" | null;
}

interface AlignmentStaticAnalysisOutputs extends JsonRecord {
  stage: string;
  combinationType: string;
  wallLineLoads: Record<string, JsonRecord>;
  piers: PierResult[];
  ringFrames: RingFrameResult[];
  lintels: LintelOutput[];
  equilibrium: JsonRecord;
}

export interface AlignmentStaticAnalysisOptions extends JsonRecord {
  combinationType?: string;
  materialResolution?: AlignmentMechanicalStateOptions;
  pierDesign?: MasonryPierDesignInput;
  equilibriumToleranceRelative?: number;
}

export interface AlignmentStaticAnalysisInput {
  alignment?: MasonryWallOpeningsModel | null;
  stage?: string;
  options?: AlignmentStaticAnalysisOptions;
  sanitizedOpenings?: readonly SanitizedAlignmentOpening[] | null;
  extractedMembers?: EquivalentFrameMembersResult | null;
  resolvedAlignmentState?: AlignmentMechanicalStateResolution | null;
}

export type AlignmentStaticAnalysisResult = CalculationResult<AlignmentStaticAnalysisOutputs>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function read(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNumber(value: unknown, key: string): number | null {
  return numberValue(read(value, key));
}

function readString(value: unknown, key: string): string | null {
  const result = read(value, key);
  return typeof result === "string" ? result : null;
}

function readBoolean(value: unknown, key: string): boolean | null {
  const result = read(value, key);
  return typeof result === "boolean" ? result : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isBeamSectionProvider(value: unknown): value is BeamSectionProviderLike {
  return isRecord(value) && typeof value.getElasticBeamProperties === "function";
}

function isBeamSection(value: unknown): value is BeamSectionLike {
  return isRecord(value) && numberValue(value.area) !== null;
}

function isBeamMaterial(value: unknown): value is BeamMaterialLike {
  return isRecord(value) && numberValue(value.elasticModulus) !== null;
}

function isSteelSection(value: unknown): value is SteelBeamSectionLike {
  return isBeamSection(value);
}

function isSteelMaterial(value: unknown): value is SteelBeamMaterialLike {
  return isBeamMaterial(value);
}

function isPolicySection(value: unknown): value is SteelMemberVerificationPolicySection {
  return isBeamSection(value);
}

function isPolicyMaterial(value: unknown): value is SteelMemberVerificationPolicyMaterial {
  return isBeamMaterial(value);
}

function isStructuralSteelGrade(value: string): value is NTC2018StructuralSteelGrade {
  return Object.prototype.hasOwnProperty.call(NTC2018_STRUCTURAL_STEEL_GRADES, value);
}

function unitsInput(value: unknown): {
  force?: "N" | "kN" | "MN";
  length?: "m" | "dm" | "cm" | "mm";
} {
  if (!isRecord(value)) {
    return { force: "N", length: "m" };
  }

  const force = value.force;
  const length = value.length;
  return {
    ...(force === "N" || force === "kN" || force === "MN" ? { force } : {}),
    ...(length === "m" || length === "dm" || length === "cm" || length === "mm" ? { length } : {}),
  };
}

const DEFAULT_PIER_DESIGN = Object.freeze({
  gammaM: 2,
  confidenceFactor: 1,
});
const DEFAULT_COMBINATION_TYPE = "ULS_FUNDAMENTAL";
const DEFAULT_LINTEL_BEARING = 0.3;
const DEFAULT_EQUILIBRIUM_TOLERANCE = 1e-6;
const EPS = 1e-9;

function resultToJson(value: unknown): JsonRecord | null {
  const toJson = read(value, "toJSON");
  if (typeof toJson === "function") {
    const result: unknown = Reflect.apply(toJson, value, []);
    return isRecord(result) ? result : null;
  }
  return isRecord(value) ? value : null;
}

function normalizeCombinationType(value: unknown = DEFAULT_COMBINATION_TYPE): string {
  return String(value).trim().toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function findAdjacentOpening(
  openings: readonly SanitizedAlignmentOpening[],
  coordinate: number,
  side: "left" | "right",
): SanitizedAlignmentOpening | null {
  return (
    openings.find((opening) =>
      side === "left"
        ? Math.abs(opening.x + opening.width - coordinate) <= EPS
        : Math.abs(opening.x - coordinate) <= EPS,
    ) ?? null
  );
}

function normalizeLineLoadEntryKey(rawKey: unknown): string {
  return String(rawKey).trim();
}

function resolveVariableCategory(entry: unknown, key: string): string | null {
  const category = readString(entry, "category");
  if (category) {
    return category;
  }

  if (key.toUpperCase() === "QK") {
    return "A";
  }

  if (key.toUpperCase().startsWith("Q")) {
    return "A";
  }

  return null;
}

function resolveLineLoadEntries(
  payload: unknown,
  wallId: string,
  warnings: string[],
): LineLoadEntry[] {
  const directValue = numberValue(payload);
  if (directValue !== null) {
    return [
      {
        id: `${wallId}-direct`,
        key: "DIRECT",
        value: directValue,
        kind: "direct",
      },
    ];
  }

  if (!isRecord(payload)) {
    return [];
  }

  const entries: LineLoadEntry[] = [];

  for (const [rawKey, rawValue] of Object.entries(payload)) {
    const key = normalizeLineLoadEntryKey(rawKey);
    const value =
      numberValue(rawValue) ?? (isRecord(rawValue) ? numberValue(rawValue.value) : null);

    if (value === null) {
      continue;
    }

    const normalizedKey = key.toUpperCase();
    const permanentClass =
      readString(rawValue, "permanentClass") ??
      (normalizedKey === "G1" || normalizedKey === "G2" ? normalizedKey : null);
    const category = resolveVariableCategory(rawValue, normalizedKey);
    const isVariable =
      readString(rawValue, "nature") === "variable" || category != null || normalizedKey === "QK";

    if (permanentClass) {
      entries.push({
        id: `${wallId}-${key}`,
        key,
        value,
        kind: "permanent",
        action: createNTC2018PermanentAction({
          id: `${wallId}-${key}-action`,
          permanentClass,
        }),
      });
      continue;
    }

    if (isVariable) {
      entries.push({
        id: `${wallId}-${key}`,
        key,
        value,
        kind: "variable",
        leading: readBoolean(rawValue, "leading") ?? false,
        action: createNTC2018VariableAction({
          id: `${wallId}-${key}-action`,
          category: category ?? "A",
          family: readString(rawValue, "family") ?? "imposed",
        }),
      });
      continue;
    }

    warnings.push(
      `Wall ${wallId} line load entry ${key} was treated as a direct characteristic contribution because it does not map to the supported G1/G2/Qk action families.`,
    );
    entries.push({
      id: `${wallId}-${key}`,
      key,
      value,
      kind: "direct",
    });
  }

  return entries;
}

function selectLeadingVariable(entries: readonly LineLoadEntry[] = []): LineLoadEntry | null {
  return (
    entries.find((entry) => entry.leading) ??
    entries.reduce<LineLoadEntry | null>(
      (selected, candidate) =>
        !selected || Math.abs(candidate.value) > Math.abs(selected.value) ? candidate : selected,
      null,
    )
  );
}

function resolveCombinedLineLoad({
  payload,
  wallId,
  combinationType,
  warnings,
}: {
  payload: unknown;
  wallId: string;
  combinationType: unknown;
  warnings: string[];
}): LineLoadResolution {
  const entries = resolveLineLoadEntries(payload, wallId, warnings);
  const normalizedCombination = normalizeCombinationType(combinationType);

  if (entries.length === 0) {
    return {
      value: 0,
      entries,
      factors: [],
      combinationType: normalizedCombination,
    };
  }

  const permanents = entries.filter((entry) => entry.kind === "permanent");
  const variables = entries.filter((entry) => entry.kind === "variable");
  const directs = entries.filter((entry) => entry.kind === "direct");
  const factors: LineLoadFactor[] = [];
  let value = directs.reduce((sum, entry) => sum + entry.value, 0);

  const pushFactor = (entry: LineLoadEntry, factor: number): void => {
    factors.push({
      entryId: entry.id,
      key: entry.key,
      factor,
      contribution: entry.value * factor,
    });
    value += entry.value * factor;
  };

  if (normalizedCombination === "CHARACTERISTIC" || normalizedCombination === "DIRECT") {
    for (const entry of [...permanents, ...variables]) {
      pushFactor(entry, 1);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
    };
  }

  if (normalizedCombination === "ULS_FUNDAMENTAL") {
    for (const entry of permanents) {
      pushFactor(entry, partialFactor(entry));
    }

    const leading = selectLeadingVariable(variables);

    for (const entry of variables) {
      const factor =
        entry.id === leading?.id
          ? partialFactor(entry)
          : partialFactor(entry) * combinationFactor(entry, "psi0");

      pushFactor(entry, factor);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
      leadingVariableId: leading?.id ?? null,
    };
  }

  if (normalizedCombination === "SLE_RARE" || normalizedCombination === "SLE_FREQUENT") {
    for (const entry of permanents) {
      pushFactor(entry, 1);
    }

    const leading = selectLeadingVariable(variables);

    for (const entry of variables) {
      const factor =
        entry.id === leading?.id
          ? normalizedCombination === "SLE_RARE"
            ? 1
            : combinationFactor(entry, "psi1")
          : normalizedCombination === "SLE_RARE"
            ? combinationFactor(entry, "psi0")
            : combinationFactor(entry, "psi2");

      pushFactor(entry, factor);
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
      leadingVariableId: leading?.id ?? null,
    };
  }

  if (normalizedCombination === "SLE_QUASI_PERMANENT" || normalizedCombination === "SEISMIC") {
    for (const entry of permanents) {
      pushFactor(entry, 1);
    }

    for (const entry of variables) {
      pushFactor(entry, combinationFactor(entry, "psi2"));
    }

    return {
      value,
      entries,
      factors,
      combinationType: normalizedCombination,
    };
  }

  throw new Error(`Unsupported wall line-load combination type: ${String(combinationType)}.`);
}

function openingWallOverlaps(
  alignment: MasonryWallOpeningsModel,
  opening: SanitizedAlignmentOpening,
): OpeningWallOverlap[] {
  return alignment.walls
    .map((wall) => ({
      wall,
      xStart: Math.max(wall.xStart, opening.x),
      xEnd: Math.min(wall.xEnd, opening.x + opening.width),
    }))
    .filter((item) => item.xEnd - item.xStart > EPS)
    .map((item) => ({
      ...item,
      width: item.xEnd - item.xStart,
      openingTop: opening.y + opening.height,
    }));
}

function computeOpeningTransferredLoads({
  opening,
  alignment,
  wallLineLoads,
  warnings,
}: {
  opening: SanitizedAlignmentOpening;
  alignment: MasonryWallOpeningsModel;
  wallLineLoads: Record<string, LineLoadResolution>;
  warnings: string[];
}): OpeningLoadTransfer {
  const overlaps = openingWallOverlaps(alignment, opening).map((item) => {
    const combinedLineLoad = wallLineLoads[item.wall.id]?.value ?? 0;
    const topLoad = combinedLineLoad * item.width;
    const unitWeight = resolveMasonryUnitWeight({
      material: item.wall.material,
      targetUnits: alignment.units,
    });
    const tributaryHeight = Math.max(0, item.wall.height - item.openingTop);
    const masonryBandIntensity =
      unitWeight !== null && unitWeight > 0
        ? unitWeight * item.wall.thickness * tributaryHeight
        : 0;

    if (unitWeight === null || unitWeight <= 0) {
      warnings.push(
        `Opening ${opening.id} could not resolve a finite masonry unit weight for wall ${item.wall.id}; the masonry band above the opening was set to zero in the static transfer model.`,
      );
    }

    return {
      wallId: item.wall.id,
      xStart: item.xStart,
      xEnd: item.xEnd,
      width: item.width,
      lineLoadIntensity: combinedLineLoad,
      topLoad,
      tributaryHeight,
      masonryBandIntensity,
      masonryBandLoad: masonryBandIntensity * item.width,
    };
  });

  return {
    overlaps,
    topLoad: overlaps.reduce((sum, item) => sum + item.topLoad, 0),
    openingBandLoad: overlaps.reduce((sum, item) => sum + item.masonryBandLoad, 0),
  };
}

function resolveTributaryInterval(
  pier: EquivalentFrameMembersResult["piers"][number],
  sanitizedOpenings: readonly SanitizedAlignmentOpening[],
): {
  xStart: number;
  xEnd: number;
  leftOpening: SanitizedAlignmentOpening | null;
  rightOpening: SanitizedAlignmentOpening | null;
} {
  const xStart = pier.x;
  const xEnd = pier.x + pier.length;
  const leftOpening = findAdjacentOpening(sanitizedOpenings, xStart, "left");
  const rightOpening = findAdjacentOpening(sanitizedOpenings, xEnd, "right");
  const tributaryStart =
    xStart - (leftOpening && !leftOpening.ringFrame ? leftOpening.width / 2 : 0);
  const tributaryEnd =
    xEnd + (rightOpening && !rightOpening.ringFrame ? rightOpening.width / 2 : 0);

  return {
    xStart: tributaryStart,
    xEnd: tributaryEnd,
    leftOpening,
    rightOpening,
  };
}

function resolveLintelBearing(lintel: unknown): number {
  return numberValue(read(lintel, "bearingLength")) ?? DEFAULT_LINTEL_BEARING;
}

function createRectangularSectionFromLintel(lintel: unknown): BeamSectionLike | null {
  const width = readNumber(lintel, "sectionWidth") ?? readNumber(lintel, "width");
  const height =
    readNumber(lintel, "sectionHeight") ??
    readNumber(lintel, "depth") ??
    readNumber(lintel, "height");

  if (width === null || height === null) {
    return null;
  }

  return new RectangularSection({
    width,
    height,
    units: unitsInput(read(lintel, "units")),
  });
}

function createSteelMaterialFromLintel(lintel: unknown): BeamMaterialLike | null {
  const material = read(lintel, "material");
  if (material instanceof SteelMaterial || readString(material, "category") === "steel") {
    return isBeamMaterial(material) ? material : null;
  }

  const grade = readString(lintel, "materialGrade") ?? readString(lintel, "grade");

  if (!grade) {
    return null;
  }

  if (!isStructuralSteelGrade(grade)) {
    throw new Error(`Unsupported NTC 2018 structural steel grade: ${grade}.`);
  }

  return createNTC2018StructuralSteelMaterial({
    grade,
    units: unitsInput(read(lintel, "units")),
  });
}

function resolveLintelProvider(lintel: unknown): LintelProvider {
  if (!lintel) {
    return {
      sectionProvider: null,
      section: null,
      material: null,
      providerKind: null,
    };
  }

  const sectionProvider = read(lintel, "sectionProvider");
  const lintelMaterial = read(lintel, "material");
  const suppliedSection = read(lintel, "section");
  if (isBeamSectionProvider(sectionProvider)) {
    return {
      sectionProvider,
      section: isBeamSection(suppliedSection) ? suppliedSection : null,
      material: isBeamMaterial(lintelMaterial) ? lintelMaterial : null,
      providerKind: readString(lintelMaterial, "category") === "steel" ? "steel" : "generic",
    };
  }

  const sectionProfileName =
    readString(lintel, "sectionProfileName") ?? readString(lintel, "profileName");
  const lintelUnits = read(lintel, "units");
  const section =
    (isBeamSection(suppliedSection) ? suppliedSection : null) ??
    (sectionProfileName
      ? createSteelProfileSection({
          profileName: sectionProfileName,
          units: unitsInput(lintelUnits),
        })
      : createRectangularSectionFromLintel(lintel));
  const material =
    (isBeamMaterial(lintelMaterial) ? lintelMaterial : null) ??
    createSteelMaterialFromLintel(lintel);

  if (!section || !material) {
    return {
      sectionProvider: null,
      section: section ?? null,
      material: material ?? null,
      providerKind: null,
    };
  }

  if (
    readString(material, "category") === "steel" ||
    readString(material, "grade") !== null ||
    numberValue(read(material, "fyk")) !== null ||
    numberValue(read(material, "fyd")) !== null
  ) {
    return {
      sectionProvider:
        isSteelSection(section) && isSteelMaterial(material)
          ? createSteelBeamSectionProvider({ section, material })
          : null,
      section,
      material,
      providerKind: "steel",
    };
  }

  return {
    sectionProvider: createElasticBeamSectionProvider({ section, material }),
    section,
    material,
    providerKind: "generic",
  };
}

function summarizeLintelAnalysis(
  analysisResult: SingleBeamAnalysisOutput | null,
): LintelAnalysisSummary | null {
  const combination =
    analysisResult?.combinations?.uls ??
    Object.values(analysisResult?.combinations ?? {})[0] ??
    Object.values(analysisResult?.loadCases ?? {})[0] ??
    null;

  if (!combination) {
    return null;
  }

  return {
    resultId: combination.id,
    maxAbsBendingMoment: readNumber(read(combination.internalForces, "maxAbsBendingMoment"), "m"),
    maxAbsShearForce: readNumber(read(combination.internalForces, "maxAbsShearForceY"), "vY"),
    maxAbsVerticalDisplacement: readNumber(
      read(combination.displacements, "maxAbsVerticalDisplacement"),
      "uy",
    ),
  };
}

function analyzeLintels({
  alignment,
  sanitizedOpenings,
  openingTransferredLoads,
  combinationType,
  warnings,
}: {
  alignment: MasonryWallOpeningsModel;
  sanitizedOpenings: readonly SanitizedAlignmentOpening[];
  openingTransferredLoads: Record<string, OpeningLoadTransfer>;
  combinationType: unknown;
  warnings: string[];
}): LintelOutput[] {
  const lintels: LintelOutput[] = [];

  for (const opening of sanitizedOpenings) {
    if (!opening.lintel) {
      continue;
    }

    const lintel = opening.lintel;
    const bearingLength = resolveLintelBearing(lintel);
    const span = opening.width + 2 * bearingLength;
    const loadTransfer = openingTransferredLoads[opening.id];
    if (!loadTransfer) {
      throw new Error(`Opening ${opening.id} has no resolved transferred load.`);
    }
    const provider = resolveLintelProvider(lintel);
    const openingLoadSegments = loadTransfer.overlaps
      .filter((item) => Math.abs(item.topLoad) > EPS || Math.abs(item.masonryBandLoad) > EPS)
      .map((item, index) => ({
        id: `${alignment.id}-${opening.id}-lintel-segment-${index + 1}`,
        loadCaseId: "combined",
        actionType: "COMBINED",
        type: "uniform",
        from: bearingLength + (item.xStart - opening.x),
        to: bearingLength + (item.xEnd - opening.x),
        value: -(item.lineLoadIntensity + item.masonryBandIntensity),
      }));
    const output: LintelOutput = {
      id: `${alignment.id}-lintel-${opening.id}`,
      openingId: opening.id,
      span,
      bearingLength,
      topLoad: loadTransfer.topLoad,
      openingBandLoad: loadTransfer.openingBandLoad,
      totalAppliedLoad: loadTransfer.topLoad + loadTransfer.openingBandLoad,
      status: RESULT_STATUS.NOT_ANALYZED,
      providerKind: provider.providerKind,
      analysis: null,
      verification: null,
    };

    if (!provider.sectionProvider) {
      warnings.push(
        `Lintel on opening ${opening.id} was not analyzed because no section/material or sectionProvider was provided.`,
      );
      lintels.push(output);
      continue;
    }

    try {
      const analysisResult = new SingleBeamAnalysis().analyze({
        id: output.id,
        units: alignment.units,
        geometry: {
          start: { x: 0, y: 0 },
          end: { x: span, y: 0 },
        },
        sectionProvider: provider.sectionProvider,
        supports: {
          start: "hinge",
          end: "roller",
        },
        loads: openingLoadSegments,
        combinations: [
          {
            id: "uls",
            limitState: "ULS",
            combinationType: normalizeCombinationType(combinationType),
            factors: {
              combined: 1,
            },
          },
        ],
        discretization: {
          elementCount: 8,
        },
      });

      output.status = RESULT_STATUS.OK;
      output.analysis = summarizeLintelAnalysis(analysisResult);

      if (
        provider.providerKind === "steel" &&
        isPolicySection(provider.section) &&
        isPolicyMaterial(provider.material)
      ) {
        const verification = new SteelMemberVerification({
          stability: {
            lateralTorsionalBuckling: { enabled: false },
            compressionBuckling: { enabled: false },
            beamColumnInteraction: { enabled: false },
          },
        }).verify({
          memberId: output.id,
          section: provider.section,
          material: provider.material,
          analysisResult,
        });

        output.verification = resultToJson(verification);

        if (verification.status !== RESULT_STATUS.OK) {
          output.status = verification.status;
        }
      }
    } catch (error: unknown) {
      output.status = RESULT_STATUS.NOT_ANALYZED;
      warnings.push(
        `Lintel on opening ${opening.id} could not be analyzed: ${errorMessage(error)}`,
      );
    }

    lintels.push(output);
  }

  return lintels;
}

function equilibriumCheck({
  appliedTopLineLoad,
  openingBandLoad,
  pierSelfWeight,
  baseReaction,
  tolerance = DEFAULT_EQUILIBRIUM_TOLERANCE,
}: {
  appliedTopLineLoad: number;
  openingBandLoad: number;
  pierSelfWeight: number;
  baseReaction: number;
  tolerance?: number;
}): {
  demand: number;
  baseReaction: number;
  difference: number;
  ratio: number;
  ok: boolean;
  tolerance: number;
} {
  const demand = appliedTopLineLoad + openingBandLoad + pierSelfWeight;
  const difference = baseReaction - demand;
  const reference = Math.max(Math.abs(demand), 1);
  const ratio = Math.abs(difference) / reference;

  return {
    demand,
    baseReaction,
    difference,
    ratio,
    ok: ratio <= tolerance,
    tolerance,
  };
}

export class AlignmentStaticAnalysis {
  analyze({
    alignment,
    stage = "design",
    options = {},
    sanitizedOpenings = null,
    extractedMembers = null,
    resolvedAlignmentState = null,
  }: AlignmentStaticAnalysisInput = {}): AlignmentStaticAnalysisResult {
    if (!alignment) {
      throw new Error("AlignmentStaticAnalysis requires an alignment model.");
    }

    void extractedMembers;

    const warnings: string[] = [];
    const assumptions: string[] = [
      "Pier tributary top loads follow the requested width rule: gross pier width plus half of each adjacent opening only when that opening is not intercepted by a ring frame.",
      "The masonry band above each opening is transferred to adjacent masonry piers when no ring frame is present, and to ring-frame jambs when the opening is framed in steel.",
      "Lintel beam analysis is optional and does not alter the global equilibrium roll-up; only the transferred masonry-band load is added to pier axial forces in the current release.",
    ];
    const mechanicalState =
      resolvedAlignmentState ??
      resolveAlignmentMechanicalState({
        alignment,
        stage,
        options: options.materialResolution ?? options,
      });
    const resolvedAlignment = mechanicalState.alignment;
    const resolvedSanitizedOpenings =
      sanitizedOpenings ?? sanitizeAlignmentOpenings({ alignment: resolvedAlignment }).openings;
    const extracted = extractEquivalentFrameMembers({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
    });
    const combinationType: string = options.combinationType ?? DEFAULT_COMBINATION_TYPE;
    const wallLineLoads: Record<string, LineLoadResolution> = Object.fromEntries(
      resolvedAlignment.walls.map((wall) => [
        wall.id,
        resolveCombinedLineLoad({
          payload: wall.verticalLineLoad,
          wallId: wall.id,
          combinationType,
          warnings,
        }),
      ]),
    );
    const openingTransferredLoads: Record<
      string,
      OpeningLoadTransfer & { leftPierId: string | null; rightPierId: string | null }
    > = {};
    const additionalPierLoads: Record<string, number> = Object.fromEntries(
      extracted.piers.map((pier) => [pier.id, 0]),
    );
    const ringFrames: RingFrameResult[] = [];

    for (const opening of resolvedSanitizedOpenings) {
      const loadTransfer = computeOpeningTransferredLoads({
        opening,
        alignment: resolvedAlignment,
        wallLineLoads,
        warnings,
      });
      const leftPier = extracted.piers.find(
        (pier) => Math.abs(pier.x + pier.length - opening.x) <= EPS,
      );
      const rightPier = extracted.piers.find(
        (pier) => Math.abs(pier.x - (opening.x + opening.width)) <= EPS,
      );

      openingTransferredLoads[opening.id] = {
        ...loadTransfer,
        leftPierId: leftPier?.id ?? null,
        rightPierId: rightPier?.id ?? null,
      };

      if (opening.ringFrame) {
        ringFrames.push({
          id: `${alignment.id}-ring-frame-${opening.id}`,
          openingId: opening.id,
          topLoad: loadTransfer.topLoad,
          openingBandLoad: loadTransfer.openingBandLoad,
          totalInterceptedLoad: loadTransfer.topLoad + loadTransfer.openingBandLoad,
          leftReaction: (loadTransfer.topLoad + loadTransfer.openingBandLoad) / 2,
          rightReaction: (loadTransfer.topLoad + loadTransfer.openingBandLoad) / 2,
          leftPierId: leftPier?.id ?? null,
          rightPierId: rightPier?.id ?? null,
        });
        continue;
      }

      const transferredLoad = loadTransfer.openingBandLoad;

      if (transferredLoad <= EPS) {
        continue;
      }

      if (leftPier && rightPier) {
        additionalPierLoads[leftPier.id] =
          (additionalPierLoads[leftPier.id] ?? 0) + transferredLoad / 2;
        additionalPierLoads[rightPier.id] =
          (additionalPierLoads[rightPier.id] ?? 0) + transferredLoad / 2;
        continue;
      }

      if (leftPier) {
        additionalPierLoads[leftPier.id] =
          (additionalPierLoads[leftPier.id] ?? 0) + transferredLoad;
        warnings.push(
          `Opening ${opening.id} transfers its opening-band load to the left pier only because no right adjacent pier was found.`,
        );
        continue;
      }

      if (rightPier) {
        additionalPierLoads[rightPier.id] =
          (additionalPierLoads[rightPier.id] ?? 0) + transferredLoad;
        warnings.push(
          `Opening ${opening.id} transfers its opening-band load to the right pier only because no left adjacent pier was found.`,
        );
        continue;
      }

      warnings.push(
        `Opening ${opening.id} could not transfer its opening-band load to adjacent piers because no lateral pier was found.`,
      );
    }

    const pierResults: PierResult[] = extracted.piers.map((pier) => {
      const tributary = resolveTributaryInterval(pier, resolvedSanitizedOpenings);
      const tributaryLoadByWall: Record<string, number> = {};
      for (const wall of resolvedAlignment.walls) {
        const width = Math.max(
          0,
          Math.min(wall.xEnd, tributary.xEnd) - Math.max(wall.xStart, tributary.xStart),
        );
        const value = width > EPS ? width * (wallLineLoads[wall.id]?.value ?? 0) : 0;
        if (Math.abs(value) > EPS) {
          tributaryLoadByWall[wall.id] = value;
        }
      }
      const topDistributedLoad = Object.values(tributaryLoadByWall).reduce(
        (sum, value) => sum + value,
        0,
      );
      const transferredOpeningLoad = additionalPierLoads[pier.id] ?? 0;
      const axialForce = topDistributedLoad + transferredOpeningLoad;
      let verification: JsonRecord | null = null;
      let verificationError: string | null = null;
      let baseReaction = axialForce;
      let selfWeight = 0;

      try {
        const verificationResult = new MasonryPierVerticalVerification().verify({
          model: new MasonryPierModel({
            id: pier.id,
            units: resolvedAlignment.units,
            geometry: {
              height: pier.height,
              length: pier.effectiveLength > EPS ? pier.effectiveLength : pier.length,
              thickness: pier.thickness,
              baseX: pier.x,
              baseY: 0,
            },
            material: pier.material,
            actions: {
              axialForce,
            },
            design: {
              ...DEFAULT_PIER_DESIGN,
              ...(options.pierDesign ?? {}),
            },
          }),
        });
        verification = resultToJson(verificationResult);

        selfWeight = readNumber(read(verificationResult.outputs, "actions"), "selfWeight") ?? 0;
        baseReaction += selfWeight;
      } catch (error: unknown) {
        verificationError = errorMessage(error);
        warnings.push(
          `Pier ${pier.id} could not be verified with the masonry-pier module: ${errorMessage(error)}`,
        );
      }

      return {
        id: pier.id,
        wallId: pier.wallId,
        sourceWallIds: [...pier.sourceWallIds],
        x: pier.x,
        length: pier.length,
        effectiveLength: pier.effectiveLength,
        tributaryInterval: {
          xStart: tributary.xStart,
          xEnd: tributary.xEnd,
        },
        tributaryLoadByWall,
        topDistributedLoad,
        transferredOpeningLoad,
        axialForce,
        selfWeight,
        baseReaction,
        verification,
        verificationError,
      };
    });

    const lintels = analyzeLintels({
      alignment: resolvedAlignment,
      sanitizedOpenings: resolvedSanitizedOpenings,
      openingTransferredLoads,
      combinationType,
      warnings,
    });
    const appliedTopLineLoad = resolvedAlignment.walls.reduce(
      (sum, wall) => sum + (wallLineLoads[wall.id]?.value ?? 0) * wall.length,
      0,
    );
    const openingBandLoad = Object.values(openingTransferredLoads).reduce(
      (sum, loadTransfer) => sum + loadTransfer.openingBandLoad,
      0,
    );
    const pierSelfWeight = pierResults.reduce((sum, pier) => sum + pier.selfWeight, 0);
    const baseReaction =
      pierResults.reduce((sum, pier) => sum + pier.baseReaction, 0) +
      ringFrames.reduce(
        (sum, ringFrame) => sum + ringFrame.leftReaction + ringFrame.rightReaction,
        0,
      );
    const equilibrium = equilibriumCheck({
      appliedTopLineLoad,
      openingBandLoad,
      pierSelfWeight,
      baseReaction,
      tolerance: options.equilibriumToleranceRelative ?? DEFAULT_EQUILIBRIUM_TOLERANCE,
    });
    const lintelStatuses = lintels.map((lintel) => lintel.status);
    const status =
      equilibrium.ok &&
      pierResults.every(
        (pier) => pier.verification && pier.verification.status === RESULT_STATUS.OK,
      ) &&
      lintelStatuses.every(
        (lintelStatus) =>
          lintelStatus === RESULT_STATUS.OK || lintelStatus === RESULT_STATUS.NOT_ANALYZED,
      )
        ? RESULT_STATUS.OK
        : RESULT_STATUS.NOT_VERIFIED;

    return new CalculationResult<AlignmentStaticAnalysisOutputs>({
      applicationId: "masonry-wall-openings",
      status,
      summary:
        "Static vertical analysis of the masonry wall alignment completed with pier tributary loads, optional ring-frame transfers and optional lintel beam checks.",
      outputs: {
        stage,
        combinationType: normalizeCombinationType(combinationType),
        wallLineLoads: Object.fromEntries(
          Object.entries(wallLineLoads).map(([wallId, resolution]) => [
            wallId,
            {
              value: round(resolution.value),
              combinationType: resolution.combinationType,
              leadingVariableId: resolution.leadingVariableId ?? null,
              factors: resolution.factors.map((factor) => ({
                ...factor,
                factor: round(factor.factor),
                contribution: round(factor.contribution),
              })),
            },
          ]),
        ),
        piers: pierResults.map((pier) => ({
          ...pier,
          x: round(pier.x),
          length: round(pier.length),
          effectiveLength: round(pier.effectiveLength),
          tributaryInterval: {
            xStart: round(pier.tributaryInterval.xStart),
            xEnd: round(pier.tributaryInterval.xEnd),
          },
          tributaryLoadByWall: Object.fromEntries(
            Object.entries(pier.tributaryLoadByWall).map(([wallId, value]) => [
              wallId,
              round(value),
            ]),
          ),
          topDistributedLoad: round(pier.topDistributedLoad),
          transferredOpeningLoad: round(pier.transferredOpeningLoad),
          axialForce: round(pier.axialForce),
          selfWeight: round(pier.selfWeight),
          baseReaction: round(pier.baseReaction),
        })),
        ringFrames: ringFrames.map((ringFrame) => ({
          ...ringFrame,
          topLoad: round(ringFrame.topLoad),
          openingBandLoad: round(ringFrame.openingBandLoad),
          totalInterceptedLoad: round(ringFrame.totalInterceptedLoad),
          leftReaction: round(ringFrame.leftReaction),
          rightReaction: round(ringFrame.rightReaction),
        })),
        lintels: lintels.map((lintel) => ({
          ...lintel,
          span: round(lintel.span),
          bearingLength: round(lintel.bearingLength),
          topLoad: round(lintel.topLoad),
          openingBandLoad: round(lintel.openingBandLoad),
          totalAppliedLoad: round(lintel.totalAppliedLoad),
          analysis: lintel.analysis
            ? {
                resultId: lintel.analysis.resultId,
                maxAbsBendingMoment: round(lintel.analysis.maxAbsBendingMoment),
                maxAbsShearForce: round(lintel.analysis.maxAbsShearForce),
                maxAbsVerticalDisplacement: round(lintel.analysis.maxAbsVerticalDisplacement),
              }
            : null,
        })),
        equilibrium: {
          appliedTopLineLoad: round(appliedTopLineLoad),
          openingBandLoad: round(openingBandLoad),
          pierSelfWeight: round(pierSelfWeight),
          baseReaction: round(baseReaction),
          difference: round(equilibrium.difference),
          ratio: round(equilibrium.ratio),
          tolerance: equilibrium.tolerance,
          ok: equilibrium.ok,
        },
      },
      warnings: uniqueStrings([...warnings, ...mechanicalState.warnings]),
      assumptions: uniqueStrings([
        ...assumptions,
        ...mechanicalState.assumptions,
        ...extracted.assumptions,
      ]),
      metadata: {
        stage,
        combinationType: normalizeCombinationType(combinationType),
        mechanicalState: mechanicalState.metadata,
        pierCount: pierResults.length,
        ringFrameCount: ringFrames.length,
        lintelCount: lintels.length,
      },
    });
  }
}
