import test from "node:test";

import {
  STEEL_PROFILE_CATALOG_UNITS,
  STEEL_PROFILE_FAMILIES,
  STEEL_PROFILE_SECTION_DATABASE,
  STEEL_PROFILE_SECTION_NAMES,
  getSteelProfileSectionData,
  listSteelProfileSectionsByFamily,
  type SteelProfileCatalogUnits,
  type SteelProfileSectionData,
} from "../dist/index.js";

const units: SteelProfileCatalogUnits = STEEL_PROFILE_CATALOG_UNITS;
const database: Readonly<Record<string, SteelProfileSectionData>> = STEEL_PROFILE_SECTION_DATABASE;
const names: readonly string[] = STEEL_PROFILE_SECTION_NAMES;
const families: readonly string[] = STEEL_PROFILE_FAMILIES;
const profile: SteelProfileSectionData | null = getSteelProfileSectionData("IPE300");
const ipeProfiles: string[] = listSteelProfileSectionsByFamily("IPE");

void test("steel profile catalog exposes a strict typed consumer contract", () => {
  void units;
  void database;
  void names;
  void families;
  void profile;
  void ipeProfiles;
});
