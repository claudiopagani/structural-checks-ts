export interface StrainLimits {
  tension: number | null;
  compression: number | null;
}

export interface ConstitutiveLaw {
  stress(strain: number): number;
  strainLimits(): StrainLimits;
}

export interface ConcreteUltimateConstitutiveLaw extends ConstitutiveLaw {
  peakCompressionStrain(): number;
}

export interface SteelUltimateConstitutiveLaw extends ConstitutiveLaw {
  yieldStrain(): number;
}
