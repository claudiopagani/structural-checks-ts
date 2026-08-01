export const EXISTING_MATERIAL_CONFIDENCE_LEVELS = Object.freeze({
  LC1: Object.freeze({
    level: 1,
    label: "LC1",
    confidenceFactor: 1.35,
    description: "conoscenza limitata",
  }),
  LC2: Object.freeze({
    level: 2,
    label: "LC2",
    confidenceFactor: 1.2,
    description: "conoscenza adeguata",
  }),
  LC3: Object.freeze({
    level: 3,
    label: "LC3",
    confidenceFactor: 1,
    description: "conoscenza accurata",
  }),
});

export type ExistingMaterialKnowledgeLevel = keyof typeof EXISTING_MATERIAL_CONFIDENCE_LEVELS;
export type ExistingMaterialKnowledgeLevelInput =
  | ExistingMaterialKnowledgeLevel
  | Lowercase<ExistingMaterialKnowledgeLevel>
  | 1
  | 2
  | 3
  | "1"
  | "2"
  | "3";

export interface ExistingMaterialStateOptions {
  existing?: boolean;
  knowledgeLevel?: ExistingMaterialKnowledgeLevelInput;
  confidenceFactor?: number | null;
}

export interface ExistingMaterialState {
  existing: boolean;
  knowledgeLevel: ExistingMaterialKnowledgeLevel | null;
  confidenceFactor: number;
  knowledgeLevelDescription: string | null;
}

const KNOWLEDGE_LEVEL_ALIASES: Readonly<Record<string, ExistingMaterialKnowledgeLevel>> =
  Object.freeze({
    "1": "LC1",
    LC1: "LC1",
    lc1: "LC1",
    "2": "LC2",
    LC2: "LC2",
    lc2: "LC2",
    "3": "LC3",
    LC3: "LC3",
    lc3: "LC3",
  });

export function normalizeExistingMaterialKnowledgeLevel(
  knowledgeLevel: ExistingMaterialKnowledgeLevelInput = "LC1",
): ExistingMaterialKnowledgeLevel {
  const normalized = KNOWLEDGE_LEVEL_ALIASES[String(knowledgeLevel)];

  if (!normalized) {
    throw new Error(`Unsupported existing material knowledge level: ${knowledgeLevel}.`);
  }

  return normalized;
}

export function resolveExistingMaterialState({
  existing = false,
  knowledgeLevel = "LC1",
  confidenceFactor = null,
}: ExistingMaterialStateOptions = {}): ExistingMaterialState {
  if (!existing) {
    return {
      existing: false,
      knowledgeLevel: null,
      confidenceFactor: 1,
      knowledgeLevelDescription: null,
    };
  }

  const normalizedKnowledgeLevel = normalizeExistingMaterialKnowledgeLevel(knowledgeLevel);
  const preset = EXISTING_MATERIAL_CONFIDENCE_LEVELS[normalizedKnowledgeLevel];
  const resolvedConfidenceFactor =
    confidenceFactor == null ? preset.confidenceFactor : confidenceFactor;

  if (!Number.isFinite(resolvedConfidenceFactor) || resolvedConfidenceFactor <= 0) {
    throw new Error("Existing material confidenceFactor must be positive.");
  }

  return {
    existing: true,
    knowledgeLevel: normalizedKnowledgeLevel,
    confidenceFactor: resolvedConfidenceFactor,
    knowledgeLevelDescription: preset.description,
  };
}

export function characteristicValueFromExistingMean(
  meanValue: number,
  confidenceFactor: number,
): number;
export function characteristicValueFromExistingMean(
  meanValue: null,
  confidenceFactor: number,
): null;
export function characteristicValueFromExistingMean(
  meanValue: number | null,
  confidenceFactor: number,
): number | null;
export function characteristicValueFromExistingMean(
  meanValue: number | null,
  confidenceFactor: number,
): number | null {
  if (meanValue == null) {
    return meanValue;
  }

  if (!Number.isFinite(meanValue)) {
    throw new Error("Existing material mean value must be finite.");
  }

  if (!Number.isFinite(confidenceFactor) || confidenceFactor <= 0) {
    throw new Error("Existing material confidenceFactor must be positive.");
  }

  return meanValue / confidenceFactor;
}
