import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystem,
} from "../../domain/units/UnitSystem.js";
import type {
  RcColumnDetailingInput,
  RcColumnModelMetadata,
  RcColumnShearAxisInput,
  ReinforcedConcreteColumnModelOptions,
  ResolvedRcColumnActions,
  ResolvedRcColumnDetailing,
  ResolvedRcColumnShear,
  ResolvedRcColumnShearAxis,
  ResolvedRcColumnStability,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystem;

function positiveLength(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive length.`);
  }

  return value as number;
}

function convertShearAxis(
  input: RcColumnShearAxisInput | null | undefined,
  resolver: UnitResolver,
  label: "x" | "y",
): ResolvedRcColumnShearAxis | null {
  if (!input) return null;

  return {
    ...input,
    vEd: input.vEd == null ? null : resolver.force(Number(input.vEd)),
    bw: resolver.length(Number(input.bw)),
    effectiveDepth: resolver.length(Number(input.effectiveDepth)),
    longitudinalReinforcementArea: resolver.area(Number(input.longitudinalReinforcementArea)),
    transverseReinforcement: input.transverseReinforcement
      ? {
          ...input.transverseReinforcement,
          areaPerSpacing: resolver.length(Number(input.transverseReinforcement.areaPerSpacing)),
          spacing:
            input.transverseReinforcement.spacing == null
              ? null
              : resolver.length(Number(input.transverseReinforcement.spacing)),
          area:
            input.transverseReinforcement.area == null
              ? null
              : resolver.area(Number(input.transverseReinforcement.area)),
        }
      : null,
    label,
  };
}

function convertDetailing(
  input: RcColumnDetailingInput | null | undefined,
  resolver: UnitResolver,
): ResolvedRcColumnDetailing | null {
  if (!input) return null;

  const length = (value: unknown): number | null =>
    value == null ? null : resolver.length(Number(value));
  const area = (value: unknown): number | null =>
    value == null ? null : resolver.area(Number(value));

  return {
    ...structuredClone(input),
    longitudinal: input.longitudinal
      ? {
          ...input.longitudinal,
          area: area(input.longitudinal.area),
          minimumBarDiameter: length(input.longitudinal.minimumBarDiameter),
          maximumBarDiameter: length(input.longitudinal.maximumBarDiameter),
          maximumBarSpacing: length(input.longitudinal.maximumBarSpacing),
        }
      : null,
    transverse: input.transverse
      ? {
          ...input.transverse,
          diameter: length(input.transverse.diameter),
          spacing: length(input.transverse.spacing),
        }
      : null,
    confinement: input.confinement
      ? {
          ...input.confinement,
          coreWidth: length(input.confinement.coreWidth),
          coreDepth: length(input.confinement.coreDepth),
          volumePerSet:
            input.confinement.volumePerSet == null
              ? null
              : resolver.convert(Number(input.confinement.volumePerSet), {
                  lengthExponent: 3,
                }),
          restrainedBarSpacings: (input.confinement.restrainedBarSpacings ?? []).map((value) =>
            length(value),
          ),
        }
      : null,
    anchorage: input.anchorage
      ? {
          ...input.anchorage,
          barDiameter: length(input.anchorage.barDiameter),
          availableLength: length(input.anchorage.availableLength),
        }
      : null,
  };
}

export class ReinforcedConcreteColumnModel {
  id: string;
  section: ReinforcedConcreteColumnModelOptions["section"];
  concreteMaterial: ReinforcedConcreteColumnModelOptions["concreteMaterial"];
  reinforcementMaterial: ReinforcedConcreteColumnModelOptions["reinforcementMaterial"];
  length: number;
  stability: ResolvedRcColumnStability;
  actions: ResolvedRcColumnActions;
  shear: ResolvedRcColumnShear | null;
  detailing: ResolvedRcColumnDetailing | null;
  mesh: NonNullable<ReinforcedConcreteColumnModelOptions["mesh"]>;
  solver: NonNullable<ReinforcedConcreteColumnModelOptions["solver"]>;
  units: UnitSystem;
  metadata: RcColumnModelMetadata;

  constructor({
    id,
    section,
    concreteMaterial = section?.concreteMaterial as
      | ReinforcedConcreteColumnModelOptions["concreteMaterial"]
      | undefined,
    reinforcementMaterial = section?.reinforcementMaterial as
      | ReinforcedConcreteColumnModelOptions["reinforcementMaterial"]
      | undefined,
    length,
    stability = {},
    actions = {},
    shear = null,
    detailing = null,
    mesh = { targetFiberCount: 120 },
    solver = { tolerance: 1e-6, maxIterations: 100 },
    units,
    metadata = {},
  }: ReinforcedConcreteColumnModelOptions) {
    if (!id) {
      throw new Error("A reinforced concrete column model id is required.");
    }

    if (!section) {
      throw new Error("ReinforcedConcreteColumnModel requires a section.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteColumnModel");
    const resolver = createUnitResolver(units, INTERNAL_UNITS);
    const resolvedLength = positiveLength(
      resolver.length(length),
      "ReinforcedConcreteColumnModel length",
    );
    const effectiveLengthMx = resolver.length(
      stability.effectiveLengthMx ?? stability.effectiveLengthY ?? stability.l0y ?? length,
    );
    const effectiveLengthMy = resolver.length(
      stability.effectiveLengthMy ?? stability.effectiveLengthZ ?? stability.l0z ?? length,
    );

    positiveLength(effectiveLengthMx, "stability.effectiveLengthMx");
    positiveLength(effectiveLengthMy, "stability.effectiveLengthMy");

    this.id = id;
    this.section = section;
    this.concreteMaterial = concreteMaterial ?? null;
    this.reinforcementMaterial = reinforcementMaterial ?? null;
    this.length = resolvedLength;
    this.stability = {
      ...stability,
      effectiveLengthMx,
      effectiveLengthMy,
      compressionSignConvention: stability.compressionSignConvention ?? "compression-negative",
      designMomentsIncludeSecondOrder: stability.designMomentsIncludeSecondOrder ?? false,
      secondOrderMethod: stability.secondOrderMethod ?? "ntc2018-nominal-stiffness",
      creepCoefficient:
        stability.creepCoefficient == null ? null : Number(stability.creepCoefficient),
      momentDistributionFactor:
        stability.momentDistributionFactor == null ? 1 : Number(stability.momentDistributionFactor),
      includeImperfectionWhenMomentIsZero: stability.includeImperfectionWhenMomentIsZero ?? true,
    };
    this.actions = {
      ...actions,
      nEd: resolver.force(actions.nEd ?? actions.n ?? 0),
      mxEd: resolver.moment(actions.mxEd ?? actions.mzEd ?? 0),
      myEd: resolver.moment(actions.myEd ?? 0),
      mxEdTotal: resolver.moment(actions.mxEdTotal ?? actions.mzEdTotal ?? null),
      myEdTotal: resolver.moment(actions.myEdTotal ?? null),
      vxEd: resolver.force(actions.vxEd ?? 0),
      vyEd: resolver.force(actions.vyEd ?? 0),
    };
    const capacityDesign = shear?.capacityDesign ?? null;
    if (capacityDesign) {
      if (detailing?.seismic?.enabled !== true) {
        throw new Error(
          "shear.capacityDesign requires an explicit dissipative detailing.seismic contract.",
        );
      }
      if (capacityDesign.endMomentsPreAdjustedForHierarchy !== true) {
        throw new Error(
          "shear.capacityDesign.endMomentsPreAdjustedForHierarchy must be true: Eq. [7.4.5] requires each end resistance to be reduced by its beam/column hierarchy ratio before applying gammaRd.",
        );
      }

      const axes = [
        ["x", shear?.x, capacityDesign.endMomentsX],
        ["y", shear?.y, capacityDesign.endMomentsY],
      ] as const;
      for (const [axisId, axis, endMoments] of axes) {
        if (
          axis &&
          (!Array.isArray(endMoments) ||
            endMoments.length !== 2 ||
            endMoments.some((value) => !Number.isFinite(Number(value))))
        ) {
          throw new Error(
            `shear.capacityDesign.endMoments${axisId.toUpperCase()} must contain the two finite, hierarchy-adjusted end resistances.`,
          );
        }
      }
    }
    this.shear = shear
      ? {
          x: convertShearAxis(shear.x, resolver, "x"),
          y: convertShearAxis(shear.y, resolver, "y"),
          capacityDesign: capacityDesign
            ? {
                ...capacityDesign,
                clearLength: resolver.length(Number(capacityDesign.clearLength ?? length)),
                endMomentsX: (capacityDesign.endMomentsX ?? []).map((value) =>
                  resolver.moment(Number(value)),
                ),
                endMomentsY: (capacityDesign.endMomentsY ?? []).map((value) =>
                  resolver.moment(Number(value)),
                ),
              }
            : null,
        }
      : null;
    this.detailing = convertDetailing(detailing, resolver);
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.units = INTERNAL_UNITS;
    this.metadata = {
      ...metadata,
      unitSystem: INTERNAL_UNITS,
      sourceUnitSystem: resolver.sourceUnitSystem,
    };
  }
}
