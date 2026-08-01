import type {
  ConstitutiveLaw,
  ConcreteUltimateConstitutiveLaw,
  SteelUltimateConstitutiveLaw,
} from "../../../domain/constitutive-laws/types.js";
import { ConcreteNoTensionLaw } from "../../../domain/constitutive-laws/ConcreteNoTensionLaw.js";
import { ConcreteParabolaRectangleLaw } from "../../../domain/constitutive-laws/ConcreteParabolaRectangleLaw.js";
import { ConcreteStressBlockLaw } from "../../../domain/constitutive-laws/ConcreteStressBlockLaw.js";
import { ConcreteTriangularRectangleLaw } from "../../../domain/constitutive-laws/ConcreteTriangularRectangleLaw.js";
import { SteelElasticPlasticHardeningLaw } from "../../../domain/constitutive-laws/SteelElasticPlasticHardeningLaw.js";
import { SteelElasticPerfectlyPlasticLaw } from "../../../domain/constitutive-laws/SteelElasticPerfectlyPlasticLaw.js";
import { SteelElasticLaw } from "../../../domain/constitutive-laws/SteelElasticLaw.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import type { ReinforcedConcreteSectionModel } from "../models/ReinforcedConcreteSectionModel.js";
import { resolveRcSleModularRatio } from "../serviceabilityDefaults.js";

function normalizeConcreteLawType(value = "parabola-rectangle"): string {
  const aliases: Record<string, string> = {
    "parabola-rectangle": "parabola-rectangle",
    "parabola-rettangolo": "parabola-rectangle",
    "triangular-rectangle": "triangular-rectangle",
    "triangolo-rettangolo": "triangular-rectangle",
    "stress-block": "stress-block",
    stressBlock: "stress-block",
    rettangolo: "stress-block",
    rectangular: "stress-block",
    "rectangular-stress-block": "stress-block",
  };

  return aliases[value] ?? value;
}

function normalizeSteelLawType(value = "elastic-perfectly-plastic"): string {
  const aliases: Record<string, string> = {
    "elastic-perfectly-plastic": "elastic-perfectly-plastic",
    "elasto-plastico": "elastic-perfectly-plastic",
    "elastic-plastic-hardening": "elastic-plastic-hardening",
    "elasto-plastico-incrudimento": "elastic-plastic-hardening",
    hardening: "elastic-plastic-hardening",
    incrudimento: "elastic-plastic-hardening",
  };

  return aliases[value] ?? value;
}

function resolveConcreteMaterial(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): ConcreteMaterial {
  return (model.materials.concreteMaterial ?? section.concreteMaterial) as ConcreteMaterial;
}

function resolveReinforcementMaterial(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): SteelMaterial {
  return (model.materials.reinforcementMaterial ?? section.reinforcementMaterial) as SteelMaterial;
}

function resolveSteelUltimateStrain(
  model: ReinforcedConcreteSectionModel,
  reinforcementMaterial: SteelMaterial,
  fallback = 0.01,
): number {
  const configured =
    model.analysisSettings.esu ?? model.analysisSettings.steelUltimateStrain ?? null;

  if (Number.isFinite(configured) && (configured as number) > 0) {
    return configured as number;
  }

  if (Number.isFinite(reinforcementMaterial.ultimateStrain)) {
    return reinforcementMaterial.ultimateStrain as number;
  }

  const metadataUltimateStrain = reinforcementMaterial.metadata.ultimateStrain;
  if (Number.isFinite(metadataUltimateStrain)) {
    return metadataUltimateStrain as number;
  }

  return fallback;
}

export function resolveConcreteLaw(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): ConcreteUltimateConstitutiveLaw {
  if (model.constitutiveModels.concreteLaw) {
    return model.constitutiveModels.concreteLaw as ConcreteUltimateConstitutiveLaw;
  }

  const concreteMaterial = resolveConcreteMaterial(model, section);

  if (!concreteMaterial?.fcd) {
    throw new Error("ReinforcedConcreteSectionVerification requires a concrete material with fcd.");
  }

  const concreteLawType = normalizeConcreteLawType(
    model.analysisSettings.concreteLawType ??
      model.analysisSettings.concreteModel ??
      "parabola-rectangle",
  );

  if (concreteLawType === "parabola-rectangle") {
    return new ConcreteParabolaRectangleLaw({
      fcd: concreteMaterial.fcd,
      ec2: model.analysisSettings.ec2 ?? 0.002,
      ecu: model.analysisSettings.ecu ?? 0.0035,
    });
  }

  if (concreteLawType === "triangular-rectangle") {
    return new ConcreteTriangularRectangleLaw({
      fcd: concreteMaterial.fcd,
      ec3: model.analysisSettings.ec3 ?? 0.00175,
      ecu: model.analysisSettings.ecu ?? 0.0035,
    });
  }

  if (concreteLawType === "stress-block") {
    return new ConcreteStressBlockLaw({
      fcd: concreteMaterial.fcd,
      eta: model.analysisSettings.eta ?? 1,
      ec4: model.analysisSettings.ec4 ?? 0,
      ecu: model.analysisSettings.ecu ?? 0.0035,
    });
  }

  throw new Error(`Unsupported concrete law type: ${concreteLawType}.`);
}

export function resolveSteelLaw(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): SteelUltimateConstitutiveLaw {
  if (model.constitutiveModels.steelLaw) {
    return model.constitutiveModels.steelLaw as SteelUltimateConstitutiveLaw;
  }

  const reinforcementMaterial = resolveReinforcementMaterial(model, section);

  if (!reinforcementMaterial?.elasticModulus || !reinforcementMaterial.fyd) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus and fyd.",
    );
  }

  const steelLawType = normalizeSteelLawType(
    model.analysisSettings.steelLawType ??
      model.analysisSettings.steelModel ??
      "elastic-perfectly-plastic",
  );

  if (steelLawType === "elastic-perfectly-plastic") {
    return new SteelElasticPerfectlyPlasticLaw({
      Es: reinforcementMaterial.elasticModulus,
      fyd: reinforcementMaterial.fyd,
      esu: resolveSteelUltimateStrain(model, reinforcementMaterial),
    });
  }

  if (steelLawType === "elastic-plastic-hardening") {
    const gammaS = (reinforcementMaterial.metadata.gammaS as number | undefined) ?? 1.15;
    const ftd =
      model.analysisSettings.ftd ??
      model.analysisSettings.steelUltimateDesignStress ??
      (Number.isFinite(reinforcementMaterial.ftk)
        ? (reinforcementMaterial.ftk as number) / gammaS
        : null);

    return new SteelElasticPlasticHardeningLaw({
      Es: reinforcementMaterial.elasticModulus,
      fyd: reinforcementMaterial.fyd,
      ftd,
      esu: resolveSteelUltimateStrain(model, reinforcementMaterial),
      hardeningModulus: model.analysisSettings.hardeningModulus ?? null,
    });
  }

  throw new Error(`Unsupported steel law type: ${steelLawType}.`);
}

export function resolveServiceConcreteLaw(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): ConstitutiveLaw {
  if (model.constitutiveModels.concreteLaw) {
    return model.constitutiveModels.concreteLaw;
  }

  const reinforcementMaterial = resolveReinforcementMaterial(model, section);
  const modularRatio = resolveRcSleModularRatio(model.analysisSettings.modularRatio);

  if (!reinforcementMaterial?.elasticModulus) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus for service-stress.",
    );
  }

  return new ConcreteNoTensionLaw({
    ecm: reinforcementMaterial.elasticModulus / modularRatio,
    compressionCap: model.analysisSettings.compressionCap ?? null,
  });
}

export function resolveServiceSteelLaw(
  model: ReinforcedConcreteSectionModel,
  section: ReinforcedConcreteSection,
): ConstitutiveLaw {
  if (model.constitutiveModels.steelLaw) {
    return model.constitutiveModels.steelLaw;
  }

  const reinforcementMaterial = resolveReinforcementMaterial(model, section);

  if (!reinforcementMaterial?.elasticModulus) {
    throw new Error(
      "ReinforcedConcreteSectionVerification requires a reinforcement material with elasticModulus for service-stress.",
    );
  }

  return new SteelElasticLaw({
    Es: reinforcementMaterial.elasticModulus,
    stressCap: model.analysisSettings.steelStressCap ?? null,
  });
}
