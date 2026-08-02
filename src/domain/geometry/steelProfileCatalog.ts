// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/geometry/steelProfileCatalog.js.

import sectionDatabase from "../../data/section_database.json" with { type: "json" };

export interface SteelProfileSectionData extends Record<string, unknown> {
  family: string;
}

export interface SteelProfileCatalogUnits {
  force: "N";
  length: "m";
}

export const STEEL_PROFILE_CATALOG_UNITS: Readonly<SteelProfileCatalogUnits> = Object.freeze({
  force: "N",
  length: "m",
});

export const STEEL_PROFILE_SECTION_DATABASE: Readonly<Record<string, SteelProfileSectionData>> =
  Object.freeze(sectionDatabase);

export const STEEL_PROFILE_SECTION_NAMES: readonly string[] = Object.freeze(
  Object.keys(STEEL_PROFILE_SECTION_DATABASE).sort(),
);

export const STEEL_PROFILE_FAMILIES: readonly string[] = Object.freeze(
  [...new Set(Object.values(STEEL_PROFILE_SECTION_DATABASE).map((item) => item.family))].sort(),
);

export function getSteelProfileSectionData(profileName: string): SteelProfileSectionData | null {
  return STEEL_PROFILE_SECTION_DATABASE[profileName] ?? null;
}

export function listSteelProfileSectionsByFamily(family: string): string[] {
  return STEEL_PROFILE_SECTION_NAMES.filter(
    (profileName) => STEEL_PROFILE_SECTION_DATABASE[profileName]?.family === family,
  );
}
