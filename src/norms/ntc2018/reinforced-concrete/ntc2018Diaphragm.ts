// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

/**
 * NTC 2018 chapter-7 rule for horizontal diaphragms.
 *
 * Section 7.4.4.4.1 prescribes one demand transformation: forces obtained
 * from the analysis must be increased by 30%. It does not introduce
 * diaphragm-specific stress, chord or connection resistance equations.
 * Resistance checks remain chapter-4 section checks.
 */

import { withNormativeReferences } from "../../normativeReference.js";
import { NTC2018_RC_CHAPTER_7_4_REFERENCES } from "../normativeReferences.js";

type NumberLike = number | string;
type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export interface Ntc2018DiaphragmActionInput {
  readonly analysisActions?: Readonly<Record<string, NumberLike>> | null | undefined;
}

export interface Ntc2018DiaphragmAssessmentInput extends Ntc2018DiaphragmActionInput {
  readonly diaphragmId?: string;
  readonly capacityChecks?: readonly unknown[];
}

export const NTC2018_DIAPHRAGM_FORCE_FACTOR = 1.3;

export const NTC2018_DIAPHRAGM_REFERENCES = Object.freeze([
  Object.freeze({
    source: "NTC 2018",
    citation: "§ 7.4.4.4.1 (Verifiche di resistenza dei diaframmi orizzontali)",
  }),
]);

function finite(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite; got ${String(value)}.`);
  }
  return number;
}

/**
 * Increase every supplied diaphragm force/moment component by 30%.
 *
 * `analysisActions` is intentionally a flat serializable component map,
 * leaving coordinate systems and units to the surrounding FEM contract.
 */
export function amplifyNTC2018DiaphragmActions({
  analysisActions,
}: Ntc2018DiaphragmActionInput = {}) {
  if (
    analysisActions == null ||
    typeof analysisActions !== "object" ||
    Array.isArray(analysisActions)
  ) {
    throw new Error("analysisActions must be a component object.");
  }
  const entries = Object.entries(analysisActions);
  if (entries.length === 0) {
    throw new Error("analysisActions must contain at least one component.");
  }

  // @see https://strutture-normative-viewer.claudiopagani19.chatgpt.site/?unit=urn%3Astructural-codes%3Ait%3Aunit%3Antc2018%3A7.4.4.4.1
  const designActions = Object.fromEntries(
    entries.map(([component, value]) => [
      component,
      NTC2018_DIAPHRAGM_FORCE_FACTOR * finite(value, `analysisActions.${component}`),
    ]),
  );
  return {
    analysisActions: { ...analysisActions },
    designActions,
    amplificationFactor: NTC2018_DIAPHRAGM_FORCE_FACTOR,
    reference: "NTC 2018 § 7.4.4.4.1",
    metadata: withNormativeReferences({}, [NTC2018_RC_CHAPTER_7_4_REFERENCES.diaphragm]),
  };
}

/**
 * Combine the chapter-7 amplified action state with chapter-4 checks
 * calculated by an appropriate local membrane/section verifier.
 */
export function createDiaphragmAssessment({
  diaphragmId,
  analysisActions,
  capacityChecks = [],
}: Ntc2018DiaphragmAssessmentInput = {}) {
  const demand = amplifyNTC2018DiaphragmActions({ analysisActions });
  if (!Array.isArray(capacityChecks)) {
    throw new Error("capacityChecks must be an array.");
  }
  const checks = capacityChecks.map((check, index) => {
    if (!isJsonRecord(check)) {
      throw new Error(`capacityChecks[${index}] must be an object.`);
    }
    if (typeof check.ok !== "boolean") {
      throw new Error(`capacityChecks[${index}].ok must be boolean.`);
    }
    return { ...check };
  });
  const complete = checks.length > 0;
  const allChecksOk = complete && checks.every((check) => check.ok);

  return {
    diaphragmId,
    ...demand,
    complete,
    status: complete ? (allChecksOk ? "ok" : "not-verified") : "not-implemented",
    allChecksOk,
    checks,
    warnings: complete
      ? []
      : [
          "No chapter-4 in-plane resistance checks were supplied; only the § 7.4.4.4.1 demand amplification was performed.",
        ],
    references: NTC2018_DIAPHRAGM_REFERENCES,
    metadata: withNormativeReferences(demand.metadata, [
      NTC2018_RC_CHAPTER_7_4_REFERENCES.diaphragm,
    ]),
  };
}
