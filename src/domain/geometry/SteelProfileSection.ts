// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/geometry/SteelProfileSection.js.

import { createUnitResolver, type UnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import { CrossSection, type CrossSectionJson, type SectionMetadata } from "./CrossSection.js";
import {
  STEEL_PROFILE_CATALOG_UNITS,
  getSteelProfileSectionData,
  type SteelProfileSectionData,
} from "./steelProfileCatalog.js";

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" }) satisfies UnitSystem;

type NumericValue = number | null | undefined;

interface SteelProfileSectionConvertedData extends SteelProfileSectionData {
  A: number;
  Av_y: number;
  Av_z: number;
  IT: number;
  I_strong: number;
  I_weak: number;
  Iw: number;
  Iy: number;
  Iz: number;
  WT: number;
  Wel_strong: number;
  Wel_weak: number;
  Wel_y: number;
  Wel_z: number;
  Wpl_strong: number;
  Wpl_weak: number;
  Wpl_y: number;
  Wpl_z: number;
  Ww: number;
  b: number;
  h: number;
  iy: number;
  iz: number;
  perimeter: number;
  r: number;
  tf: number;
  tw: number;
}

export interface SteelProfileSectionOptions {
  profileName?: string | null | undefined;
  id?: string | null;
  name?: string | null;
  profileData?: SteelProfileSectionData | null;
  units?: UnitSystemInput | null | undefined;
  metadata?: SectionMetadata;
  area?: NumericValue;
  inertiaY?: NumericValue;
  inertiaZ?: NumericValue;
  torsionalConstant?: NumericValue;
  shearAreaY?: NumericValue;
  shearAreaZ?: NumericValue;
  height?: NumericValue;
  width?: NumericValue;
  webThickness?: NumericValue;
  flangeThickness?: NumericValue;
  rootRadius?: NumericValue;
  massPerLength?: NumericValue;
  perimeter?: NumericValue;
  warpingConstant?: NumericValue;
  torsionalSectionModulus?: NumericValue;
  warpingSectionModulus?: NumericValue;
  radiusOfGyrationY?: NumericValue;
  radiusOfGyrationZ?: NumericValue;
  elasticSectionModulusY?: NumericValue;
  elasticSectionModulusZ?: NumericValue;
  plasticSectionModulusY?: NumericValue;
  plasticSectionModulusZ?: NumericValue;
}

export interface SteelProfileSectionJson extends CrossSectionJson {
  profileName: string | null | undefined;
  family: string | null;
  height: number | null;
  width: number | null;
  webThickness: number | null;
  flangeThickness: number | null;
  rootRadius: number | null;
  massPerLength: number | null;
  perimeter: number | null;
  warpingConstant: number | null;
  torsionalSectionModulus: number | null;
  warpingSectionModulus: number | null;
  radiusOfGyrationY: number | null;
  radiusOfGyrationZ: number | null;
  elasticSectionModulusY: number | null;
  elasticSectionModulusZ: number | null;
  plasticSectionModulusY: number | null;
  plasticSectionModulusZ: number | null;
  catalogProperties: SteelProfileSectionData;
  convertedCatalogProperties: SteelProfileSectionConvertedData;
}

function firstDefined(...values: NumericValue[]): NumericValue {
  return values.find((value) => value !== undefined);
}

function convertCatalogData(data: SteelProfileSectionData): SteelProfileSectionConvertedData {
  const resolver = createUnitResolver(STEEL_PROFILE_CATALOG_UNITS, INTERNAL_UNITS);

  return {
    ...data,
    A: resolver.area(data.A),
    Av_y: resolver.area(data.Av_y),
    Av_z: resolver.area(data.Av_z),
    IT: resolver.inertia(data.IT),
    Iw: resolver.convert(data.Iw, { lengthExponent: 6 }),
    I_strong: resolver.inertia(data.I_strong),
    I_weak: resolver.inertia(data.I_weak),
    Iy: resolver.inertia(data.Iy),
    Iz: resolver.inertia(data.Iz),
    Wel_strong: resolver.sectionModulus(data.Wel_strong),
    Wel_weak: resolver.sectionModulus(data.Wel_weak),
    Wel_y: resolver.sectionModulus(data.Wel_y),
    Wel_z: resolver.sectionModulus(data.Wel_z),
    Wpl_strong: resolver.sectionModulus(data.Wpl_strong),
    Wpl_weak: resolver.sectionModulus(data.Wpl_weak),
    Wpl_y: resolver.sectionModulus(data.Wpl_y),
    Wpl_z: resolver.sectionModulus(data.Wpl_z),
    WT: resolver.sectionModulus(data.WT),
    Ww: resolver.sectionModulus(data.Ww),
    b: resolver.length(data.b),
    h: resolver.length(data.h),
    iy: resolver.length(data.iy),
    iz: resolver.length(data.iz),
    perimeter: resolver.length(data.perimeter),
    r: resolver.length(data.r),
    tf: resolver.length(data.tf),
    tw: resolver.length(data.tw),
  };
}

function convertOverrides(
  overrides: SteelProfileSectionOptions,
  units: UnitSystemInput | null | undefined,
): SteelProfileSectionOptions {
  const resolver = createUnitResolver(units, INTERNAL_UNITS);

  return {
    ...overrides,
    area: overrides.area == null ? overrides.area : resolver.area(overrides.area),
    inertiaY:
      overrides.inertiaY == null ? overrides.inertiaY : resolver.inertia(overrides.inertiaY),
    inertiaZ:
      overrides.inertiaZ == null ? overrides.inertiaZ : resolver.inertia(overrides.inertiaZ),
    torsionalConstant:
      overrides.torsionalConstant == null
        ? overrides.torsionalConstant
        : resolver.inertia(overrides.torsionalConstant),
    warpingConstant:
      overrides.warpingConstant == null
        ? overrides.warpingConstant
        : resolver.convert(overrides.warpingConstant, { lengthExponent: 6 }),
    shearAreaY:
      overrides.shearAreaY == null ? overrides.shearAreaY : resolver.area(overrides.shearAreaY),
    shearAreaZ:
      overrides.shearAreaZ == null ? overrides.shearAreaZ : resolver.area(overrides.shearAreaZ),
    height: overrides.height == null ? overrides.height : resolver.length(overrides.height),
    width: overrides.width == null ? overrides.width : resolver.length(overrides.width),
    webThickness:
      overrides.webThickness == null
        ? overrides.webThickness
        : resolver.length(overrides.webThickness),
    flangeThickness:
      overrides.flangeThickness == null
        ? overrides.flangeThickness
        : resolver.length(overrides.flangeThickness),
    rootRadius:
      overrides.rootRadius == null ? overrides.rootRadius : resolver.length(overrides.rootRadius),
    perimeter:
      overrides.perimeter == null ? overrides.perimeter : resolver.length(overrides.perimeter),
    radiusOfGyrationY:
      overrides.radiusOfGyrationY == null
        ? overrides.radiusOfGyrationY
        : resolver.length(overrides.radiusOfGyrationY),
    radiusOfGyrationZ:
      overrides.radiusOfGyrationZ == null
        ? overrides.radiusOfGyrationZ
        : resolver.length(overrides.radiusOfGyrationZ),
    elasticSectionModulusY:
      overrides.elasticSectionModulusY == null
        ? overrides.elasticSectionModulusY
        : resolver.sectionModulus(overrides.elasticSectionModulusY),
    elasticSectionModulusZ:
      overrides.elasticSectionModulusZ == null
        ? overrides.elasticSectionModulusZ
        : resolver.sectionModulus(overrides.elasticSectionModulusZ),
    plasticSectionModulusY:
      overrides.plasticSectionModulusY == null
        ? overrides.plasticSectionModulusY
        : resolver.sectionModulus(overrides.plasticSectionModulusY),
    plasticSectionModulusZ:
      overrides.plasticSectionModulusZ == null
        ? overrides.plasticSectionModulusZ
        : resolver.sectionModulus(overrides.plasticSectionModulusZ),
    torsionalSectionModulus:
      overrides.torsionalSectionModulus == null
        ? overrides.torsionalSectionModulus
        : resolver.sectionModulus(overrides.torsionalSectionModulus),
    warpingSectionModulus:
      overrides.warpingSectionModulus == null
        ? overrides.warpingSectionModulus
        : resolver.sectionModulus(overrides.warpingSectionModulus),
  };
}

export class SteelProfileSection extends CrossSection {
  declare profileName: string | null | undefined;
  declare family: string | null;
  declare height: number | null;
  declare width: number | null;
  declare webThickness: number | null;
  declare flangeThickness: number | null;
  declare rootRadius: number | null;
  declare massPerLength: number | null;
  declare perimeter: number | null;
  declare warpingConstant: number | null;
  declare torsionalSectionModulus: number | null;
  declare warpingSectionModulus: number | null;
  declare radiusOfGyrationY: number | null;
  declare radiusOfGyrationZ: number | null;
  declare elasticSectionModulusY: number | null;
  declare elasticSectionModulusZ: number | null;
  declare plasticSectionModulusY: number | null;
  declare plasticSectionModulusZ: number | null;
  declare catalogProperties: SteelProfileSectionData;
  declare convertedCatalogProperties: SteelProfileSectionConvertedData;

  constructor({
    profileName,
    id = profileName,
    name = profileName,
    profileData = null,
    units = null,
    metadata = {},
    ...overrides
  }: SteelProfileSectionOptions) {
    const rawData =
      profileData ?? (profileName == null ? null : getSteelProfileSectionData(profileName));

    if (!rawData) {
      throw new Error(`Unsupported steel profile section: ${profileName}.`);
    }

    const data = convertCatalogData(rawData);
    const resolvedOverrides = convertOverrides(overrides, units);
    const area = firstDefined(resolvedOverrides.area, data.A) ?? null;

    if (area == null) {
      throw new Error("A positive cross-section area is required.");
    }

    super({
      id: id ?? null,
      name: name ?? "",
      area,
      inertiaY: firstDefined(resolvedOverrides.inertiaY, data.Iy, data.I_strong, null) ?? null,
      inertiaZ: firstDefined(resolvedOverrides.inertiaZ, data.Iz, data.I_weak, null) ?? null,
      torsionalConstant: firstDefined(resolvedOverrides.torsionalConstant, data.IT, null) ?? null,
      shearAreaY: firstDefined(resolvedOverrides.shearAreaY, data.Av_y, null) ?? null,
      shearAreaZ: firstDefined(resolvedOverrides.shearAreaZ, data.Av_z, null) ?? null,
      units: INTERNAL_UNITS,
      metadata: {
        ...metadata,
        profileName,
        family: data.family,
        source: "steel_profile_section_database",
        catalogUnitSystem: STEEL_PROFILE_CATALOG_UNITS,
        sourceUnitSystem: units,
      },
    });

    this.profileName = profileName;
    this.family = data.family ?? null;
    this.height = firstDefined(resolvedOverrides.height, data.h, null) ?? null;
    this.width = firstDefined(resolvedOverrides.width, data.b, null) ?? null;
    this.webThickness = firstDefined(resolvedOverrides.webThickness, data.tw, null) ?? null;
    this.flangeThickness = firstDefined(resolvedOverrides.flangeThickness, data.tf, null) ?? null;
    this.rootRadius = firstDefined(resolvedOverrides.rootRadius, data.r, null) ?? null;
    this.massPerLength = firstDefined(overrides.massPerLength, data.mass_per_length, null) ?? null;
    this.perimeter = firstDefined(resolvedOverrides.perimeter, data.perimeter, null) ?? null;
    this.warpingConstant = firstDefined(resolvedOverrides.warpingConstant, data.Iw, null) ?? null;
    this.torsionalSectionModulus =
      firstDefined(resolvedOverrides.torsionalSectionModulus, data.WT, null) ?? null;
    this.warpingSectionModulus =
      firstDefined(resolvedOverrides.warpingSectionModulus, data.Ww, null) ?? null;
    this.radiusOfGyrationY =
      firstDefined(resolvedOverrides.radiusOfGyrationY, data.iy, null) ?? null;
    this.radiusOfGyrationZ =
      firstDefined(resolvedOverrides.radiusOfGyrationZ, data.iz, null) ?? null;
    this.elasticSectionModulusY =
      firstDefined(resolvedOverrides.elasticSectionModulusY, data.Wel_y, data.Wel_strong, null) ??
      null;
    this.elasticSectionModulusZ =
      firstDefined(resolvedOverrides.elasticSectionModulusZ, data.Wel_z, data.Wel_weak, null) ??
      null;
    this.plasticSectionModulusY =
      firstDefined(resolvedOverrides.plasticSectionModulusY, data.Wpl_y, data.Wpl_strong, null) ??
      null;
    this.plasticSectionModulusZ =
      firstDefined(resolvedOverrides.plasticSectionModulusZ, data.Wpl_z, data.Wpl_weak, null) ??
      null;
    this.catalogProperties = { ...rawData };
    this.convertedCatalogProperties = { ...data };
  }

  override toJSON(): SteelProfileSectionJson {
    return {
      ...super.toJSON(),
      profileName: this.profileName,
      family: this.family,
      height: this.height,
      width: this.width,
      webThickness: this.webThickness,
      flangeThickness: this.flangeThickness,
      rootRadius: this.rootRadius,
      massPerLength: this.massPerLength,
      perimeter: this.perimeter,
      warpingConstant: this.warpingConstant,
      torsionalSectionModulus: this.torsionalSectionModulus,
      warpingSectionModulus: this.warpingSectionModulus,
      radiusOfGyrationY: this.radiusOfGyrationY,
      radiusOfGyrationZ: this.radiusOfGyrationZ,
      elasticSectionModulusY: this.elasticSectionModulusY,
      elasticSectionModulusZ: this.elasticSectionModulusZ,
      plasticSectionModulusY: this.plasticSectionModulusY,
      plasticSectionModulusZ: this.plasticSectionModulusZ,
      catalogProperties: { ...this.catalogProperties },
      convertedCatalogProperties: { ...this.convertedCatalogProperties },
    };
  }
}
