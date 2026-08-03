import { StructuralApplication } from "../../core/applications/StructuralApplication.js";
import { CalculationResult } from "../../core/results/CalculationResult.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { SingleBeamAnalysis } from "../../domain/beams/SingleBeamAnalysis.js";
import { SingleBeamDesignModel } from "./models/SingleBeamDesignModel.js";
import { BeamReportBuilder } from "./reports/BeamReportBuilder.js";

type SingleBeamDesignApplicationOptions = {
  analysis?: unknown;
  reportBuilder?: unknown;
  metadata?: unknown;
};

type SingleBeamApplicationInput = {
  model?: unknown;
  analysisResult?: unknown;
  metadata?: unknown;
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

function spreadRecord(value: unknown): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  if (value == null) {
    return output;
  }

  if (typeof value === "string") {
    value.split("").forEach((item, index) => {
      output[String(index)] = item;
    });
    return output;
  }

  if (typeof value !== "object" && typeof value !== "function") {
    return output;
  }

  for (const key of Object.keys(value)) {
    output[key] = Reflect.get(value, key);
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

function invoke(value: unknown, receiver: unknown, arguments_: readonly unknown[]): unknown {
  if (typeof value !== "function") {
    return undefined;
  }

  const result: unknown = Reflect.apply(value, receiver, arguments_);
  return result;
}

function normalizeModel(input: unknown): SingleBeamDesignModel {
  if (input instanceof SingleBeamDesignModel) {
    return input;
  }

  const constructed: unknown = Reflect.construct(SingleBeamDesignModel, [input]);
  if (!(constructed instanceof SingleBeamDesignModel)) {
    throw new Error("SingleBeamDesignApplication could not construct a model.");
  }

  return constructed;
}

function resultToJson(result: unknown): unknown {
  const toJSON = propertyValue(result, "toJSON");
  return typeof toJSON === "function" ? invoke(toJSON, result, []) : result;
}

function statusFromVerification(verificationResult: unknown): string {
  if (!verificationResult) {
    return RESULT_STATUS.OK;
  }

  const status = propertyValue(verificationResult, "status");
  return status == null ? RESULT_STATUS.OK : stringValue(status);
}

function collectWarnings(...sources: unknown[]): unknown[] {
  return [...new Set(sources.flatMap((source) => propertyValue(source, "warnings") ?? []))];
}

function collectAssumptions(...sources: unknown[]): unknown[] {
  return [...new Set(sources.flatMap((source) => propertyValue(source, "assumptions") ?? []))];
}

function runVerification({
  model,
  analysisResult,
}: {
  model: SingleBeamDesignModel;
  analysisResult: unknown;
}): unknown {
  const verification = model.verification;

  if (!verification) {
    return null;
  }

  if (typeof verification === "function") {
    return invoke(verification, undefined, [
      {
        model,
        analysisResult,
        verificationStations: model.beamInput?.verificationStations ?? null,
      },
    ]);
  }

  const verifier = propertyValue(verification, "verifier") ?? verification;
  const verificationInput = propertyValue(verification, "input");
  const input = mergeRecords(
    {
      verificationStations: model.beamInput?.verificationStations ?? null,
    },
    verificationInput,
    {
      beamModel:
        propertyValue(verificationInput, "beamModel") ??
        (model.beamInput
          ? {
              ...model.toAnalysisInput(),
            }
          : null),
      analysisResult,
    },
  );

  const verify = propertyValue(verifier, "verify");
  if (typeof verify === "function") {
    return invoke(verify, verifier, [input]);
  }

  const run = propertyValue(verifier, "run");
  if (typeof run === "function") {
    return invoke(run, verifier, [
      mergeRecords(
        {
          model: propertyValue(verification, "model") ?? model,
          analysisResult,
        },
        verificationInput,
      ),
    ]);
  }

  throw new Error(
    "SingleBeamDesignApplication verification must be a function or expose verify()/run().",
  );
}

export class SingleBeamDesignApplication extends StructuralApplication {
  analysis: unknown;
  reportBuilder: unknown;

  constructor({
    analysis = new SingleBeamAnalysis(),
    reportBuilder = new BeamReportBuilder(),
    metadata = {},
  }: SingleBeamDesignApplicationOptions = {}) {
    super({
      id: "single-beam-design",
      name: "Single Beam Design",
      description: "End-to-end analysis, verification and reporting workflow for simple beams.",
      domain: "beams",
      supportedCodes: ["NTC2018"],
      tags: ["beam", "fem", "report", "verification"],
      metadata: mergeRecords(
        {
          maturity: "implemented-local",
          plannedCapabilities: [
            "JSON and Markdown reporting",
            "consumer-ready DTOs",
            "material-specific verification adapters",
            "example library for simple beams",
          ],
        },
        metadata,
      ),
    });

    this.analysis = analysis;
    this.reportBuilder = reportBuilder;
  }

  override run(input: SingleBeamApplicationInput = {}): CalculationResult {
    const model = normalizeModel(propertyValue(input, "model") ?? input);
    const analysis = propertyValue(this.analysis, "analyze");
    const analysisResult =
      propertyValue(input, "analysisResult") ??
      invoke(analysis, this.analysis, [model.toAnalysisInput()]);
    const verificationResult = runVerification({
      model,
      analysisResult,
    });
    const build = propertyValue(this.reportBuilder, "build");
    const report = invoke(build, this.reportBuilder, [
      {
        model,
        analysisResult,
        verificationResult,
        metadata: propertyValue(input, "metadata") ?? {},
      },
    ]);
    const verificationJson = resultToJson(verificationResult);
    const reportJson = propertyValue(report, "json");

    return new CalculationResult({
      applicationId: this.id,
      status: statusFromVerification(verificationResult),
      summary: "Single beam analysis, material verification and report generation completed.",
      outputs: {
        modelId: model.id,
        analysis: analysisResult,
        verification: verificationJson,
        report,
      },
      warnings: collectWarnings(verificationJson, reportJson),
      assumptions: collectAssumptions(verificationJson, reportJson),
      metadata: {
        domain: this.domain,
        modelId: model.id,
        reportFormats: ["json", "markdown"],
      },
    });
  }
}
