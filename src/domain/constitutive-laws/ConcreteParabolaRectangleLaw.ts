import type { ConcreteUltimateConstitutiveLaw, StrainLimits } from "./types.js";

export interface ConcreteParabolaRectangleLawOptions {
  fcd: number;
  ec2: number;
  ecu: number;
  tensionPositive?: boolean;
}

export interface ConcreteParabolaRectangleLawJson {
  type: "concrete-parabola-rectangle";
  fcd: number;
  ec2: number;
  ecu: number;
  tensionPositive: boolean;
}

export class ConcreteParabolaRectangleLaw implements ConcreteUltimateConstitutiveLaw {
  fcd: number;
  ec2: number;
  ecu: number;
  tensionPositive: boolean;

  constructor({ fcd, ec2, ecu, tensionPositive = true }: ConcreteParabolaRectangleLawOptions) {
    if (!Number.isFinite(fcd) || fcd <= 0) {
      throw new Error("ConcreteParabolaRectangleLaw requires a positive fcd.");
    }

    if (!Number.isFinite(ec2) || ec2 <= 0) {
      throw new Error("ConcreteParabolaRectangleLaw requires a positive ec2.");
    }

    if (!Number.isFinite(ecu) || ecu <= 0 || ecu < ec2) {
      throw new Error("ConcreteParabolaRectangleLaw requires ecu >= ec2 > 0.");
    }

    this.fcd = fcd;
    this.ec2 = ec2;
    this.ecu = ecu;
    this.tensionPositive = tensionPositive;
  }

  peakCompressionStrain(): number {
    return this.ec2;
  }

  stress(strain: number): number {
    if (!Number.isFinite(strain)) {
      throw new Error("A finite strain value is required.");
    }

    const compressionStrain = this.tensionPositive ? -strain : strain;

    if (compressionStrain <= 0) {
      return 0;
    }

    if (compressionStrain <= this.ec2) {
      const ratio = compressionStrain / this.ec2;
      const compressionStress = this.fcd * (2 * ratio - ratio ** 2);
      return this.tensionPositive ? -compressionStress : compressionStress;
    }

    return this.tensionPositive ? -this.fcd : this.fcd;
  }

  strainLimits(): StrainLimits {
    return {
      tension: Number.POSITIVE_INFINITY,
      compression: this.tensionPositive ? -this.ecu : this.ecu,
    };
  }

  toJSON(): ConcreteParabolaRectangleLawJson {
    return {
      type: "concrete-parabola-rectangle",
      fcd: this.fcd,
      ec2: this.ec2,
      ecu: this.ecu,
      tensionPositive: this.tensionPositive,
    };
  }
}
