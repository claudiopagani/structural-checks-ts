import {
  CalculationResult,
  type CalculationResultJson,
  type CalculationResultOptions,
} from "./CalculationResult.js";
import { RESULT_STATUS } from "./resultStatus.js";

export interface VerificationCheck extends Record<string, unknown> {
  ok?: boolean;
  utilizationRatio?: number | null;
}

export interface VerificationResultOptions<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> extends CalculationResultOptions<TOutputs> {
  utilizationRatio?: number | null;
  demand?: unknown;
  capacity?: unknown;
  checks?: VerificationCheck[];
}

export interface VerificationResultJson<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> extends CalculationResultJson<TOutputs> {
  utilizationRatio: number | null;
  demand: unknown;
  capacity: unknown;
  checks: VerificationCheck[];
}

export class VerificationResult<
  TOutputs extends Record<string, unknown> = Record<string, unknown>,
> extends CalculationResult<TOutputs> {
  public utilizationRatio: number | null;
  public demand: unknown;
  public capacity: unknown;
  public checks: VerificationCheck[];

  public constructor({
    utilizationRatio = null,
    demand = null,
    capacity = null,
    checks = [],
    ...result
  }: VerificationResultOptions<TOutputs>) {
    super(result);

    this.utilizationRatio = utilizationRatio;
    this.demand = demand;
    this.capacity = capacity;
    this.checks = [...checks];
  }

  public isVerified(): boolean {
    if (this.status !== RESULT_STATUS.OK) {
      return false;
    }

    if (this.checks.length > 0) {
      return this.checks.every((check) => check.ok === true);
    }

    return this.utilizationRatio === null || this.utilizationRatio <= 1;
  }

  public override toJSON(): VerificationResultJson<TOutputs> {
    return {
      ...super.toJSON(),
      utilizationRatio: this.utilizationRatio,
      demand: this.demand,
      capacity: this.capacity,
      checks: [...this.checks],
    };
  }
}
