import type { ConstitutiveLaw, StrainLimits } from "./types.js";

export interface ConcreteNoTensionLawOptions {
  ecm: number;
  fcd?: number | null;
  compressionCap?: number | null;
  tensionPositive?: boolean;
}

export interface ConcreteNoTensionLawJson {
  type: "concrete-no-tension";
  ecm: number;
  fcd: number | null;
  compressionCap: number | null;
  tensionPositive: boolean;
}

export class ConcreteNoTensionLaw implements ConstitutiveLaw {
  readonly ecm: number;
  readonly fcd: number | null;
  readonly compressionCap: number | null;
  readonly tensionPositive: boolean;

  constructor({
    ecm,
    fcd = null,
    compressionCap = null,
    tensionPositive = true,
  }: ConcreteNoTensionLawOptions) {
    if (!Number.isFinite(ecm) || ecm <= 0) {
      throw new Error("ConcreteNoTensionLaw requires a positive ecm.");
    }

    const resolvedCompressionCap = compressionCap ?? fcd;

    if (
      resolvedCompressionCap != null &&
      (!Number.isFinite(resolvedCompressionCap) || resolvedCompressionCap <= 0)
    ) {
      throw new Error("ConcreteNoTensionLaw compressionCap must be positive.");
    }

    this.ecm = ecm;
    this.fcd = fcd;
    this.compressionCap = resolvedCompressionCap;
    this.tensionPositive = tensionPositive;
  }

  stress(strain: number): number {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const compressionStrain = this.tensionPositive ? -strain : strain;

    if (compressionStrain <= 0) {
      return 0;
    }

    let compressionStress = this.ecm * compressionStrain;

    if (this.compressionCap != null) {
      compressionStress = Math.min(compressionStress, this.compressionCap);
    }

    return this.tensionPositive ? -compressionStress : compressionStress;
  }

  strainLimits(): StrainLimits {
    return {
      tension: Number.POSITIVE_INFINITY,
      compression:
        this.compressionCap == null
          ? Number.NEGATIVE_INFINITY
          : this.tensionPositive
            ? -(this.compressionCap / this.ecm)
            : this.compressionCap / this.ecm,
    };
  }

  toJSON(): ConcreteNoTensionLawJson {
    return {
      type: "concrete-no-tension",
      ecm: this.ecm,
      fcd: this.fcd,
      compressionCap: this.compressionCap,
      tensionPositive: this.tensionPositive,
    };
  }
}
