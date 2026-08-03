export interface BeamReportUnitSystem {
  force: string;
  length: string;
}

export interface BeamReportScalarSummary {
  value: number | null;
  station: number | null;
}

export interface BeamReportResultSummary {
  id: string;
  resultType: string | null;
  limitState: string | null;
  combinationType: string | null;
  maxAbsBendingMoment: BeamReportScalarSummary | null;
  maxAbsBendingMomentY: BeamReportScalarSummary | null;
  maxAbsBendingMomentZ: BeamReportScalarSummary | null;
  maxAbsShearForce: BeamReportScalarSummary | null;
  maxAbsShearForceY: BeamReportScalarSummary | null;
  maxAbsShearForceZ: BeamReportScalarSummary | null;
  maxAbsVerticalDisplacement: BeamReportScalarSummary | null;
  sectionProperties: Record<string, unknown>;
}

export interface BeamReportAnalysisDto {
  id: string;
  units: BeamReportUnitSystem;
  analysisModel: string;
  loadCaseIds: string[];
  combinationIds: string[];
  loadCases: Record<string, BeamReportResultSummary>;
  combinations: Record<string, BeamReportResultSummary>;
  envelopes: Record<string, unknown>;
  sectionRotation: Record<string, unknown>;
  principalAxes: Record<string, unknown>;
  sectionRigidity: Record<string, unknown>;
  principalActionEnvelopes: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface BeamReportVerificationCheckDto {
  id: string;
  description?: string;
  demand?: number | null;
  capacity?: number | null;
  utilizationRatio?: number | null;
  ok?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BeamReportVerificationDto {
  applicationId: string;
  status: string;
  summary: string;
  utilizationRatio: number | null;
  demand: unknown;
  capacity: unknown;
  checks: BeamReportVerificationCheckDto[];
  outputs: Record<string, unknown>;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

export interface BeamReportGoverningDto {
  verification: unknown;
  utilizationRatio: number | null;
  checkId: string | null;
  ulsMoment: unknown;
  ulsMomentY: unknown;
  ulsMomentZ: unknown;
  sleDeflection: unknown;
}

export interface BeamReportDto {
  schemaVersion: string;
  applicationId: string;
  id: string;
  title: string;
  description: string;
  units: BeamReportUnitSystem;
  model: Record<string, unknown>;
  analysis: BeamReportAnalysisDto;
  verification: BeamReportVerificationDto | null;
  governing: BeamReportGoverningDto;
  warnings: string[];
  assumptions: string[];
  metadata: Record<string, unknown>;
}

export interface BeamReportValidationResult {
  ok: boolean;
  schemaVersion: unknown;
  errors: string[];
}

export const BEAM_REPORT_SCHEMA_VERSION = "beam-report/v1";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireField(value: unknown, path: string, errors: string[]): void {
  if (value == null) {
    errors.push(`${path} is required.`);
  }
}

function requireArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
  }
}

function requireObject(value: unknown, path: string, errors: string[]): void {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object.`);
  }
}

export function validateBeamReportDto(report: unknown): BeamReportValidationResult {
  const errors: string[] = [];

  requireObject(report, "report", errors);

  if (!isPlainObject(report)) {
    return {
      ok: false,
      schemaVersion: null,
      errors,
    };
  }

  if (report.schemaVersion !== BEAM_REPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${BEAM_REPORT_SCHEMA_VERSION}.`);
  }

  requireField(report.applicationId, "applicationId", errors);
  requireField(report.id, "id", errors);
  requireField(report.title, "title", errors);
  requireObject(report.units, "units", errors);
  requireObject(report.model, "model", errors);
  requireObject(report.analysis, "analysis", errors);
  requireObject(report.governing, "governing", errors);
  requireArray(report.warnings, "warnings", errors);
  requireArray(report.assumptions, "assumptions", errors);
  requireObject(report.metadata, "metadata", errors);

  if (isPlainObject(report.analysis)) {
    requireArray(report.analysis.loadCaseIds, "analysis.loadCaseIds", errors);
    requireArray(report.analysis.combinationIds, "analysis.combinationIds", errors);
    requireObject(report.analysis.loadCases, "analysis.loadCases", errors);
    requireObject(report.analysis.combinations, "analysis.combinations", errors);
    requireObject(report.analysis.envelopes, "analysis.envelopes", errors);
    requireObject(report.analysis.sectionRotation, "analysis.sectionRotation", errors);
    requireObject(report.analysis.principalAxes, "analysis.principalAxes", errors);
    requireObject(report.analysis.sectionRigidity, "analysis.sectionRigidity", errors);
    requireObject(
      report.analysis.principalActionEnvelopes,
      "analysis.principalActionEnvelopes",
      errors,
    );
    requireObject(report.analysis.raw, "analysis.raw", errors);
  }

  if (report.verification != null) {
    requireObject(report.verification, "verification", errors);

    if (isPlainObject(report.verification)) {
      requireField(report.verification.applicationId, "verification.applicationId", errors);
      requireField(report.verification.status, "verification.status", errors);
      requireArray(report.verification.checks, "verification.checks", errors);
      requireObject(report.verification.outputs, "verification.outputs", errors);
      requireArray(report.verification.warnings, "verification.warnings", errors);
      requireArray(report.verification.assumptions, "verification.assumptions", errors);
      requireObject(report.verification.metadata, "verification.metadata", errors);
    }
  }

  return {
    ok: errors.length === 0,
    schemaVersion: report.schemaVersion ?? null,
    errors,
  };
}
