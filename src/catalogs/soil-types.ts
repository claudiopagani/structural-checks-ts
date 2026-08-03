// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/catalogs/soil-types.js.
/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
// @ts-nocheck

import { SoilMaterial } from "../domain/geotechnics/SoilMaterial.js";

const CLASSIFICATION_REFERENCES = Object.freeze([
  "ISO 14688-1:2017",
  "ISO 14688-2:2017",
  "UNI EN ISO 14688-1:2018",
  "UNI EN ISO 14688-2:2018",
]);

const entries = [
  ["gravelly-soil", "Gravelly soil", "gravel"],
  ["sandy-soil", "Sandy soil", "sand"],
  ["silty-soil", "Silty soil", "silt"],
  ["clayey-soil", "Clayey soil", "clay"],
  ["organic-soil", "Organic soil", "organic"],
  ["mixed-soil", "Mixed soil", "mixed"],
  ["engineered-granular-fill", "Engineered granular fill", "engineered-fill"],
];

export const SOIL_TYPE_CATALOG = Object.freeze(
  Object.fromEntries(
    entries.map(([id, name, primaryFraction]) => [
      id,
      Object.freeze({
        id,
        name,
        primaryFraction,
        classificationSystem: "strutture-js-generic-soil-types/v1",
        classificationStatus: "generic-entry-not-a-site-classification",
        referenceParameterRanges: Object.freeze({}),
        references: CLASSIFICATION_REFERENCES,
        notes: [
          "This entry classifies input; it does not provide design parameters.",
          "Project parameters require field or laboratory evidence, a documented correlation, or an explicit engineering assumption.",
        ],
      }),
    ]),
  ),
);

export const SOIL_TYPE_IDS = Object.freeze(Object.keys(SOIL_TYPE_CATALOG));

export function getSoilTypeData(soilTypeId) {
  const entry = SOIL_TYPE_CATALOG[soilTypeId];
  if (!entry) throw new Error(`Unknown soil type: ${soilTypeId}.`);
  return structuredClone(entry);
}

export function listSoilTypes() {
  return SOIL_TYPE_IDS.map(getSoilTypeData);
}

export function createSoilMaterialFromType({ soilTypeId, metadata = {}, ...material }: any = {}) {
  const soilType = getSoilTypeData(soilTypeId);

  return new SoilMaterial({
    ...material,
    soilTypeId,
    classification: {
      ...structuredClone(material.classification ?? {}),
      catalogId: soilType.id,
      primaryFraction: soilType.primaryFraction,
      classificationSystem: soilType.classificationSystem,
      classificationStatus: soilType.classificationStatus,
    },
    metadata: {
      ...structuredClone(metadata ?? {}),
      catalogEntryId: soilType.id,
      catalogProvidedNumericParameters: false,
      classificationReferences: [...soilType.references],
    },
  });
}
