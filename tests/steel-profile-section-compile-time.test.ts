import test from "node:test";

import {
  SteelProfileSection,
  createSteelProfileSection,
  type SteelProfileSectionJson,
  type SteelProfileSectionOptions,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const options: SteelProfileSectionOptions = {
  profileName: "IPE300",
  id: "typed-steel-profile",
  name: "Profilo \u03B1",
  units,
  metadata: { label: "profilo \u03B2" },
  warpingConstant: 2e-6,
};
const section = new SteelProfileSection(options);
const factorySection = createSteelProfileSection(options);
const json: SteelProfileSectionJson = section.toJSON();
const area: number = factorySection.area;
const family: string | null = factorySection.family;

void test("SteelProfileSection exposes a strict typed consumer contract", () => {
  void json;
  void area;
  void family;
});
