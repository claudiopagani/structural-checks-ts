import test from "node:test";

import {
  SteelCompoundProfileSection,
  createDoubleAngleOpposedSection,
  createDoubleUPNBackToBackSection,
  createSteelCompoundProfileSection,
  createSteelProfileSection,
  type SteelCompoundProfileSectionJson,
  type SteelCompoundProfileSectionOptions,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const baseSection = createSteelProfileSection({ profileName: "UPN200", units });
const options: SteelCompoundProfileSectionOptions = {
  id: "typed-compound",
  name: "Compound \u03B3",
  units,
  components: [
    {
      section: baseSection,
      role: "left-channel",
      centroidZ: -0.1,
      metadata: { label: "left" },
    },
    {
      profileName: "UPN200",
      role: "right-channel",
      centroidZ: 0.1,
    },
  ],
};
const section = new SteelCompoundProfileSection(options);
const factorySection = createSteelCompoundProfileSection(options);
const json: SteelCompoundProfileSectionJson = section.toJSON();
const upn = createDoubleUPNBackToBackSection({ profileName: "UPN200", units });
const angle = createDoubleAngleOpposedSection({ profileName: "L60X60X6", units });

void test("SteelCompoundProfileSection exposes a strict typed consumer contract", () => {
  void factorySection;
  void json;
  void upn;
  void angle;
});
