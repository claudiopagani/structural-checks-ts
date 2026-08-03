// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-concrete-composite-beams/models/TimberConcreteCompositeBeamModel.js.

import { CompositeSection } from "../../../domain/composite/CompositeSection.js";
import {
  CompositeSectionComponent,
  type CompositeComponentSection,
} from "../../../domain/composite/CompositeSectionComponent.js";
import {
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";

type JsonRecord = Record<string, unknown>;

const INTERNAL_UNITS = Object.freeze({ force: "N", length: "mm" });

interface CompositeMaterialLike extends JsonRecord {
  elasticModulus?: number | null;
}

export interface TimberConcreteCompositeBeamModelOptions {
  id: string | number | bigint;
  span?: number;
  slabSection: CompositeComponentSection;
  timberSection: CompositeComponentSection;
  timberConcreteGap?: number;
  reinforcement?: unknown;
  reinforcementSpacing?: number;
  timberMaterial: CompositeMaterialLike;
  concreteMaterial: CompositeMaterialLike;
  reinforcementMaterial?: unknown;
  connector?: unknown;
  connectorSpacing?: number;
  serviceClass?: unknown;
  kdef?: unknown;
  kmod?: unknown;
  confidenceFactor?: unknown;
  gammaConcrete?: unknown;
  gammaSteel?: unknown;
  gammaTimber?: unknown;
  gammaConnector?: unknown;
  alphaCc?: unknown;
  loads?: JsonRecord | null;
  deflectionLimitDenominator?: unknown;
  units?: UnitSystemInput | null;
  metadata?: JsonRecord;
}

function sourceString(value: unknown): string {
  return Reflect.apply(String, undefined, [value]);
}

function numericOperand(value: unknown): number {
  return Number(value);
}

export class TimberConcreteCompositeBeamModel {
  id: string | number | bigint;
  span: number | null | undefined;
  slabSection: CompositeComponentSection;
  timberSection: CompositeComponentSection;
  timberConcreteGap: number | null | undefined;
  reinforcement: unknown;
  reinforcementSpacing: number | null | undefined;
  timberMaterial: CompositeMaterialLike;
  concreteMaterial: CompositeMaterialLike;
  reinforcementMaterial: unknown;
  connector: unknown;
  connectorSpacing: number | null | undefined;
  serviceClass: unknown;
  kdef: unknown;
  kmod: unknown;
  confidenceFactor: unknown;
  gammaConcrete: unknown;
  gammaSteel: unknown;
  gammaTimber: unknown;
  gammaConnector: unknown;
  alphaCc: unknown;
  loads: JsonRecord;
  deflectionLimitDenominator: unknown;
  units: UnitSystem;
  metadata: JsonRecord;

  constructor({
    id,
    span,
    slabSection,
    timberSection,
    timberConcreteGap = 0,
    reinforcement = null,
    reinforcementSpacing,
    timberMaterial,
    concreteMaterial,
    reinforcementMaterial,
    connector,
    connectorSpacing,
    serviceClass = 1,
    kdef = 0.6,
    kmod = 0.8,
    confidenceFactor = 1,
    gammaConcrete = 1.5,
    gammaSteel = 1.15,
    gammaTimber = 1.5,
    gammaConnector = 1.5,
    alphaCc = 0.85,
    loads = {},
    deflectionLimitDenominator = 250,
    units = null,
    metadata = {},
  }: TimberConcreteCompositeBeamModelOptions) {
    if (!id) {
      throw new Error("A timber-concrete composite beam model id is required.");
    }

    assertExplicitUnitSystem(units, "TimberConcreteCompositeBeamModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    this.id = id;
    this.span = unitResolver.length(span);
    this.slabSection = slabSection;
    this.timberSection = timberSection;
    this.timberConcreteGap = unitResolver.length(timberConcreteGap);
    this.reinforcement = reinforcement;
    this.reinforcementSpacing = unitResolver.length(reinforcementSpacing);
    this.timberMaterial = timberMaterial;
    this.concreteMaterial = concreteMaterial;
    this.reinforcementMaterial = reinforcementMaterial;
    this.connector = connector;
    this.connectorSpacing = unitResolver.length(connectorSpacing);
    this.serviceClass = serviceClass;
    this.kdef = kdef;
    this.kmod = kmod;
    this.confidenceFactor = confidenceFactor;
    this.gammaConcrete = gammaConcrete;
    this.gammaSteel = gammaSteel;
    this.gammaTimber = gammaTimber;
    this.gammaConnector = gammaConnector;
    this.alphaCc = alphaCc;
    const lineLoadConverter = (value: unknown): unknown => {
      if (value === null) {
        return unitResolver.lineLoad(null);
      }

      if (value === undefined) {
        return unitResolver.lineLoad(undefined);
      }

      return typeof value === "number" ? unitResolver.lineLoad(value) : value;
    };
    this.loads = convertUnitProperties(loads, {
      ulsLineLoad: lineLoadConverter,
      sleRareLineLoad: lineLoadConverter,
      sleFrequentLineLoad: lineLoadConverter,
      sleQuasiPermanentLineLoad: lineLoadConverter,
    });
    this.deflectionLimitDenominator = deflectionLimitDenominator;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  slabCentroidY(): number {
    return (
      numericOperand(this.timberSection.height) +
      numericOperand(this.timberConcreteGap) +
      numericOperand(this.slabSection.height) / 2
    );
  }

  timberCentroidY(): number {
    return numericOperand(this.timberSection.height) / 2;
  }

  createIdealCompositeSection(): CompositeSection {
    const modularRatio =
      numericOperand(this.concreteMaterial.elasticModulus) /
      numericOperand(this.timberMaterial.elasticModulus);

    return new CompositeSection({
      name: `${sourceString(this.id)}-ideal-composite`,
      components: [
        new CompositeSectionComponent({
          name: "Timber beam",
          section: this.timberSection,
          material: this.timberMaterial,
          centroidY: this.timberCentroidY(),
          modularRatio: 1,
          role: "timber",
          units: INTERNAL_UNITS,
        }),
        new CompositeSectionComponent({
          name: "Concrete slab",
          section: this.slabSection,
          material: this.concreteMaterial,
          centroidY: this.slabCentroidY(),
          modularRatio,
          role: "slab",
          units: INTERNAL_UNITS,
        }),
      ],
      units: INTERNAL_UNITS,
      metadata: {
        ...this.metadata,
        modularRatio,
      },
    });
  }
}
