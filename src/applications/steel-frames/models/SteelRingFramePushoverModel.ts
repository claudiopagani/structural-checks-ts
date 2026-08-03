// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/models/SteelRingFramePushoverModel.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type ForceUnit,
  type LengthUnit,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import type { SteelMaterialOptions } from "../../../domain/materials/SteelMaterial.js";
import type {
  SteelProfileSection,
  SteelProfileSectionOptions,
} from "../../../domain/geometry/SteelProfileSection.js";
import { createSteelProfileSection } from "../../../domain/geometry/createSteelProfileSection.js";
import { createNTC2018StructuralSteelMaterial } from "../../../norms/ntc2018/materials/createNTC2018Material.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;
const DEFAULT_REFERENCE_FORCE = 1;
const DEFAULT_CONTROL_INCREMENT = 1;
const DEFAULT_MAX_CONTROL_DISPLACEMENT = 120;
const DEFAULT_MAX_STEPS = 200;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-2;
const DEFAULT_YIELD_TOLERANCE = 1e-9;
const DEFAULT_BASE_CONDITION = "pinned-base-with-bottom-beam";
const DEFAULT_STEEL_GRADE = "S275";

type UnknownRecord = Record<string, unknown>;
type StructuralSteelGrade = "S235" | "S275" | "S355";
type NormalizedBaseCondition =
  | "fixed-base"
  | "pinned-base-with-bottom-beam"
  | "pinned-base-without-bottom-beam";
type ControlNode = "top-left" | "top-right";

export interface SteelRingFrameGeometryInput extends UnknownRecord {
  clearWidth?: number | null;
  width?: number | null;
  b?: number | null;
  clearHeight?: number | null;
  height?: number | null;
  h?: number | null;
  originX?: number | null;
  x?: number | null;
  originY?: number | null;
  y?: number | null;
}

export interface SteelRingFrameLoadingInput extends UnknownRecord {
  referenceHorizontalForce?: number | null;
  horizontalForce?: number | null;
  Fh?: number | null;
  controlNode?: string | null;
}

export interface SteelRingFrameSolverInput extends UnknownRecord {
  controlDisplacementIncrement?: number | null;
  controlIncrement?: number | null;
  cost?: number | null;
  maxControlDisplacement?: number | null;
  maxDisplacement?: number | null;
  tolerance?: number | null;
  toll?: number | null;
  maxIterations?: number | null;
  itemax?: number | null;
  maxSteps?: number | null;
  yieldTolerance?: number | null;
}

export interface SteelRingFrameMaterialInput extends UnknownRecord {
  id?: string | null;
  name?: string;
  category?: string;
  grade?: string;
  fyMean?: number | null;
  ftMean?: number | null;
  fyk?: number | null;
  fyd?: number | null;
  ftk?: number | null;
  ductilityClass?: string | null;
  elongationCharacteristic?: number | null;
  ultimateStrain?: number | null;
  density?: number | null;
  elasticModulus?: number | null;
  shearModulus?: number | null;
  poissonRatio?: number | null;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
  gammaM0?: number | null;
}

export type SteelRingFrameSectionInput =
  | SteelProfileSection
  | SteelProfileSectionOptions
  | string
  | null
  | undefined;

export interface SteelRingFrameMemberSectionsInput extends UnknownRecord {
  leftColumn?: SteelRingFrameSectionInput;
  rightColumn?: SteelRingFrameSectionInput;
  columns?: SteelRingFrameSectionInput;
  column?: SteelRingFrameSectionInput;
  topBeam?: SteelRingFrameSectionInput;
  architrave?: SteelRingFrameSectionInput;
  bottomBeam?: SteelRingFrameSectionInput;
  bottomChord?: SteelRingFrameSectionInput;
}

export interface SteelRingFrameMemberOrientation extends UnknownRecord {
  axis: "y" | "z";
  label: string;
  rotationDegrees: number;
  mounting: string | null;
  source: string;
}

export type SteelRingFrameMemberOrientationInput = string | UnknownRecord | null | undefined;

export interface SteelRingFrameMemberOrientationsInput extends UnknownRecord {
  leftColumn?: SteelRingFrameMemberOrientationInput;
  rightColumn?: SteelRingFrameMemberOrientationInput;
  columns?: SteelRingFrameMemberOrientationInput;
  column?: SteelRingFrameMemberOrientationInput;
  piers?: SteelRingFrameMemberOrientationInput;
  topBeam?: SteelRingFrameMemberOrientationInput;
  architrave?: SteelRingFrameMemberOrientationInput;
  bottomBeam?: SteelRingFrameMemberOrientationInput;
  bottomChord?: SteelRingFrameMemberOrientationInput;
}

export interface SteelRingFramePushoverModelOptions {
  id: string | number | bigint;
  units?: UnitSystemInput | null;
  geometry?: SteelRingFrameGeometryInput;
  memberSections?: SteelRingFrameMemberSectionsInput;
  memberOrientations?: SteelRingFrameMemberOrientationsInput;
  material?: SteelMaterial | SteelRingFrameMaterialInput | string | null;
  baseCondition?: string | null;
  includeBottomBeam?: boolean | null;
  loading?: SteelRingFrameLoadingInput;
  solver?: SteelRingFrameSolverInput;
  metadata?: Record<string, unknown>;
}

export interface SteelRingFrameGeometry {
  clearWidth: number;
  clearHeight: number;
  originX: number | null | undefined;
  originY: number | null | undefined;
}

export interface SteelRingFrameLoading {
  referenceHorizontalForce: number;
  controlNode: ControlNode;
  controlDof: "ux";
}

export interface SteelRingFrameSolver {
  controlDisplacementIncrement: number;
  maxControlDisplacement: number;
  tolerance: number;
  maxIterations: number;
  maxSteps: number;
  yieldTolerance: number;
}

export interface SteelRingFrameMemberSections {
  leftColumn: unknown;
  rightColumn: unknown;
  topBeam: unknown;
  bottomBeam: unknown;
}

export interface SteelRingFrameMemberOrientations {
  leftColumn: SteelRingFrameMemberOrientation;
  rightColumn: SteelRingFrameMemberOrientation;
  topBeam: SteelRingFrameMemberOrientation;
  bottomBeam: SteelRingFrameMemberOrientation;
}

export interface SteelRingFramePushoverModelJson {
  id: string | number | bigint;
  units: UnitSystem;
  geometry: SteelRingFrameGeometry;
  baseCondition: NormalizedBaseCondition;
  includeBottomBeam: boolean;
  material: unknown;
  memberSections: SteelRingFrameMemberSections;
  memberOrientations: SteelRingFrameMemberOrientations;
  loading: SteelRingFrameLoading;
  solver: SteelRingFrameSolver;
  metadata: Record<string, unknown>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function property(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return Object.prototype.toString.call(value);
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return value.toString();
  }
  return Object.prototype.toString.call(value);
}

function numericProperty(value: unknown, key: string, fallback: number): number {
  const candidate = property(value, key);
  return typeof candidate === "number" ? candidate : fallback;
}

function nullableNumericProperty(value: unknown, key: string): number | null {
  const candidate = property(value, key);
  return typeof candidate === "number" ? candidate : null;
}

function stringProperty(value: unknown, key: string): string | undefined {
  const candidate = property(value, key);
  return typeof candidate === "string" ? candidate : undefined;
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "symbol") {
    throw new TypeError("Cannot convert a Symbol value to a string");
  }

  return String(value);
}

function isForceUnit(value: unknown): value is ForceUnit {
  return value === "N" || value === "kN" || value === "MN";
}

function isLengthUnit(value: unknown): value is LengthUnit {
  return value === "m" || value === "dm" || value === "cm" || value === "mm";
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`SteelRingFramePushoverModel requires a positive ${label}.`);
  }
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`SteelRingFramePushoverModel requires a finite ${label}.`);
  }
}

function normalizeBaseCondition(value: unknown = DEFAULT_BASE_CONDITION): NormalizedBaseCondition {
  const normalized = stringValue(value).trim().toLowerCase();

  const aliases = new Map<string, NormalizedBaseCondition>([
    ["fixed", "fixed-base"],
    ["fixed-base", "fixed-base"],
    ["incastrato", "fixed-base"],
    ["incastrati", "fixed-base"],
    ["columns-fixed", "fixed-base"],
    ["pinned-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["pinned-base-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["hinged-with-bottom-beam", "pinned-base-with-bottom-beam"],
    ["incernierato-con-traverso", "pinned-base-with-bottom-beam"],
    ["incernierati-con-traverso", "pinned-base-with-bottom-beam"],
    ["pinned-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["pinned-base-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["hinged-without-bottom-beam", "pinned-base-without-bottom-beam"],
    ["incernierato-senza-traverso", "pinned-base-without-bottom-beam"],
    ["incernierati-senza-traverso", "pinned-base-without-bottom-beam"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(
      `Unsupported steel ring frame baseCondition: ${stringifyTemplateValue(value)}.`,
    );
  }

  return resolved;
}

function normalizeControlNode(value: unknown = "top-left"): ControlNode {
  const normalized = stringValue(value).trim().toLowerCase();

  const aliases = new Map<string, ControlNode>([
    ["top-left", "top-left"],
    ["left-top", "top-left"],
    ["architrave-left", "top-left"],
    ["top-right", "top-right"],
    ["right-top", "top-right"],
    ["architrave-right", "top-right"],
  ]);

  const resolved = aliases.get(normalized);

  if (!resolved) {
    throw new Error(`Unsupported steel ring frame control node: ${stringifyTemplateValue(value)}.`);
  }

  return resolved;
}

function normalizeSectionInput(
  sectionLike: unknown,
  units: UnitSystemInput | null | undefined,
  fallbackProfileName: string | null | undefined,
): unknown {
  if (property(sectionLike, "profileName")) {
    return sectionLike;
  }

  if (typeof sectionLike === "string") {
    return createSteelProfileSection({
      profileName: sectionLike,
      units,
    });
  }

  if (
    property(sectionLike, "profileName") == null &&
    property(sectionLike, "name") == null &&
    fallbackProfileName
  ) {
    return createSteelProfileSection({
      profileName: fallbackProfileName,
      units,
    });
  }

  if (property(sectionLike, "profileName") == null && property(sectionLike, "profileName") !== "") {
    if (
      property(sectionLike, "profileName") === undefined &&
      property(sectionLike, "catalogProperties") == null
    ) {
      throw new Error(
        "Steel ring frame sections must be section instances or profile-name strings.",
      );
    }
  }

  return sectionLike;
}

function normalizeUnits(value: unknown): UnitSystemInput | null | undefined {
  if (value == null) {
    return value;
  }

  if (!isRecord(value)) {
    return {};
  }

  const force = value.force;
  if (force !== undefined && !isForceUnit(force)) {
    throw new Error(`Unsupported force unit: ${stringifyTemplateValue(force)}.`);
  }

  const length = value.length;
  if (length !== undefined && !isLengthUnit(length)) {
    throw new Error(`Unsupported length unit: ${stringifyTemplateValue(length)}.`);
  }

  const result: UnitSystemInput = {};
  if (force !== undefined) result.force = force;
  if (length !== undefined) result.length = length;
  return result;
}

function normalizeSteelMaterial(
  materialLike: SteelMaterial | SteelRingFrameMaterialInput | string | null | undefined,
  units: UnitSystemInput | null | undefined,
  defaultGrade: StructuralSteelGrade = DEFAULT_STEEL_GRADE,
): SteelMaterial {
  if (materialLike instanceof SteelMaterial) {
    return materialLike;
  }

  if (
    isRecord(materialLike) &&
    (materialLike.category === "steel" || materialLike.fyd != null || materialLike.fyk != null)
  ) {
    const materialOptions: SteelMaterialOptions = {
      id: typeof materialLike.id === "string" || materialLike.id === null ? materialLike.id : null,
      name: typeof materialLike.name === "string" ? materialLike.name : "",
      grade: typeof materialLike.grade === "string" ? materialLike.grade : "",
      fyMean: typeof materialLike.fyMean === "number" ? materialLike.fyMean : null,
      ftMean: typeof materialLike.ftMean === "number" ? materialLike.ftMean : null,
      fyk: typeof materialLike.fyk === "number" ? materialLike.fyk : null,
      fyd: typeof materialLike.fyd === "number" ? materialLike.fyd : null,
      ftk: typeof materialLike.ftk === "number" ? materialLike.ftk : null,
      ductilityClass:
        typeof materialLike.ductilityClass === "string" ? materialLike.ductilityClass : null,
      elongationCharacteristic:
        typeof materialLike.elongationCharacteristic === "number"
          ? materialLike.elongationCharacteristic
          : null,
      ultimateStrain:
        typeof materialLike.ultimateStrain === "number" ? materialLike.ultimateStrain : null,
      density: typeof materialLike.density === "number" ? materialLike.density : null,
      elasticModulus:
        typeof materialLike.elasticModulus === "number" ? materialLike.elasticModulus : null,
      shearModulus:
        typeof materialLike.shearModulus === "number" ? materialLike.shearModulus : null,
      poissonRatio:
        typeof materialLike.poissonRatio === "number" ? materialLike.poissonRatio : null,
      units: normalizeUnits(materialLike.units) ?? INTERNAL_UNITS,
      metadata: isRecord(materialLike.metadata) ? materialLike.metadata : {},
    };

    return new SteelMaterial(materialOptions);
  }

  if (typeof materialLike === "string" || materialLike == null) {
    return createStructuralSteelMaterial({
      grade: materialLike ?? defaultGrade,
      units,
    });
  }

  const materialMetadata = property(materialLike, "metadata");
  return createStructuralSteelMaterial({
    grade: property(materialLike, "grade") ?? defaultGrade,
    gammaM0: numericProperty(materialLike, "gammaM0", 1.05),
    elasticModulus: nullableNumericProperty(materialLike, "elasticModulus"),
    density: numericProperty(materialLike, "density", 7850),
    units,
    metadata: isRecord(materialMetadata) ? { ...materialMetadata } : {},
  });
}

function isStructuralSteelGrade(value: unknown): value is StructuralSteelGrade {
  return value === "S235" || value === "S275" || value === "S355";
}

function createStructuralSteelMaterial({
  grade,
  gammaM0 = 1.05,
  density = 7850,
  elasticModulus = null,
  units,
  metadata = {},
}: {
  grade: unknown;
  gammaM0?: number | null;
  density?: number;
  elasticModulus?: number | null;
  units: UnitSystemInput | null | undefined;
  metadata?: Record<string, unknown>;
}): SteelMaterial {
  assertExplicitUnitSystem(units, "createNTC2018StructuralSteelMaterial");

  if (!isStructuralSteelGrade(grade)) {
    throw new Error(
      `Unsupported NTC 2018 structural steel grade: ${stringifyTemplateValue(grade)}.`,
    );
  }

  return createNTC2018StructuralSteelMaterial({
    grade,
    gammaM0: gammaM0 ?? 1.05,
    density,
    elasticModulus,
    units: units ?? null,
    metadata,
  });
}

function normalizeProfiles({
  memberSections = {},
  units,
}: {
  memberSections?: SteelRingFrameMemberSectionsInput;
  units: UnitSystemInput | null | undefined;
}): SteelRingFrameMemberSections {
  const leftColumn = normalizeSectionInput(
    memberSections.leftColumn ?? memberSections.columns ?? memberSections.column ?? "IPE100",
    units,
    "IPE100",
  );
  const rightColumn = normalizeSectionInput(
    memberSections.rightColumn ?? memberSections.columns ?? memberSections.column ?? leftColumn,
    units,
    stringProperty(leftColumn, "profileName") ?? "IPE100",
  );
  const topBeam = normalizeSectionInput(
    memberSections.topBeam ?? memberSections.architrave ?? "IPE100",
    units,
    "IPE100",
  );
  const bottomBeam = normalizeSectionInput(
    memberSections.bottomBeam ?? memberSections.bottomChord ?? topBeam,
    units,
    stringProperty(topBeam, "profileName") ?? "IPE100",
  );

  return {
    leftColumn,
    rightColumn,
    topBeam,
    bottomBeam,
  };
}

function profileFamily(section: unknown): string {
  return stringValue(property(section, "family") ?? property(section, "profileName"))
    .trim()
    .toUpperCase();
}

function normalizeOrientationAlias(value: unknown): "y" | "z" {
  const normalized = stringValue(value).trim().toLowerCase();

  if (
    [
      "weak",
      "minor",
      "z",
      "inertiaz",
      "weak-axis",
      "weak-axis-in-plane",
      "asse-debole",
      "asse-debole-nel-piano",
      "rotated-90",
      "rotate-90",
      "90",
      "upn-open-side-up",
      "open-side-up",
      "web-up",
      "lato-senza-labbri-up",
      "lato-senza-labbri-verso-alto",
    ].includes(normalized)
  ) {
    return "z";
  }

  return "y";
}

function normalizeMemberOrientationInput(
  input: unknown,
  fallback: SteelRingFrameMemberOrientation,
): SteelRingFrameMemberOrientation {
  if (input == null) {
    return fallback;
  }

  if (typeof input === "string") {
    const axis = normalizeOrientationAlias(input);

    return {
      ...fallback,
      axis,
      label: axis === "z" ? "weak-axis-in-plane" : "strong-axis-in-plane",
      rotationDegrees: axis === "z" ? 90 : 0,
      mounting:
        input.toLowerCase().includes("open-side-up") ||
        input.toLowerCase().includes("web-up") ||
        input.toLowerCase().includes("labbri")
          ? "open-side-up"
          : (fallback.mounting ?? null),
      source: "explicit",
    };
  }

  const explicitAxis =
    property(input, "axis") ??
    property(input, "inPlaneAxis") ??
    property(input, "bendingAxis") ??
    property(input, "bendingInertiaAxis") ??
    null;
  const rotation =
    property(input, "rotationDegrees") ??
    property(input, "rotation") ??
    property(input, "localAxisRotation") ??
    null;
  const numericRotation = Number(rotation);
  const axis =
    explicitAxis != null
      ? normalizeOrientationAlias(explicitAxis)
      : Number.isFinite(numericRotation) && Math.abs(numericRotation % 180) === 90
        ? "z"
        : (fallback.axis ?? "y");
  const label = property(input, "label") ?? property(input, "orientation");
  const mounting =
    property(input, "mounting") ??
    property(input, "openSide") ??
    property(input, "webSide") ??
    fallback.mounting ??
    null;

  return {
    ...fallback,
    axis,
    label:
      typeof label === "string"
        ? label
        : axis === "z"
          ? "weak-axis-in-plane"
          : "strong-axis-in-plane",
    rotationDegrees: Number.isFinite(numericRotation)
      ? numericRotation
      : property(input, "rotate90")
        ? 90
        : axis === "z"
          ? 90
          : 0,
    mounting: typeof mounting === "string" ? mounting : null,
    source: "explicit",
  };
}

function defaultMemberOrientation(
  memberKey: string,
  section: unknown,
): SteelRingFrameMemberOrientation {
  const family = profileFamily(section);

  if (memberKey === "bottomBeam" && family.startsWith("UPN")) {
    return {
      axis: "z",
      label: "upn-open-side-up",
      rotationDegrees: 90,
      mounting: "open-side-up",
      source: "default-upn-bottom-beam",
    };
  }

  return {
    axis: "y",
    label: "strong-axis-in-plane",
    rotationDegrees: 0,
    mounting: null,
    source: "default-strong-axis",
  };
}

function normalizeMemberOrientations({
  memberOrientations = {},
  memberSections,
}: {
  memberOrientations?: SteelRingFrameMemberOrientationsInput;
  memberSections: SteelRingFrameMemberSections;
}): SteelRingFrameMemberOrientations {
  const input = memberOrientations ?? {};
  const columnInput = input.columns ?? input.column ?? input.piers ?? null;

  return {
    leftColumn: normalizeMemberOrientationInput(
      input.leftColumn ?? columnInput,
      defaultMemberOrientation("leftColumn", memberSections.leftColumn),
    ),
    rightColumn: normalizeMemberOrientationInput(
      input.rightColumn ?? columnInput,
      defaultMemberOrientation("rightColumn", memberSections.rightColumn),
    ),
    topBeam: normalizeMemberOrientationInput(
      input.topBeam ?? input.architrave,
      defaultMemberOrientation("topBeam", memberSections.topBeam),
    ),
    bottomBeam: normalizeMemberOrientationInput(
      input.bottomBeam ?? input.bottomChord,
      defaultMemberOrientation("bottomBeam", memberSections.bottomBeam),
    ),
  };
}

interface JsonCapable {
  toJSON: () => unknown;
}

function isJsonCapable(value: unknown): value is JsonCapable {
  return isRecord(value) && typeof value.toJSON === "function";
}

function jsonValue(value: unknown): unknown {
  if (isJsonCapable(value)) {
    return value.toJSON();
  }

  return value;
}

export class SteelRingFramePushoverModel {
  id: string | number | bigint;
  units: UnitSystem;
  geometry: SteelRingFrameGeometry;
  baseCondition: NormalizedBaseCondition;
  includeBottomBeam: boolean;
  material: SteelMaterial;
  memberSections: SteelRingFrameMemberSections;
  memberOrientations: SteelRingFrameMemberOrientations;
  loading: SteelRingFrameLoading;
  solver: SteelRingFrameSolver;
  metadata: Record<string, unknown>;

  constructor({
    id,
    units = null,
    geometry = {},
    memberSections = {},
    memberOrientations = {},
    material = null,
    baseCondition = DEFAULT_BASE_CONDITION,
    includeBottomBeam = null,
    loading = {},
    solver = {},
    metadata = {},
  }: SteelRingFramePushoverModelOptions) {
    if (!id) {
      throw new Error("A steel ring frame pushover model id is required.");
    }

    assertExplicitUnitSystem(units, "SteelRingFramePushoverModel");
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedBaseCondition = normalizeBaseCondition(baseCondition);
    const resolvedIncludeBottomBeam =
      includeBottomBeam == null
        ? resolvedBaseCondition !== "pinned-base-without-bottom-beam" &&
          resolvedBaseCondition !== "fixed-base"
        : Boolean(includeBottomBeam);
    const width = unitResolver.length(geometry.clearWidth ?? geometry.width ?? geometry.b);
    const height = unitResolver.length(geometry.clearHeight ?? geometry.height ?? geometry.h);

    assertPositive(width, "geometry.clearWidth");
    assertPositive(height, "geometry.clearHeight");

    this.id = id;
    this.units = INTERNAL_UNITS;
    this.geometry = {
      clearWidth: width,
      clearHeight: height,
      originX: unitResolver.length(geometry.originX ?? geometry.x ?? 0),
      originY: unitResolver.length(geometry.originY ?? geometry.y ?? 0),
    };
    this.baseCondition = resolvedBaseCondition;
    this.includeBottomBeam = resolvedIncludeBottomBeam;
    this.material = normalizeSteelMaterial(material, units);
    this.memberSections = normalizeProfiles({
      memberSections,
      units,
    });
    this.memberOrientations = normalizeMemberOrientations({
      memberOrientations,
      memberSections: this.memberSections,
    });
    this.loading = {
      referenceHorizontalForce: unitResolver.force(
        loading.referenceHorizontalForce ??
          loading.horizontalForce ??
          loading.Fh ??
          DEFAULT_REFERENCE_FORCE,
      ),
      controlNode: normalizeControlNode(loading.controlNode),
      controlDof: "ux",
    };
    this.solver = {
      controlDisplacementIncrement: unitResolver.length(
        solver.controlDisplacementIncrement ??
          solver.controlIncrement ??
          solver.cost ??
          DEFAULT_CONTROL_INCREMENT,
      ),
      maxControlDisplacement: unitResolver.length(
        solver.maxControlDisplacement ?? solver.maxDisplacement ?? DEFAULT_MAX_CONTROL_DISPLACEMENT,
      ),
      tolerance: solver.tolerance ?? solver.toll ?? DEFAULT_TOLERANCE,
      maxIterations: solver.maxIterations ?? solver.itemax ?? DEFAULT_MAX_ITERATIONS,
      maxSteps: solver.maxSteps ?? DEFAULT_MAX_STEPS,
      yieldTolerance: solver.yieldTolerance ?? DEFAULT_YIELD_TOLERANCE,
    };
    this.metadata = {
      ...metadata,
      analysisType: "steel-ring-frame-pushover",
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: unitResolver.sourceUnitSystem,
    };

    assertPositive(this.loading.referenceHorizontalForce, "loading.referenceHorizontalForce");
    assertPositive(this.solver.controlDisplacementIncrement, "solver.controlDisplacementIncrement");
    assertPositive(this.solver.maxControlDisplacement, "solver.maxControlDisplacement");
    assertFinite(this.solver.tolerance, "solver.tolerance");
    assertPositive(this.solver.maxIterations, "solver.maxIterations");
    assertPositive(this.solver.maxSteps, "solver.maxSteps");
    assertPositive(this.solver.yieldTolerance, "solver.yieldTolerance");
  }

  topNodeId(): string {
    return this.loading.controlNode === "top-right" ? `${this.id}-tr` : `${this.id}-tl`;
  }

  sourceUnits(): UnitSystem | null {
    const sourceUnitSystem = this.metadata.sourceUnitSystem;
    if (
      !isRecord(sourceUnitSystem) ||
      !isForceUnit(sourceUnitSystem.force) ||
      !isLengthUnit(sourceUnitSystem.length)
    ) {
      return null;
    }

    return {
      force: sourceUnitSystem.force,
      length: sourceUnitSystem.length,
    };
  }

  toJSON(): SteelRingFramePushoverModelJson {
    return {
      id: this.id,
      units: { ...this.units },
      geometry: { ...this.geometry },
      baseCondition: this.baseCondition,
      includeBottomBeam: this.includeBottomBeam,
      material: jsonValue(this.material),
      memberSections: {
        leftColumn: jsonValue(this.memberSections.leftColumn),
        rightColumn: jsonValue(this.memberSections.rightColumn),
        topBeam: jsonValue(this.memberSections.topBeam),
        bottomBeam: jsonValue(this.memberSections.bottomBeam),
      },
      memberOrientations: {
        leftColumn: { ...this.memberOrientations.leftColumn },
        rightColumn: { ...this.memberOrientations.rightColumn },
        topBeam: { ...this.memberOrientations.topBeam },
        bottomBeam: { ...this.memberOrientations.bottomBeam },
      },
      loading: { ...this.loading },
      solver: { ...this.solver },
      metadata: { ...this.metadata },
    };
  }
}
