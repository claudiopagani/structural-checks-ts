import type { SteelUltimateConstitutiveLaw, StrainLimits } from "./types.js";

export interface SteelElasticPlasticHardeningLawOptions {
  Es: number;
  fyd: number;
  ftd?: number | null;
  esu?: number;
  hardeningModulus?: number | null;
  tensionPositive?: boolean;
}

export class SteelElasticPlasticHardeningLaw implements SteelUltimateConstitutiveLaw {
  Es: number;
  fyd: number;
  ftd: number;
  esu: number;
  hardeningModulus: number;
  tensionPositive: boolean;

  constructor({
    Es,
    fyd,
    ftd = null,
    esu = 0.01,
    hardeningModulus = null,
    tensionPositive = true,
  }: SteelElasticPlasticHardeningLawOptions) {
    if (!Number.isFinite(Es) || Es <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive Es.");
    }

    if (!Number.isFinite(fyd) || fyd <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive fyd.");
    }

    if (!Number.isFinite(esu) || esu <= 0) {
      throw new Error("SteelElasticPlasticHardeningLaw requires a positive esu.");
    }

    const ey = fyd / Es;

    if (esu <= ey) {
      throw new Error("SteelElasticPlasticHardeningLaw requires esu greater than yield strain.");
    }

    if (ftd != null && (!Number.isFinite(ftd) || ftd < fyd)) {
      throw new Error("SteelElasticPlasticHardeningLaw requires ftd >= fyd.");
    }

    if (hardeningModulus != null && (!Number.isFinite(hardeningModulus) || hardeningModulus < 0)) {
      throw new Error("SteelElasticPlasticHardeningLaw hardeningModulus must be non-negative.");
    }

    this.Es = Es;
    this.fyd = fyd;
    this.ftd = ftd ?? fyd;
    this.esu = esu;
    this.hardeningModulus = hardeningModulus ?? (this.ftd - this.fyd) / (this.esu - ey);
    this.tensionPositive = tensionPositive;
  }

  yieldStrain(): number {
    return this.fyd / this.Es;
  }

  stress(strain: number): number {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const sign = strain < 0 ? -1 : 1;
    const absoluteStrain = Math.abs(strain);
    const ey = this.yieldStrain();
    const absoluteStress =
      absoluteStrain <= ey
        ? this.Es * absoluteStrain
        : Math.min(this.ftd, this.fyd + this.hardeningModulus * (absoluteStrain - ey));
    const stress = sign * absoluteStress;

    return this.tensionPositive ? stress : -stress;
  }

  strainLimits(): StrainLimits {
    return {
      tension: this.tensionPositive ? this.esu : -this.esu,
      compression: this.tensionPositive ? -this.esu : this.esu,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      type: "steel-elastic-plastic-hardening",
      Es: this.Es,
      fyd: this.fyd,
      ftd: this.ftd,
      esu: this.esu,
      hardeningModulus: this.hardeningModulus,
      tensionPositive: this.tensionPositive,
    };
  }
}
