import type { ConstitutiveLaw } from "../../../domain/constitutive-laws/types.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import { hasStrainFieldCoefficients, strainAtPoint } from "./StrainField.js";
import type {
  MaterialExtreme,
  SectionAnalysisInput,
  SectionState,
  StrainFieldLike,
} from "./types.js";

type PostUltimateResponse = "retain" | "linear-softening" | "zero-stress";

interface IntegratorOptions extends SectionAnalysisInput {
  includeConcreteTension?: boolean;
  postUltimateResponse?: PostUltimateResponse;
  postUltimateFractureEnergyDensity?:
    | number
    | {
        concrete?: number;
        steel?: number;
      }
    | null;
}

interface FastEvaluatorOptions extends IntegratorOptions {
  includeMoments?: boolean;
}

interface EvaluationOptions extends IntegratorOptions {
  strainField: StrainFieldLike;
  includeResponseDetails?: boolean;
}

interface FractureEnergyDensity {
  concrete: number;
  steel: number;
}

interface MaterialResponse {
  stress: number;
  originalStress: number;
  strainLimit: number | null;
  strainUtilization: number;
  postUltimate: boolean;
  stressReductionFactor: number;
  fractureEnergyDensity: number;
  terminalStrain: number | null;
}

function accumulateExtreme(
  current: MaterialExtreme | null,
  candidate: MaterialExtreme,
  comparator: (candidate: number, current: number) => boolean,
): MaterialExtreme {
  if (current == null) {
    return candidate;
  }

  return comparator(candidate.value, current.value) ? candidate : current;
}

function resolveStrainLimit(law: ConstitutiveLaw, strain: number): number | null {
  const limits = law.strainLimits();
  const rawLimit = strain >= 0 ? limits.tension : limits.compression;

  return Number.isFinite(rawLimit) && rawLimit !== 0 ? Math.abs(rawLimit as number) : null;
}

export function normalizePostUltimateFractureEnergyDensity(
  value:
    | number
    | {
        concrete?: number;
        steel?: number;
      }
    | null
    | undefined,
): FractureEnergyDensity {
  if (value == null) {
    return {
      concrete: 0,
      steel: 0,
    };
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return {
      concrete: value,
      steel: value,
    };
  }

  if (typeof value !== "object") {
    throw new Error(
      "RC post-ultimate fracture energy density must be a non-negative number or an object.",
    );
  }

  const normalized = {
    concrete: value.concrete ?? 0,
    steel: value.steel ?? 0,
  };

  for (const [material, energyDensity] of Object.entries(normalized)) {
    if (!Number.isFinite(energyDensity) || energyDensity < 0) {
      throw new Error(`RC post-ultimate ${material} fracture energy density must be non-negative.`);
    }
  }

  return normalized;
}

function applyPostUltimateStress(
  stress: number,
  strain: number,
  law: ConstitutiveLaw,
  response: PostUltimateResponse,
  fractureEnergyDensity: number,
): number {
  if (response === "retain") {
    return stress;
  }

  const strainLimit = resolveStrainLimit(law, strain);

  if (strainLimit == null || Math.abs(strain) <= strainLimit) {
    return stress;
  }

  if (response === "zero-stress" || fractureEnergyDensity <= 0) {
    return 0;
  }

  const limitStrain = Math.sign(strain || 1) * strainLimit;
  const limitStress = Math.abs(law.stress(limitStrain));

  if (limitStress <= 0) {
    return 0;
  }

  const terminalStrain = strainLimit + (2 * fractureEnergyDensity) / limitStress;
  const stressReductionFactor = Math.max(
    0,
    (terminalStrain - Math.abs(strain)) / (terminalStrain - strainLimit),
  );

  return stress * stressReductionFactor;
}

function applyPostUltimateResponse({
  stress,
  strain,
  law,
  response,
  fractureEnergyDensity,
}: {
  stress: number;
  strain: number;
  law: ConstitutiveLaw;
  response: PostUltimateResponse;
  fractureEnergyDensity: number;
}): MaterialResponse {
  const strainLimit = resolveStrainLimit(law, strain);
  const strainUtilization = strainLimit == null ? 0 : Math.abs(strain) / strainLimit;

  if (response === "retain" || strainLimit == null || strainUtilization <= 1) {
    return {
      stress,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: false,
      stressReductionFactor: 1,
      fractureEnergyDensity,
      terminalStrain: null,
    };
  }

  if (response === "zero-stress" || fractureEnergyDensity <= 0) {
    return {
      stress: 0,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: true,
      stressReductionFactor: 0,
      fractureEnergyDensity: 0,
      terminalStrain: strainLimit,
    };
  }

  const limitStrain = Math.sign(strain || 1) * strainLimit;
  const limitStress = Math.abs(law.stress(limitStrain));

  if (limitStress <= 0) {
    return {
      stress: 0,
      originalStress: stress,
      strainLimit,
      strainUtilization,
      postUltimate: true,
      stressReductionFactor: 0,
      fractureEnergyDensity,
      terminalStrain: strainLimit,
    };
  }

  const terminalStrain = strainLimit + (2 * fractureEnergyDensity) / limitStress;
  const stressReductionFactor = Math.max(
    0,
    (terminalStrain - Math.abs(strain)) / (terminalStrain - strainLimit),
  );

  return {
    stress: stress * stressReductionFactor,
    originalStress: stress,
    strainLimit,
    strainUtilization,
    postUltimate: true,
    stressReductionFactor,
    fractureEnergyDensity,
    terminalStrain,
  };
}

function validateOptions(options: IntegratorOptions): void {
  if (!options.section?.concreteSection) {
    throw new Error("RCSectionStateIntegrator requires a reinforced concrete section.");
  }

  if (!Array.isArray(options.concreteFibers)) {
    throw new Error("RCSectionStateIntegrator requires a concreteFibers array.");
  }

  if (!options.concreteLaw || typeof options.concreteLaw.stress !== "function") {
    throw new Error("RCSectionStateIntegrator requires a concreteLaw with a stress method.");
  }

  if (!options.steelLaw || typeof options.steelLaw.stress !== "function") {
    throw new Error("RCSectionStateIntegrator requires a steelLaw with a stress method.");
  }

  if (
    options.postUltimateResponse !== undefined &&
    !["retain", "linear-softening", "zero-stress"].includes(options.postUltimateResponse)
  ) {
    throw new Error(`Unsupported RC post-ultimate response: ${options.postUltimateResponse}.`);
  }
}

function resolveReferencePoint(
  section: ReinforcedConcreteSection,
  referencePoint: ReferencePoint | null | undefined,
): { y: number; z: number } {
  const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");

  if (!Number.isFinite(resolvedReferencePoint.y) || !Number.isFinite(resolvedReferencePoint.z)) {
    throw new Error("RCSectionStateIntegrator requires a finite reference point.");
  }

  return {
    y: resolvedReferencePoint.y as number,
    z: resolvedReferencePoint.z as number,
  };
}

function pointStrain(strainField: StrainFieldLike, point: { y: number; z: number }): number {
  return strainAtPoint(strainField, point);
}

export class RCSectionStateIntegrator {
  createAxialForceEvaluator(options: IntegratorOptions): (strainField: StrainFieldLike) => number {
    const evaluator = this.createFastEvaluator({
      ...options,
      includeMoments: false,
    });

    return (strainField) => evaluator(strainField) as number;
  }

  createResultantEvaluator(
    options: IntegratorOptions,
  ): (strainField: StrainFieldLike) => { N: number; Mx: number; My: number } {
    const evaluator = this.createFastEvaluator({
      ...options,
      includeMoments: true,
    });

    return (strainField) => evaluator(strainField) as { N: number; Mx: number; My: number };
  }

  private createFastEvaluator({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    referencePoint = null,
    includeConcreteTension = true,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
    includeMoments = false,
  }: FastEvaluatorOptions): (
    strainField: StrainFieldLike,
  ) => number | { N: number; Mx: number; My: number } {
    const options = {
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      referencePoint,
      includeConcreteTension,
      postUltimateResponse,
      postUltimateFractureEnergyDensity,
    };
    validateOptions(options);

    const fractureEnergyDensity = normalizePostUltimateFractureEnergyDensity(
      postUltimateFractureEnergyDensity,
    );

    if (
      postUltimateResponse === "linear-softening" &&
      fractureEnergyDensity.concrete <= 0 &&
      fractureEnergyDensity.steel <= 0
    ) {
      throw new Error(
        "RCSectionStateIntegrator linear softening requires a positive postUltimateFractureEnergyDensity.",
      );
    }

    const reinforcementBars = section.getReinforcementBars();
    const resolvedReferencePoint = includeMoments
      ? resolveReferencePoint(section, referencePoint)
      : null;

    return (strainField: StrainFieldLike) => {
      if (!hasStrainFieldCoefficients(strainField) && typeof strainField.strainAt !== "function") {
        throw new Error("RCSectionStateIntegrator requires a strainField with a strainAt method.");
      }

      let axialForce = 0;
      let momentX = 0;
      let momentY = 0;

      for (const fiber of concreteFibers) {
        const strain = pointStrain(strainField, fiber);
        let stress = applyPostUltimateStress(
          concreteLaw.stress(strain),
          strain,
          concreteLaw,
          postUltimateResponse,
          fractureEnergyDensity.concrete,
        );

        if (!includeConcreteTension && stress > 0) {
          stress = 0;
        }

        const force = stress * fiber.area;
        axialForce += force;

        if (resolvedReferencePoint !== null) {
          momentX -= force * (fiber.y - resolvedReferencePoint.y);
          momentY += force * (fiber.z - resolvedReferencePoint.z);
        }
      }

      for (const bar of reinforcementBars) {
        if (bar.y == null || bar.z == null) {
          throw new Error(
            "RCSectionStateIntegrator reinforcement bars require finite y and z coordinates.",
          );
        }

        const strain = pointStrain(strainField, { y: bar.y, z: bar.z });
        const stress = applyPostUltimateStress(
          steelLaw.stress(strain),
          strain,
          steelLaw,
          postUltimateResponse,
          fractureEnergyDensity.steel,
        );
        const force = stress * bar.area;
        axialForce += force;

        if (resolvedReferencePoint !== null) {
          momentX -= force * (bar.y - resolvedReferencePoint.y);
          momentY += force * (bar.z - resolvedReferencePoint.z);
        }
      }

      return resolvedReferencePoint === null
        ? axialForce
        : {
            N: axialForce,
            Mx: momentX,
            My: momentY,
          };
    };
  }

  evaluate({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    strainField,
    referencePoint = null,
    includeConcreteTension = true,
    includeResponseDetails = true,
    postUltimateResponse = "zero-stress",
    postUltimateFractureEnergyDensity = null,
  }: EvaluationOptions): SectionState {
    const options = {
      section,
      concreteFibers,
      concreteLaw,
      steelLaw,
      referencePoint,
      includeConcreteTension,
      postUltimateResponse,
      postUltimateFractureEnergyDensity,
    };
    validateOptions(options);

    if (!hasStrainFieldCoefficients(strainField) && typeof strainField.strainAt !== "function") {
      throw new Error("RCSectionStateIntegrator requires a strainField with a strainAt method.");
    }

    const fractureEnergyDensity = normalizePostUltimateFractureEnergyDensity(
      postUltimateFractureEnergyDensity,
    );

    if (
      postUltimateResponse === "linear-softening" &&
      fractureEnergyDensity.concrete <= 0 &&
      fractureEnergyDensity.steel <= 0
    ) {
      throw new Error(
        "RCSectionStateIntegrator linear softening requires a positive postUltimateFractureEnergyDensity.",
      );
    }

    const resolvedReferencePoint = resolveReferencePoint(section, referencePoint);
    const reinforcementBars = section.getReinforcementBars();
    let axialForce = 0;
    let momentX = 0;
    let momentY = 0;
    let concreteAxialForce = 0;
    let steelAxialForce = 0;
    let concreteCompression: MaterialExtreme | null = null;
    let concreteTension: MaterialExtreme | null = null;
    let steelCompression: MaterialExtreme | null = null;
    let steelTension: MaterialExtreme | null = null;
    let steelCompressionStrain: MaterialExtreme | null = null;
    let steelTensionStrain: MaterialExtreme | null = null;
    let minStrain: number | null = null;
    let maxStrain: number | null = null;
    let postUltimateConcreteFiberCount = 0;
    let postUltimateSteelBarCount = 0;

    const concreteResponse = concreteFibers.map((fiber) => {
      const strain = pointStrain(strainField, fiber);
      const materialResponse = applyPostUltimateResponse({
        stress: concreteLaw.stress(strain),
        strain,
        law: concreteLaw,
        response: postUltimateResponse,
        fractureEnergyDensity: fractureEnergyDensity.concrete,
      });
      let stress = materialResponse.stress;

      if (!includeConcreteTension && stress > 0) {
        stress = 0;
      }

      if (materialResponse.postUltimate) {
        postUltimateConcreteFiberCount += 1;
      }

      const force = stress * fiber.area;
      const mx = -force * (fiber.y - resolvedReferencePoint.y);
      const my = force * (fiber.z - resolvedReferencePoint.z);

      axialForce += force;
      momentX += mx;
      momentY += my;
      concreteAxialForce += force;
      minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
      maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

      if (stress < 0) {
        concreteCompression = accumulateExtreme(
          concreteCompression,
          { value: stress, y: fiber.y, z: fiber.z, strain },
          (candidate, current) => candidate < current,
        );
      } else if (stress > 0) {
        concreteTension = accumulateExtreme(
          concreteTension,
          { value: stress, y: fiber.y, z: fiber.z, strain },
          (candidate, current) => candidate > current,
        );
      }

      if (!includeResponseDetails) {
        return {};
      }

      return {
        ...fiber,
        strain,
        stress,
        originalStress: materialResponse.originalStress,
        strainLimit: materialResponse.strainLimit,
        strainUtilization: materialResponse.strainUtilization,
        postUltimate: materialResponse.postUltimate,
        stressReductionFactor: materialResponse.stressReductionFactor,
        fractureEnergyDensity: materialResponse.fractureEnergyDensity,
        terminalStrain: materialResponse.terminalStrain,
        force,
        mx,
        my,
      };
    });

    const steelResponse = reinforcementBars.map((bar) => {
      if (bar.y == null || bar.z == null) {
        throw new Error(
          "RCSectionStateIntegrator reinforcement bars require finite y and z coordinates.",
        );
      }

      const strain = pointStrain(strainField, { y: bar.y, z: bar.z });
      const materialResponse = applyPostUltimateResponse({
        stress: steelLaw.stress(strain),
        strain,
        law: steelLaw,
        response: postUltimateResponse,
        fractureEnergyDensity: fractureEnergyDensity.steel,
      });
      const stress = materialResponse.stress;
      const force = stress * bar.area;
      const mx = -force * (bar.y - resolvedReferencePoint.y);
      const my = force * (bar.z - resolvedReferencePoint.z);

      if (materialResponse.postUltimate) {
        postUltimateSteelBarCount += 1;
      }

      axialForce += force;
      momentX += mx;
      momentY += my;
      steelAxialForce += force;
      minStrain = minStrain == null ? strain : Math.min(minStrain, strain);
      maxStrain = maxStrain == null ? strain : Math.max(maxStrain, strain);

      if (stress < 0) {
        steelCompression = accumulateExtreme(
          steelCompression,
          { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate < current,
        );
      } else if (stress > 0) {
        steelTension = accumulateExtreme(
          steelTension,
          { value: stress, id: bar.id, y: bar.y, z: bar.z, strain },
          (candidate, current) => candidate > current,
        );
      }

      if (strain < 0) {
        steelCompressionStrain = accumulateExtreme(
          steelCompressionStrain,
          {
            value: strain,
            stress,
            id: bar.id,
            y: bar.y,
            z: bar.z,
            strain,
          },
          (candidate, current) => candidate < current,
        );
      } else if (strain > 0) {
        steelTensionStrain = accumulateExtreme(
          steelTensionStrain,
          {
            value: strain,
            stress,
            id: bar.id,
            y: bar.y,
            z: bar.z,
            strain,
          },
          (candidate, current) => candidate > current,
        );
      }

      if (!includeResponseDetails) {
        return {};
      }

      return {
        id: bar.id,
        name: bar.name,
        area: bar.area,
        y: bar.y,
        z: bar.z,
        strain,
        stress,
        originalStress: materialResponse.originalStress,
        strainLimit: materialResponse.strainLimit,
        strainUtilization: materialResponse.strainUtilization,
        postUltimate: materialResponse.postUltimate,
        stressReductionFactor: materialResponse.stressReductionFactor,
        fractureEnergyDensity: materialResponse.fractureEnergyDensity,
        terminalStrain: materialResponse.terminalStrain,
        force,
        mx,
        my,
      };
    });

    return {
      N: axialForce,
      Mx: momentX,
      My: momentY,
      referencePoint: { ...resolvedReferencePoint },
      concrete: {
        axialForce: concreteAxialForce,
        fibers: includeResponseDetails ? concreteResponse : [],
      },
      steel: {
        axialForce: steelAxialForce,
        bars: includeResponseDetails ? steelResponse : [],
      },
      postUltimate: {
        response: postUltimateResponse,
        fractureEnergyDensity:
          postUltimateResponse === "linear-softening"
            ? { ...fractureEnergyDensity }
            : {
                concrete: 0,
                steel: 0,
              },
        fractureEnergyDensityUnits: "N/mm2",
        fractureEnergyInterpretation: "energy-per-unit-volume",
        concreteFiberCount: postUltimateConcreteFiberCount,
        steelBarCount: postUltimateSteelBarCount,
        active: postUltimateConcreteFiberCount > 0 || postUltimateSteelBarCount > 0,
      },
      extremes: {
        minStrain,
        maxStrain,
        maxConcreteCompression: concreteCompression,
        maxConcreteTension: concreteTension,
        maxSteelCompression: steelCompression,
        maxSteelTension: steelTension,
        maxSteelCompressionStrain: steelCompressionStrain,
        maxSteelTensionStrain: steelTensionStrain,
      },
    };
  }
}
