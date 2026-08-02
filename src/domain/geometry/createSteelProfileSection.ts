// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/geometry/createSteelProfileSection.js.

import { SteelProfileSection, type SteelProfileSectionOptions } from "./SteelProfileSection.js";

export function createSteelProfileSection(
  options: SteelProfileSectionOptions,
): SteelProfileSection {
  return new SteelProfileSection(options);
}
