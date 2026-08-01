import type {
  ConstitutiveLaw,
  ConcreteUltimateConstitutiveLaw,
  SteelUltimateConstitutiveLaw,
} from "../../../domain/constitutive-laws/types.js";
import type { ReinforcedConcreteSection } from "../../../domain/geometry/ReinforcedConcreteSection.js";
import type { ConcreteMaterial } from "../../../domain/materials/ConcreteMaterial.js";
import type { SteelMaterial } from "../../../domain/materials/SteelMaterial.js";
import {
  assertExplicitUnitSystem,
  convertPointCoordinates,
  convertUnitProperties,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";
import type { FiberDiscretizationMethod } from "../analysis/SectionFiberDiscretizer.js";
import type {
  MomentCurvatureCompressedSide,
  MomentCurvaturePostUltimateResponse,
} from "../analysis/moment-curvature/types.js";

export type ReinforcedConcreteSectionAnalysisType =
  | "uls-uniaxial-resistance"
  | "uls-uniaxial-domain"
  | "uls-biaxial-domain"
  | "service-stress"
  | "moment-curvature"
  | (string & {});

export interface ReinforcedConcreteSectionActionsInput extends Record<string, unknown> {
  nEd?: number;
  axialForce?: number;
  mEd?: number;
  mxEd?: number;
  myEd?: number;
  nValues?: number[];
}

export interface ReinforcedConcreteSectionActions extends ReinforcedConcreteSectionActionsInput {
  nEd?: number;
  axialForce?: number;
  mEd?: number;
  mxEd?: number;
  myEd?: number;
  nValues?: number[];
}

export interface ReinforcedConcreteSectionReferencePointInput {
  type?: "concrete-centroid" | "transformed-centroid" | "section-center" | "custom";
  coordinates?: {
    y?: number;
    z?: number;
  } | null;
}

export interface ReinforcedConcreteSectionAnalysisSettings extends Record<string, unknown> {
  compressedEdge?: "top" | "bottom";
  compressedSide?: MomentCurvatureCompressedSide | null;
  theta?: number;
  curvatureMax?: number | null;
  curvatureValues?: number[] | null;
  includeConcreteTension?: boolean;
  stopAtFailure?: boolean;
  includeFailurePoint?: boolean;
  postUltimateMomentDrop?: number | null;
  maxPostUltimateCurvatureRatio?: number;
  postPeakMomentDrop?: number | null;
  postUltimateResponse?: MomentCurvaturePostUltimateResponse;
  postUltimateFractureEnergyDensity?:
    | number
    | {
        concrete?: number;
        steel?: number;
      }
    | null;
  postPeakCurvatureGrowthFactor?: number;
  maxPostPeakPoints?: number;
  concreteLawType?: string;
  concreteModel?: string;
  steelLawType?: string;
  steelModel?: string;
  ec2?: number;
  ec3?: number;
  ec4?: number;
  ecu?: number;
  eta?: number;
  esu?: number;
  steelUltimateStrain?: number;
  ftd?: number;
  steelUltimateDesignStress?: number;
  hardeningModulus?: number | null;
  nValues?: number[];
  pointCount?: number;
  includeOppositeCurvature?: boolean;
  angleCount?: number;
  modularRatio?: number;
  compressionCap?: number | null;
  steelStressCap?: number | null;
}

export interface ReinforcedConcreteSectionMaterials extends Record<string, unknown> {
  concreteMaterial?: ConcreteMaterial;
  reinforcementMaterial?: SteelMaterial;
}

export interface ReinforcedConcreteSectionConstitutiveModels extends Record<string, unknown> {
  concreteLaw?: ConstitutiveLaw | ConcreteUltimateConstitutiveLaw;
  steelLaw?: ConstitutiveLaw | SteelUltimateConstitutiveLaw;
}

export interface ReinforcedConcreteSectionMeshOptions extends Record<string, unknown> {
  targetFiberCount?: number;
  method?: FiberDiscretizationMethod;
}

export interface ReinforcedConcreteSectionSolverOptions extends Record<string, unknown> {
  tolerance?: number;
  maxIterations?: number;
  limitTolerance?: number;
  limitMaxIterations?: number;
  eps0Samples?: number;
  eps0Min?: number;
  eps0Max?: number;
  finiteDifferenceStep?: number;
  initialGuess?: {
    eps0?: number;
    kappaY?: number;
    kappaZ?: number;
  };
}

export interface ReinforcedConcreteSectionModelInput {
  id: string;
  section?: ReinforcedConcreteSection | null;
  geometry?: Record<string, unknown>;
  reinforcement?: Record<string, unknown>;
  materials?: ReinforcedConcreteSectionMaterials;
  constitutiveModels?: ReinforcedConcreteSectionConstitutiveModels;
  analysisType?: ReinforcedConcreteSectionAnalysisType;
  analysisSettings?: ReinforcedConcreteSectionAnalysisSettings;
  mesh?: ReinforcedConcreteSectionMeshOptions;
  solver?: ReinforcedConcreteSectionSolverOptions;
  actions?: ReinforcedConcreteSectionActionsInput;
  referencePoint?: ReinforcedConcreteSectionReferencePointInput;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export class ReinforcedConcreteSectionModel {
  id: string;
  section: ReinforcedConcreteSection | null;
  geometry: Record<string, unknown>;
  reinforcement: Record<string, unknown>;
  materials: ReinforcedConcreteSectionMaterials;
  constitutiveModels: ReinforcedConcreteSectionConstitutiveModels;
  analysisType: ReinforcedConcreteSectionAnalysisType;
  analysisSettings: ReinforcedConcreteSectionAnalysisSettings;
  mesh: ReinforcedConcreteSectionMeshOptions;
  solver: ReinforcedConcreteSectionSolverOptions;
  actions: ReinforcedConcreteSectionActions;
  referencePoint: ReinforcedConcreteSectionReferencePointInput;
  units: UnitSystem;
  metadata: Record<string, unknown>;

  constructor({
    id,
    section = null,
    geometry = {},
    reinforcement = {},
    materials = {},
    constitutiveModels = {},
    analysisType = "uls-uniaxial-resistance",
    analysisSettings = {},
    mesh = {},
    solver = {},
    actions = {},
    referencePoint = {
      type: "concrete-centroid",
      coordinates: null,
    },
    units = null,
    metadata = {},
  }: ReinforcedConcreteSectionModelInput) {
    if (!id) {
      throw new Error("A reinforced concrete section model id is required.");
    }

    assertExplicitUnitSystem(units, "ReinforcedConcreteSectionModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.section = section;
    this.geometry = { ...geometry };
    this.reinforcement = { ...reinforcement };
    this.materials = { ...materials };
    this.constitutiveModels = { ...constitutiveModels };
    this.analysisType = analysisType;
    this.analysisSettings = { ...analysisSettings };
    this.mesh = { ...mesh };
    this.solver = { ...solver };
    this.actions = convertUnitProperties(actions, {
      nEd: (value) => (value == null ? value : unitResolver.force(value as number)),
      axialForce: (value) => (value == null ? value : unitResolver.force(value as number)),
      mEd: (value) => (value == null ? value : unitResolver.moment(value as number)),
      mxEd: (value) => (value == null ? value : unitResolver.moment(value as number)),
      myEd: (value) => (value == null ? value : unitResolver.moment(value as number)),
      nValues: (values) =>
        Array.isArray(values) ? values.map((value) => unitResolver.force(value as number)) : values,
    });
    this.referencePoint = {
      type: referencePoint.type ?? "concrete-centroid",
      coordinates:
        referencePoint.coordinates == null
          ? null
          : (convertPointCoordinates(referencePoint.coordinates, unitResolver, ["y", "z"]) as {
              y?: number;
              z?: number;
            }),
    };
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }
}
