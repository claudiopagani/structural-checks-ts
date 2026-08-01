import type { ConstitutiveLaw, StrainLimits } from "./types.js";

export interface SteelElasticLawOptions {
  Es: number;
  stressCap?: number | null;
  tensionPositive?: boolean;
}

export interface SteelElasticLawJson {
  type: "steel-elastic";
  Es: number;
  stressCap: number | null;
  tensionPositive: boolean;
}

export class SteelElasticLaw implements ConstitutiveLaw {
  readonly Es: number;
  readonly stressCap: number | null;
  readonly tensionPositive: boolean;

  constructor({ Es, stressCap = null, tensionPositive = true }: SteelElasticLawOptions) {
    if (!Number.isFinite(Es) || Es <= 0) {
      throw new Error("SteelElasticLaw requires a positive Es.");
    }

    if (stressCap != null && (!Number.isFinite(stressCap) || stressCap <= 0)) {
      throw new Error("SteelElasticLaw stressCap must be positive.");
    }

    this.Es = Es;
    this.stressCap = stressCap;
    this.tensionPositive = tensionPositive;
  }

  stress(strain: number): number {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    let stress = this.Es * strain;

    if (this.stressCap != null) {
      stress = Math.max(-this.stressCap, Math.min(this.stressCap, stress));
    }

    return this.tensionPositive ? stress : -stress;
  }

  strainLimits(): StrainLimits {
    return {
      tension:
        this.stressCap == null
          ? Number.POSITIVE_INFINITY
          : this.tensionPositive
            ? this.stressCap / this.Es
            : -(this.stressCap / this.Es),
      compression:
        this.stressCap == null
          ? Number.NEGATIVE_INFINITY
          : this.tensionPositive
            ? -(this.stressCap / this.Es)
            : this.stressCap / this.Es,
    };
  }

  toJSON(): SteelElasticLawJson {
    return {
      type: "steel-elastic",
      Es: this.Es,
      stressCap: this.stressCap,
      tensionPositive: this.tensionPositive,
    };
  }
}
