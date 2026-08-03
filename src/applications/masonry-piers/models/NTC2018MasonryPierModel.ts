import { createUnitResolver, type UnitSystemInput } from "../../../domain/units/UnitSystem.js";
import {
  evaluateNTC2018MasonryPier,
  type NTC2018MasonryPierMaterial,
  type NTC2018MasonryPierEvaluation,
} from "../../../norms/ntc2018/masonry/index.js";
import {
  MasonryPierModel,
  type MasonryPierActionsInput,
  type MasonryPierDesignInput,
  type MasonryPierGeometryInput,
  type MasonryPierIdealizationInput,
  type MasonryPierMetadata,
  type MasonryPierModelJson,
  type MasonryPierModelOptions,
} from "./MasonryPierModel.js";

const INTERNAL_UNITS = { force: "N", length: "mm" } as const;

export interface NTC2018MasonryPierNormativeInput extends Record<string, unknown> {
  scope?: string;
  masonryTexture?: string;
  modernPerforatedBlocks?: boolean;
  boundaryCondition?: string;
  topRotation?: string;
  effectiveLength?: number;
  shearSpan?: number | null;
  crackedStiffnessFactor?: number | null;
  shearCorrectionFactor?: number | null;
  shearStrengthLimit?: number | null;
  diagonalTensileStrength?: number | null;
  blockCompressiveStrength?: number | null;
  blockTensileStrength?: number | null;
  interlockingCoefficient?: number | null;
  localFrictionCoefficient?: number | null;
}

export interface NTC2018MasonryPierModelOptions
  extends Omit<
    MasonryPierModelOptions,
    "geometry" | "material" | "actions" | "design" | "idealization"
  > {
  units?: UnitSystemInput | null | undefined;
  geometry?: MasonryPierGeometryInput;
  material?: unknown;
  actions?: MasonryPierActionsInput & {
    shearAxialForce?: number | null;
    midHeightAxialForce?: number | null;
    lateralDisplacement?: number | null;
  };
  design?: MasonryPierDesignInput;
  idealization?: MasonryPierIdealizationInput;
  normative?: NTC2018MasonryPierNormativeInput;
  metadata?: MasonryPierMetadata;
}

export interface NTC2018MasonryPierNormativeState extends Record<string, unknown> {
  scope: string;
  analysisType: string;
  limitState: string;
  masonryTexture: string;
  modernPerforatedBlocks: boolean;
  boundaryCondition: "cantilever" | "fixed-fixed";
  effectiveLength: number;
  shearSpan: number | null;
  crackedStiffnessFactor: number;
  shearCorrectionFactor: number;
  shearAxialCompression: number | null;
  lateralDisplacement: number | null;
  interlockingCoefficient: number | null;
  localFrictionCoefficient: number;
  diagonalTensileStrength: number | null;
  blockCompressiveStrength: number | null;
  blockTensileStrength: number | null;
  shearStrengthLimit: number | null;
  strengthConfidenceFactor: number;
}

export interface NTC2018MasonryPierEvaluationInput {
  lateralDisplacement?: number | null;
}

export interface NTC2018MasonryPierResolvedMaterial extends Record<string, unknown> {
  compressiveStrength: number | null;
  cohesion: number | null;
  referenceShearStrength: number | null;
  diagonalTensileStrength: number | null;
  shearStrengthLimit: number | null;
  blockCompressiveStrength: number | null;
  blockTensileStrength: number | null;
  interlockingCoefficient: number | null;
  localFrictionCoefficient: number;
  elasticModulus: number | null;
  shearModulus: number | null;
}

function normalizeScope(value = "existing"): string {
  const normalized = String(value).trim().toLowerCase();
  if (normalized !== "existing") {
    throw new Error(
      `Unsupported NTC 2018 masonry pier scope: ${value}. The autonomous three-mechanism model currently covers existing unreinforced masonry only.`,
    );
  }
  return normalized;
}

function normalizeTexture(value = "irregular"): string {
  const normalized = String(value).trim().toLowerCase();
  if (normalized !== "irregular" && normalized !== "regular") {
    throw new Error(`Unsupported NTC 2018 masonry texture: ${value}.`);
  }
  return normalized;
}

function normalizeBoundaryCondition(value = "cantilever"): "cantilever" | "fixed-fixed" {
  const normalized = String(value).trim().toLowerCase();
  const aliases = new Map<string, "cantilever" | "fixed-fixed">([
    ["cantilever", "cantilever"],
    ["free", "cantilever"],
    ["fixed-fixed", "fixed-fixed"],
    ["fixed", "fixed-fixed"],
  ]);
  const resolved = aliases.get(normalized);
  if (!resolved) {
    throw new Error(`Unsupported NTC 2018 pier boundary condition: ${value}.`);
  }
  return resolved;
}

function finiteOrNull(
  value: number | null | undefined,
  converter: (value: number) => number = (item) => item,
): number | null {
  return typeof value === "number" && Number.isFinite(value) ? converter(value) : null;
}

export class NTC2018MasonryPierModel extends MasonryPierModel {
  public normative: NTC2018MasonryPierNormativeState;

  public constructor({
    units,
    geometry = {},
    material = null,
    actions = {},
    design = {},
    idealization = {},
    normative = {},
    ...rest
  }: NTC2018MasonryPierModelOptions) {
    const unitResolver = createUnitResolver(units, INTERNAL_UNITS);

    super({
      ...rest,
      units,
      geometry,
      material,
      actions,
      design,
      idealization,
    });

    const scope = normalizeScope(normative.scope);
    const strengthConfidenceFactor = scope === "existing" ? this.resolvedConfidenceFactor() : 1;

    if (!Number.isFinite(strengthConfidenceFactor) || strengthConfidenceFactor <= 0) {
      throw new Error(
        "NTC2018MasonryPierModel requires a positive confidence factor for existing masonry.",
      );
    }

    const blockCompressiveStrength = finiteOrNull(
      normative.blockCompressiveStrength,
      unitResolver.stress,
    );
    const blockTensileStrength = finiteOrNull(normative.blockTensileStrength, unitResolver.stress);
    const explicitShearStrengthLimit = finiteOrNull(
      normative.shearStrengthLimit,
      unitResolver.stress,
    );
    const effectiveStrength = (value: number | null): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value / strengthConfidenceFactor : null;
    const effectiveBlockCompression = effectiveStrength(blockCompressiveStrength);

    this.normative = {
      scope,
      analysisType: "nonlinear-static",
      limitState: "SLC",
      masonryTexture: normalizeTexture(normative.masonryTexture),
      modernPerforatedBlocks: Boolean(normative.modernPerforatedBlocks),
      boundaryCondition: normalizeBoundaryCondition(
        normative.boundaryCondition ??
          (normative.topRotation === "fixed" ? "fixed-fixed" : "cantilever"),
      ),
      effectiveLength:
        finiteOrNull(geometry.effectiveLength, unitResolver.length) ?? this.geometry.length,
      shearSpan: finiteOrNull(normative.shearSpan, unitResolver.length),
      crackedStiffnessFactor:
        normative.crackedStiffnessFactor == null ? 0.5 : Number(normative.crackedStiffnessFactor),
      shearCorrectionFactor:
        normative.shearCorrectionFactor ?? this.idealization.shearCorrectionFactor ?? 5 / 6,
      shearAxialCompression: finiteOrNull(
        actions.shearAxialForce ?? actions.midHeightAxialForce,
        unitResolver.force,
      ),
      lateralDisplacement: finiteOrNull(actions.lateralDisplacement, unitResolver.length),
      interlockingCoefficient: finiteOrNull(normative.interlockingCoefficient),
      localFrictionCoefficient:
        normative.localFrictionCoefficient == null
          ? 0.577
          : Number(normative.localFrictionCoefficient),
      diagonalTensileStrength: effectiveStrength(
        finiteOrNull(normative.diagonalTensileStrength, unitResolver.stress),
      ),
      blockCompressiveStrength: effectiveBlockCompression,
      blockTensileStrength: effectiveStrength(
        blockTensileStrength ??
          (typeof blockCompressiveStrength === "number" ? 0.1 * blockCompressiveStrength : null),
      ),
      shearStrengthLimit: effectiveStrength(
        explicitShearStrengthLimit ??
          (typeof blockCompressiveStrength === "number"
            ? (0.065 * blockCompressiveStrength) / 0.7
            : null),
      ),
      strengthConfidenceFactor,
    };
  }

  public resolvedNormativeMaterial(): NTC2018MasonryPierResolvedMaterial {
    const confidenceFactor = this.normative.strengthConfidenceFactor;
    const reduceStrength = (value: number | null): number | null =>
      typeof value === "number" && Number.isFinite(value) ? value / confidenceFactor : null;

    return {
      compressiveStrength: reduceStrength(this.resolveMaterialProperty("fm")),
      cohesion: reduceStrength(this.resolveMaterialProperty("fv0")),
      referenceShearStrength: reduceStrength(this.resolveMaterialProperty("tau0")),
      diagonalTensileStrength: this.normative.diagonalTensileStrength,
      shearStrengthLimit: this.normative.shearStrengthLimit,
      blockCompressiveStrength: this.normative.blockCompressiveStrength,
      blockTensileStrength: this.normative.blockTensileStrength,
      interlockingCoefficient: this.normative.interlockingCoefficient,
      localFrictionCoefficient: this.normative.localFrictionCoefficient,
      elasticModulus: this.resolvedElasticModulus(),
      shearModulus: this.resolvedShearModulus(),
    };
  }

  public evaluate({
    lateralDisplacement = this.normative.lateralDisplacement,
  }: NTC2018MasonryPierEvaluationInput = {}): NTC2018MasonryPierEvaluation {
    const axialCompression = Math.max(0, this.compressiveAxialForce());
    const resolvedMaterial = this.resolvedNormativeMaterial();
    const material: NTC2018MasonryPierMaterial = {};
    if (resolvedMaterial.compressiveStrength !== null) {
      material.compressiveStrength = resolvedMaterial.compressiveStrength;
    }
    if (resolvedMaterial.cohesion !== null) material.cohesion = resolvedMaterial.cohesion;
    if (resolvedMaterial.referenceShearStrength !== null) {
      material.referenceShearStrength = resolvedMaterial.referenceShearStrength;
    }
    if (resolvedMaterial.diagonalTensileStrength !== null) {
      material.diagonalTensileStrength = resolvedMaterial.diagonalTensileStrength;
    }
    if (resolvedMaterial.shearStrengthLimit !== null) {
      material.shearStrengthLimit = resolvedMaterial.shearStrengthLimit;
    }
    if (resolvedMaterial.blockCompressiveStrength !== null) {
      material.blockCompressiveStrength = resolvedMaterial.blockCompressiveStrength;
    }
    if (resolvedMaterial.blockTensileStrength !== null) {
      material.blockTensileStrength = resolvedMaterial.blockTensileStrength;
    }
    if (resolvedMaterial.interlockingCoefficient !== null) {
      material.interlockingCoefficient = resolvedMaterial.interlockingCoefficient;
    }
    material.localFrictionCoefficient = resolvedMaterial.localFrictionCoefficient;
    if (resolvedMaterial.elasticModulus !== null) {
      material.elasticModulus = resolvedMaterial.elasticModulus;
    }
    if (resolvedMaterial.shearModulus !== null) {
      material.shearModulus = resolvedMaterial.shearModulus;
    }

    return evaluateNTC2018MasonryPier({
      geometry: {
        height: this.geometry.height,
        length: this.normative.effectiveLength,
        thickness: this.geometry.thickness,
        deformableHeight: this.deformableHeight(),
      },
      material,
      actions: {
        axialCompression,
        shearAxialCompression: this.normative.shearAxialCompression ?? axialCompression,
      },
      options: {
        scope: "existing",
        masonryTexture: this.normative.masonryTexture,
        modernPerforatedBlocks: this.normative.modernPerforatedBlocks,
        boundaryCondition: this.normative.boundaryCondition,
        shearSpan: this.normative.shearSpan,
        crackedStiffnessFactor: this.normative.crackedStiffnessFactor,
        shearCorrectionFactor: this.normative.shearCorrectionFactor,
      },
      lateralDisplacement,
    });
  }

  public override toJSON(): MasonryPierModelJson & {
    modelType: string;
    normative: NTC2018MasonryPierNormativeState;
  } {
    return {
      ...super.toJSON(),
      modelType: "ntc2018-masonry-pier-bilinear",
      normative: { ...this.normative },
    };
  }
}
