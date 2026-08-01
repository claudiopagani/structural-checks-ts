import {
  FrameElement2DEulerBernoulli,
  type ElasticFrameCrossSection,
  type FrameElement2DEulerBernoulliInput,
} from "./FrameElement2DEulerBernoulli.js";
import type { NumericMatrix } from "../../math/arrayLinearAlgebra.js";

export interface FrameElement2DTimoshenkoInput extends FrameElement2DEulerBernoulliInput {
  shearRigidity?: number | null;
  shearAreaAxis?: string;
  shearCorrectionFactor?: number | null;
}

export interface TimoshenkoLockingDiagnostics {
  formulation: "closed-form-timoshenko";
  shearFlexibilityCoefficient: number;
  shearLockingControlled: true;
}

function assertPositive(value: number | null | undefined, label: string): asserts value is number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`FrameElement2DTimoshenko requires a positive ${label}.`);
  }
}

function resolveShearArea(
  crossSection: ElasticFrameCrossSection | null,
  shearAreaAxis: string,
): { area: number; usesEffectiveShearArea: boolean } {
  const shearArea = crossSection
    ? (crossSection as unknown as Record<string, unknown>)[shearAreaAxis]
    : undefined;
  const numericShearArea = typeof shearArea === "number" ? shearArea : undefined;

  if (Number.isFinite(numericShearArea)) {
    assertPositive(numericShearArea, `cross-section ${shearAreaAxis}`);
    return { area: numericShearArea, usesEffectiveShearArea: true };
  }

  const area = crossSection?.area;

  assertPositive(area, "cross-section area");

  return { area, usesEffectiveShearArea: false };
}

export class FrameElement2DTimoshenko extends FrameElement2DEulerBernoulli {
  readonly shearRigidity: number | null;
  readonly shearAreaAxis: string;
  readonly shearCorrectionFactor: number | null;

  constructor({
    id,
    startNode,
    endNode,
    material = null,
    crossSection = null,
    axialRigidity = null,
    flexuralRigidity = null,
    shearRigidity = null,
    bendingInertiaAxis = "inertiaY",
    shearAreaAxis = "shearAreaY",
    shearCorrectionFactor = null,
    metadata = {},
  }: FrameElement2DTimoshenkoInput) {
    super({
      id,
      startNode,
      endNode,
      material,
      crossSection,
      axialRigidity,
      flexuralRigidity,
      bendingInertiaAxis,
      metadata,
    });

    this.type = "frame-2d-timoshenko";
    this.shearRigidity = shearRigidity;
    this.shearAreaAxis = shearAreaAxis;
    this.shearCorrectionFactor = shearCorrectionFactor;
  }

  resolvedShearCorrectionFactor({
    usesEffectiveShearArea = false,
  }: {
    usesEffectiveShearArea?: boolean;
  } = {}): number {
    const correctionFactor = this.shearCorrectionFactor ?? (usesEffectiveShearArea ? 1 : 5 / 6);

    assertPositive(correctionFactor, "shearCorrectionFactor");

    return correctionFactor;
  }

  resolvedEffectiveShearRigidity(): number {
    if (Number.isFinite(this.shearRigidity)) {
      assertPositive(this.shearRigidity, "shearRigidity");

      return (
        this.shearRigidity * this.resolvedShearCorrectionFactor({ usesEffectiveShearArea: false })
      );
    }

    const shearModulus = this.material?.shearModulus;
    const { area, usesEffectiveShearArea } = resolveShearArea(
      this.crossSection,
      this.shearAreaAxis,
    );

    assertPositive(shearModulus, "material shear modulus");

    return shearModulus * area * this.resolvedShearCorrectionFactor({ usesEffectiveShearArea });
  }

  resolvedShearRigidity(): number {
    return this.resolvedEffectiveShearRigidity();
  }

  shearFlexibilityCoefficient(): number {
    const { length } = this.directionCosines();
    const ei = this.resolvedFlexuralRigidity();
    const kga = this.resolvedEffectiveShearRigidity();

    return (12 * ei) / (kga * length ** 2);
  }

  lockingDiagnostics(): TimoshenkoLockingDiagnostics {
    return {
      formulation: "closed-form-timoshenko",
      shearFlexibilityCoefficient: this.shearFlexibilityCoefficient(),
      shearLockingControlled: true,
    };
  }

  override localStiffness(): NumericMatrix {
    const { length } = this.directionCosines();
    const ea = this.resolvedAxialRigidity();
    const ei = this.resolvedFlexuralRigidity();
    const phi = this.shearFlexibilityCoefficient();
    const l = length;
    const axial = ea / l;
    const bending = ei / (l ** 3 * (1 + phi));

    return [
      [axial, 0, 0, -axial, 0, 0],
      [0, 12 * bending, 6 * l * bending, 0, -12 * bending, 6 * l * bending],
      [
        0,
        6 * l * bending,
        (4 + phi) * l ** 2 * bending,
        0,
        -6 * l * bending,
        (2 - phi) * l ** 2 * bending,
      ],
      [-axial, 0, 0, axial, 0, 0],
      [0, -12 * bending, -6 * l * bending, 0, 12 * bending, -6 * l * bending],
      [
        0,
        6 * l * bending,
        (2 - phi) * l ** 2 * bending,
        0,
        -6 * l * bending,
        (4 + phi) * l ** 2 * bending,
      ],
    ];
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      shearRigidity: this.shearRigidity,
      shearAreaAxis: this.shearAreaAxis,
      shearCorrectionFactor: this.shearCorrectionFactor,
    };
  }
}
