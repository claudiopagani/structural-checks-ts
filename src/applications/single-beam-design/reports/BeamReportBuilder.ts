import { BEAM_REPORT_SCHEMA_VERSION } from "../dto/BeamReportDto.js";
import { BeamReportMarkdownRenderer } from "./BeamReportMarkdownRenderer.js";

type BeamReportBuilderOptions = {
  applicationId?: unknown;
  schemaVersion?: unknown;
  metadata?: unknown;
  markdownRenderer?: unknown;
};

type BeamReportBuildInput = {
  model?: unknown;
  analysisResult?: unknown;
  verificationResult?: unknown;
  metadata?: unknown;
};

type BeamReportBuildOutput = {
  json: Record<string, unknown>;
  markdown: unknown;
};

function propertyValue(value: unknown, key: string): unknown {
  return value == null ? undefined : Reflect.get(Object(value), key);
}

function stringValue(value: unknown): string {
  const stringified: unknown = Reflect.apply(String, undefined, [value]);
  if (typeof stringified !== "string") {
    throw new Error("String conversion did not return a string.");
  }
  return stringified;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  );
}

function objectEntries(value: unknown): [string, unknown][] {
  if (value == null) {
    return [];
  }

  if (typeof value === "string") {
    return value.split("").map((item, index) => [String(index), item]);
  }

  if (typeof value !== "object" && typeof value !== "function") {
    return [];
  }

  return Object.keys(value).map((key) => [key, Reflect.get(value, key)]);
}

function spreadRecord(value: unknown): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, item] of objectEntries(value)) {
    output[key] = item;
  }

  return output;
}

function mergeRecords(...values: unknown[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const value of values) {
    Object.assign(output, spreadRecord(value));
  }

  return output;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function arrayValues(value: unknown): unknown[] {
  return isUnknownArray(value) ? value : [];
}

function resultEntries(resultMap: unknown = {}): unknown[] {
  return objectEntries(resultMap ?? {}).map(([, value]) => value);
}

function invokeToJSON(value: object): { found: boolean; result: unknown } {
  const candidate = propertyValue(value, "toJSON");
  if (typeof candidate !== "function") {
    return { found: false, result: undefined };
  }

  return {
    found: true,
    result: Reflect.apply(candidate, value, []),
  };
}

function toPlain(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: propertyValue(value, "name") || null,
    };
  }

  if (typeof value !== "object") {
    return stringValue(value);
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item, seen));
  }

  const toJSON = invokeToJSON(value);
  if (toJSON.found && !isPlainObject(value)) {
    return toPlain(toJSON.result, seen);
  }

  const output: Record<string, unknown> = {};

  for (const [key, item] of objectEntries(value)) {
    output[key] = toPlain(item, seen);
  }

  return output;
}

function unique(items: unknown[]): unknown[] {
  return [...new Set(items.filter((item) => item != null && item !== ""))];
}

function firstAnalysisResult(analysisResult: unknown): unknown {
  return (
    resultEntries(propertyValue(analysisResult, "combinations"))[0] ??
    resultEntries(propertyValue(analysisResult, "loadCases"))[0] ??
    null
  );
}

function numberValue(value: unknown): number {
  const absolute: unknown = Reflect.apply(Math.abs, undefined, [value]);
  if (typeof absolute !== "number") {
    throw new Error("Absolute value did not return a number.");
  }
  return absolute;
}

function summarizeResult(result: unknown): Record<string, unknown> {
  const internalForces = propertyValue(result, "internalForces");
  const maxMoment = propertyValue(internalForces, "maxAbsBendingMoment");
  const maxMomentY = propertyValue(internalForces, "maxAbsBendingMomentY");
  const maxMomentZ = propertyValue(internalForces, "maxAbsBendingMomentZ");
  const maxShear = arrayValues([
    propertyValue(internalForces, "maxShearForce"),
    propertyValue(internalForces, "minShearForce"),
  ])
    .filter(Boolean)
    .reduce<unknown>(
      (selected, sample) =>
        !selected ||
        numberValue(propertyValue(sample, "v")) > numberValue(propertyValue(selected, "v"))
          ? sample
          : selected,
      null,
    );
  const maxShearY = propertyValue(internalForces, "maxAbsShearForceY");
  const maxShearZ = propertyValue(internalForces, "maxAbsShearForceZ");
  const maxDeflection = propertyValue(
    propertyValue(result, "displacements"),
    "maxAbsVerticalDisplacement",
  );

  return {
    id: propertyValue(result, "id"),
    resultType: propertyValue(result, "resultType"),
    limitState: propertyValue(propertyValue(result, "context"), "limitState") ?? null,
    combinationType: propertyValue(propertyValue(result, "context"), "combinationType") ?? null,
    maxAbsBendingMoment: maxMoment
      ? {
          value: propertyValue(maxMoment, "m"),
          station: propertyValue(maxMoment, "station"),
        }
      : null,
    maxAbsBendingMomentY: maxMomentY
      ? {
          value: propertyValue(maxMomentY, "mY"),
          station: propertyValue(maxMomentY, "station"),
        }
      : null,
    maxAbsBendingMomentZ: maxMomentZ
      ? {
          value: propertyValue(maxMomentZ, "mZ"),
          station: propertyValue(maxMomentZ, "station"),
        }
      : null,
    maxAbsShearForce: maxShear
      ? {
          value: propertyValue(maxShear, "v"),
          station: propertyValue(maxShear, "station"),
        }
      : null,
    maxAbsShearForceY: maxShearY
      ? {
          value: propertyValue(maxShearY, "vY"),
          station: propertyValue(maxShearY, "station"),
        }
      : null,
    maxAbsShearForceZ: maxShearZ
      ? {
          value: propertyValue(maxShearZ, "vZ"),
          station: propertyValue(maxShearZ, "station"),
        }
      : null,
    maxAbsVerticalDisplacement: maxDeflection
      ? {
          value: propertyValue(maxDeflection, "uy"),
          station: propertyValue(maxDeflection, "station"),
        }
      : null,
    sectionProperties: toPlain(propertyValue(result, "sectionProperties")),
  };
}

function sectionRotationDto(analysisResult: unknown, model: unknown): unknown {
  const reference = firstAnalysisResult(analysisResult);
  const metadata = propertyValue(propertyValue(reference, "sectionProperties"), "metadata") ?? {};

  return toPlain(
    propertyValue(propertyValue(reference, "context"), "sectionRotation") ??
      propertyValue(reference, "sectionRotation") ??
      propertyValue(metadata, "sectionRotation") ??
      propertyValue(propertyValue(model, "beamInput"), "sectionRotation") ??
      {},
  );
}

function principalAxesDto(analysisResult: unknown): unknown {
  const reference = firstAnalysisResult(analysisResult);
  const metadata = propertyValue(propertyValue(reference, "sectionProperties"), "metadata") ?? {};
  const rotation =
    propertyValue(metadata, "principalAxes") ??
    propertyValue(metadata, "sectionRotation") ??
    propertyValue(propertyValue(reference, "context"), "sectionRotation") ??
    propertyValue(reference, "sectionRotation") ??
    {};

  return toPlain(rotation);
}

function sectionRigidityDto(analysisResult: unknown): unknown {
  const reference = firstAnalysisResult(analysisResult);
  const properties = propertyValue(reference, "sectionProperties") ?? {};
  const metadata = propertyValue(properties, "metadata") ?? {};

  return toPlain({
    sourceResultId: propertyValue(reference, "id") ?? null,
    axialRigidity: propertyValue(properties, "axialRigidity") ?? null,
    flexuralRigidity: propertyValue(properties, "flexuralRigidity") ?? null,
    flexuralRigidityY:
      propertyValue(properties, "flexuralRigidityY") ??
      propertyValue(metadata, "flexuralRigidityY") ??
      null,
    flexuralRigidityZ:
      propertyValue(properties, "flexuralRigidityZ") ??
      propertyValue(metadata, "flexuralRigidityZ") ??
      null,
    shearRigidity: propertyValue(properties, "shearRigidity") ?? null,
    shearRigidityY:
      propertyValue(properties, "shearRigidityY") ??
      propertyValue(metadata, "shearRigidityY") ??
      null,
    shearRigidityZ:
      propertyValue(properties, "shearRigidityZ") ??
      propertyValue(metadata, "shearRigidityZ") ??
      null,
    verticalFlexuralRigiditySource:
      propertyValue(metadata, "verticalFlexuralRigiditySource") ?? null,
    verticalShearRigiditySource: propertyValue(metadata, "verticalShearRigiditySource") ?? null,
  });
}

function envelopeSummaryItem(item: unknown): Record<string, unknown> | null {
  if (!item) {
    return null;
  }

  return {
    resultId: propertyValue(item, "resultId") ?? null,
    resultType: propertyValue(item, "resultType") ?? null,
    limitState: propertyValue(item, "limitState") ?? null,
    combinationType: propertyValue(item, "combinationType") ?? null,
    quantity: propertyValue(item, "quantity") ?? null,
    value: propertyValue(item, "value") ?? null,
    station: propertyValue(propertyValue(item, "sample"), "station") ?? null,
    sample: toPlain(propertyValue(item, "sample") ?? null),
  };
}

function principalEnvelopeGroup(envelope: unknown = {}): Record<string, unknown> {
  return {
    maxAbsBendingMomentY: envelopeSummaryItem(propertyValue(envelope, "maxAbsBendingMomentY")),
    maxAbsBendingMomentZ: envelopeSummaryItem(propertyValue(envelope, "maxAbsBendingMomentZ")),
    maxAbsShearForceY: envelopeSummaryItem(propertyValue(envelope, "maxAbsShearForceY")),
    maxAbsShearForceZ: envelopeSummaryItem(propertyValue(envelope, "maxAbsShearForceZ")),
  };
}

function principalActionEnvelopeDto(envelopes: unknown = {}): Record<string, unknown> {
  return {
    all: principalEnvelopeGroup(propertyValue(envelopes, "all") ?? {}),
    loadCases: principalEnvelopeGroup(propertyValue(envelopes, "loadCases") ?? {}),
    combinations: principalEnvelopeGroup(propertyValue(envelopes, "combinations") ?? {}),
    uls: principalEnvelopeGroup(propertyValue(envelopes, "uls") ?? {}),
    sle: principalEnvelopeGroup(propertyValue(envelopes, "sle") ?? {}),
  };
}

function governingCheckFromVerification(verification: unknown): unknown {
  const checks = arrayValues(propertyValue(verification, "checks"));

  return checks.reduce<unknown>((selected, check) => {
    const utilizationRatio = propertyValue(check, "utilizationRatio");
    if (typeof utilizationRatio !== "number" || !Number.isFinite(utilizationRatio)) {
      return selected;
    }

    const selectedRatio = propertyValue(selected, "utilizationRatio");
    if (!selected || (typeof selectedRatio === "number" && utilizationRatio > selectedRatio)) {
      return check;
    }

    return selected;
  }, null);
}

function collectWarnings(...sources: unknown[]): unknown[] {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (isUnknownArray(source)) {
        return source;
      }

      return arrayValues(propertyValue(source, "warnings"));
    }),
  );
}

function collectAssumptions(...sources: unknown[]): unknown[] {
  return unique(
    sources.flatMap((source) => {
      if (!source) {
        return [];
      }

      if (isUnknownArray(source)) {
        return source;
      }

      return arrayValues(propertyValue(source, "assumptions"));
    }),
  );
}

export class BeamReportBuilder {
  applicationId: unknown;
  schemaVersion: unknown;
  metadata: Record<string, unknown>;
  markdownRenderer: unknown;

  constructor({
    applicationId = "single-beam-design",
    schemaVersion = BEAM_REPORT_SCHEMA_VERSION,
    metadata = {},
    markdownRenderer = new BeamReportMarkdownRenderer(),
  }: BeamReportBuilderOptions = {}) {
    this.applicationId = applicationId;
    this.schemaVersion = schemaVersion;
    this.metadata = spreadRecord(metadata);
    this.markdownRenderer = markdownRenderer;
  }

  build({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  }: BeamReportBuildInput = {}): BeamReportBuildOutput {
    if (!model) {
      throw new Error("BeamReportBuilder requires a model.");
    }

    if (!analysisResult) {
      throw new Error("BeamReportBuilder requires an analysisResult.");
    }

    const json = this.buildJson({
      model,
      analysisResult,
      verificationResult,
      metadata,
    });

    return {
      json,
      markdown: this.renderMarkdown(json),
    };
  }

  buildJson({
    model,
    analysisResult,
    verificationResult = null,
    metadata = {},
  }: BeamReportBuildInput): Record<string, unknown> {
    const loadCaseSummaries = Object.fromEntries(
      objectEntries(propertyValue(analysisResult, "loadCases") ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const combinationSummaries = Object.fromEntries(
      objectEntries(propertyValue(analysisResult, "combinations") ?? {}).map(([id, result]) => [
        id,
        summarizeResult(result),
      ]),
    );
    const verification = verificationResult ? toPlain(verificationResult) : null;
    const governingCheck = governingCheckFromVerification(verification);
    const warnings = collectWarnings(
      analysisResult,
      verification,
      verification ? [] : ["No structural verification result was provided."],
    );
    const assumptions = collectAssumptions(analysisResult, verification);
    const sectionRotation = sectionRotationDto(analysisResult, model);
    const principalAxes = principalAxesDto(analysisResult);
    const sectionRigidity = sectionRigidityDto(analysisResult);
    const principalActionEnvelopes = principalActionEnvelopeDto(
      propertyValue(analysisResult, "envelopes"),
    );
    const modelToJSON = propertyValue(model, "toJSON");
    const analysisUnits = propertyValue(analysisResult, "units");
    const modelUnits = propertyValue(model, "units");
    const analysisEnvelopes = propertyValue(analysisResult, "envelopes");
    const verificationOutputs = propertyValue(verification, "outputs");
    const verificationMetadata = propertyValue(verification, "metadata");

    return {
      schemaVersion: this.schemaVersion,
      applicationId: this.applicationId,
      id: propertyValue(model, "id"),
      title: propertyValue(model, "title"),
      description: propertyValue(model, "description"),
      units: toPlain(analysisUnits ?? modelUnits),
      model:
        typeof modelToJSON === "function" ? Reflect.apply(modelToJSON, model, []) : toPlain(model),
      analysis: {
        id: propertyValue(analysisResult, "id"),
        units: toPlain(analysisUnits),
        analysisModel: propertyValue(analysisResult, "analysisModel"),
        loadCaseIds: Object.keys(propertyValue(analysisResult, "loadCases") ?? {}),
        combinationIds: Object.keys(propertyValue(analysisResult, "combinations") ?? {}),
        loadCases: loadCaseSummaries,
        combinations: combinationSummaries,
        envelopes: toPlain(analysisEnvelopes),
        sectionRotation,
        principalAxes,
        sectionRigidity,
        principalActionEnvelopes,
        raw: toPlain(analysisResult),
      },
      verification,
      governing: {
        verification: propertyValue(verificationOutputs, "governing") ?? null,
        utilizationRatio: propertyValue(verification, "utilizationRatio") ?? null,
        checkId:
          propertyValue(verificationMetadata, "governingCheckId") ??
          propertyValue(governingCheck, "id") ??
          null,
        ulsMoment: toPlain(
          propertyValue(propertyValue(analysisEnvelopes, "uls"), "maxAbsBendingMoment"),
        ),
        ulsMomentY: toPlain(
          propertyValue(propertyValue(analysisEnvelopes, "uls"), "maxAbsBendingMomentY"),
        ),
        ulsMomentZ: toPlain(
          propertyValue(propertyValue(analysisEnvelopes, "uls"), "maxAbsBendingMomentZ"),
        ),
        sleDeflection: toPlain(
          propertyValue(propertyValue(analysisEnvelopes, "sle"), "maxAbsVerticalDisplacement"),
        ),
      },
      warnings,
      assumptions,
      metadata: mergeRecords(this.metadata, metadata, { generatedBy: "BeamReportBuilder" }),
    };
  }

  renderMarkdown(report: unknown): unknown {
    if (typeof this.markdownRenderer === "function") {
      return Reflect.apply(this.markdownRenderer, this, [report]);
    }

    const render = propertyValue(this.markdownRenderer, "render");
    if (typeof render === "function") {
      return Reflect.apply(render, this.markdownRenderer, [report]);
    }

    throw new Error("BeamReportBuilder requires a markdown renderer with a render() method.");
  }

  buildMarkdown(report: unknown): unknown {
    return this.renderMarkdown(report);
  }
}
