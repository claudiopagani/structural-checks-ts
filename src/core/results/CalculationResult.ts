import { RESULT_STATUS, isResultStatus, type ResultStatus } from "./resultStatus.js";

export interface CalculationResultOptions<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> {
  applicationId: string;
  status?: string;
  summary?: string;
  outputs?: TOutputs;
  warnings?: unknown[];
  assumptions?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface CalculationResultJson<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> {
  applicationId: string;
  status: ResultStatus;
  summary: string;
  outputs: TOutputs;
  warnings: unknown[];
  assumptions: unknown[];
  metadata: Record<string, unknown>;
}

export class CalculationResult<TOutputs extends Record<string, unknown> = Record<string, unknown>> {
  public applicationId: string;
  public status: ResultStatus;
  public summary: string;
  public outputs: TOutputs;
  public warnings: unknown[];
  public assumptions: unknown[];
  public metadata: Record<string, unknown>;

  public constructor({
    applicationId,
    status = RESULT_STATUS.NOT_IMPLEMENTED,
    summary = "",
    outputs = {} as TOutputs,
    warnings = [],
    assumptions = [],
    metadata = {},
  }: CalculationResultOptions<TOutputs>) {
    if (!applicationId) {
      throw new Error("A result applicationId is required.");
    }

    if (!isResultStatus(status)) {
      throw new Error(`Unsupported result status: ${status}.`);
    }

    this.applicationId = applicationId;
    this.status = status;
    this.summary = summary;
    this.outputs = { ...outputs };
    this.warnings = [...warnings];
    this.assumptions = [...assumptions];
    this.metadata = { ...metadata };
  }

  public isSuccessful(): boolean {
    return this.status === RESULT_STATUS.OK;
  }

  public toJSON(): CalculationResultJson<TOutputs> {
    return {
      applicationId: this.applicationId,
      status: this.status,
      summary: this.summary,
      outputs: { ...this.outputs },
      warnings: [...this.warnings],
      assumptions: [...this.assumptions],
      metadata: { ...this.metadata },
    };
  }
}
