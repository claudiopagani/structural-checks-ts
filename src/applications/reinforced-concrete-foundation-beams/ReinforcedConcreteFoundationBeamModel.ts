import type {
  RcBeamSolverOptions,
  ReinforcedConcreteBeamVerificationOptions,
} from "../reinforced-concrete-sections/checks/ReinforcedConcreteBeamVerification.js";
import type { RcServiceabilityOptions } from "../reinforced-concrete-sections/checks/serviceability/serviceabilityOptions.js";
import { ConcreteMaterial } from "../../domain/materials/ConcreteMaterial.js";
import type { ReinforcedConcreteSection } from "../../domain/geometry/ReinforcedConcreteSection.js";
import { SteelMaterial } from "../../domain/materials/SteelMaterial.js";
import {
  ReinforcedConcreteBeamSectionProvider,
  type ReinforcedConcreteBeamSectionProviderOptions,
} from "../../domain/beams/ReinforcedConcreteBeamSectionProvider.js";
import {
  FoundationBeamModel,
  type FoundationBeamModelOptions,
} from "../../domain/foundations/FoundationBeamModel.js";
import type { UnitSystemInput } from "../../domain/units/UnitSystem.js";
import type { BeamVerificationStations } from "../../domain/beams/BeamSectionActionVerifier.js";

export interface ReinforcedConcreteFoundationBeamCrackedStiffnessOptions {
  enabled?: boolean;
  modularRatio?: number;
  creepCoefficient?: number;
  betaShortTerm?: number;
  betaLongTerm?: number;
  momentSamples?: number;
  axialForceTolerance?: number;
}

export interface ReinforcedConcreteFoundationBeamVerificationOptions
  extends Omit<ReinforcedConcreteBeamVerificationOptions, "metadata"> {
  serviceability?: RcServiceabilityOptions | false;
  crackedStiffness?: ReinforcedConcreteFoundationBeamCrackedStiffnessOptions | false;
}

export interface ReinforcedConcreteFoundationBeamModelOptions
  extends Omit<FoundationBeamModelOptions, "sectionProvider" | "section" | "material"> {
  section: ReinforcedConcreteSection;
  concreteMaterial?: ConcreteMaterial | null;
  reinforcementMaterial?: SteelMaterial | null;
  stiffnessState?: string;
  verification?: ReinforcedConcreteFoundationBeamVerificationOptions;
}

export interface ReinforcedConcreteFoundationBeamVerificationSettings {
  code: string;
  mesh: NonNullable<ReinforcedConcreteBeamVerificationOptions["mesh"]>;
  solver: RcBeamSolverOptions;
  shear: ReinforcedConcreteBeamVerificationOptions["shear"];
  torsion: ReinforcedConcreteBeamVerificationOptions["torsion"];
  serviceability: RcServiceabilityOptions | false;
  crackedStiffness:
    | false
    | {
        enabled: true;
        modularRatio: number;
        creepCoefficient: number;
        betaShortTerm: number;
        betaLongTerm: number;
        momentSamples: number;
        axialForceTolerance: number;
      };
  verificationStations: BeamVerificationStations | null;
}

function resolveConcreteMaterial(
  section: ReinforcedConcreteSection,
  material: ConcreteMaterial | null | undefined,
): ConcreteMaterial | null {
  return (
    material ??
    (section.concreteMaterial instanceof ConcreteMaterial ? section.concreteMaterial : null)
  );
}

function resolveReinforcementMaterial(
  section: ReinforcedConcreteSection,
  material: SteelMaterial | null | undefined,
): SteelMaterial | null {
  return (
    material ??
    (section.reinforcementMaterial instanceof SteelMaterial ? section.reinforcementMaterial : null)
  );
}

export class ReinforcedConcreteFoundationBeamModel extends FoundationBeamModel {
  readonly section: ReinforcedConcreteSection;
  readonly concreteMaterial: ConcreteMaterial;
  readonly reinforcementMaterial: SteelMaterial;
  readonly stiffnessState: string;
  readonly verification: ReinforcedConcreteFoundationBeamVerificationSettings;

  public constructor({
    section,
    concreteMaterial = null,
    reinforcementMaterial = null,
    stiffnessState = "transformed",
    verification = {},
    ...input
  }: ReinforcedConcreteFoundationBeamModelOptions) {
    if (!section) {
      throw new Error("ReinforcedConcreteFoundationBeamModel requires a section.");
    }

    const resolvedConcrete = resolveConcreteMaterial(section, concreteMaterial);
    const resolvedReinforcement = resolveReinforcementMaterial(section, reinforcementMaterial);

    if (!resolvedConcrete || !resolvedReinforcement) {
      throw new Error(
        "ReinforcedConcreteFoundationBeamModel requires concrete and reinforcement materials.",
      );
    }

    const providerOptions: ReinforcedConcreteBeamSectionProviderOptions = {
      section,
      concreteMaterial: resolvedConcrete,
      reinforcementMaterial: resolvedReinforcement,
      stiffnessState,
      units:
        (section.metadata.unitSystem as UnitSystemInput | undefined | null) ?? input.units ?? null,
    };

    super({
      ...input,
      foundation: {
        ...input.foundation,
        contactModel: input.foundation?.contactModel ?? "compression-only",
      },
      sectionProvider: new ReinforcedConcreteBeamSectionProvider(providerOptions),
    });

    this.section = section;
    this.concreteMaterial = resolvedConcrete;
    this.reinforcementMaterial = resolvedReinforcement;
    this.stiffnessState = stiffnessState;
    const serviceability = verification.serviceability;
    const deflection = serviceability !== false ? serviceability?.deflection : undefined;
    const deflectionSettings = deflection !== false ? deflection : undefined;

    this.verification = {
      code: verification.code ?? "NTC2018",
      mesh: { ...verification.mesh },
      solver: { ...verification.solver },
      shear: verification.shear ?? null,
      torsion: verification.torsion ?? null,
      serviceability:
        verification.serviceability === false
          ? false
          : {
              ...(verification.serviceability ?? {}),
              deflection: false,
            },
      crackedStiffness:
        verification.crackedStiffness === false
          ? false
          : {
              enabled: true,
              modularRatio: verification.crackedStiffness?.modularRatio ?? 15,
              creepCoefficient:
                verification.crackedStiffness?.creepCoefficient ??
                deflectionSettings?.creepCoefficient ??
                2,
              betaShortTerm: verification.crackedStiffness?.betaShortTerm ?? 1,
              betaLongTerm: verification.crackedStiffness?.betaLongTerm ?? 0.5,
              momentSamples: verification.crackedStiffness?.momentSamples ?? 40,
              axialForceTolerance: verification.crackedStiffness?.axialForceTolerance ?? 10000,
            },
      verificationStations: (verification.verificationStations ??
        input.verificationStations ??
        null) as BeamVerificationStations | null,
    };
  }
}
