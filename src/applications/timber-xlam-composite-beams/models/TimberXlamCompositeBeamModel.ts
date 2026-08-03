// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/timber-xlam-composite-beams/models/TimberXlamCompositeBeamModel.js.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  assertExplicitUnitSystem,
  convertUnitProperties,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../../../domain/units/UnitSystem.js";

type JsonRecord = Record<string, any>;

export interface TimberXlamCompositeBeamModelOptions {
  id: string | number | bigint;
  span: number;
  xlamSection: JsonRecord;
  timberSection: JsonRecord;
  xlamMaterial: JsonRecord;
  timberMaterial: JsonRecord;
  connector: JsonRecord;
  kmod?: number;
  gammaXlam?: number;
  gammaTimber?: number;
  gammaConnection?: number;
  serviceClass?: number;
  psi2?: number;
  loads?: JsonRecord;
  deflectionLimitShortDenominator?: number;
  deflectionLimitLongDenominator?: number;
  units: UnitSystemInput | null;
  metadata?: JsonRecord;
}

export class TimberXlamCompositeBeamModel {
  id: string | number | bigint;
  span: number;
  xlamSection: JsonRecord;
  timberSection: JsonRecord;
  xlamMaterial: JsonRecord;
  timberMaterial: JsonRecord;
  connector: JsonRecord;
  kmod: number;
  gammaXlam: number;
  gammaTimber: number;
  gammaConnection: number;
  serviceClass: number;
  psi2: number;
  loads: JsonRecord;
  deflectionLimitShortDenominator: number;
  deflectionLimitLongDenominator: number;
  units: UnitSystem;
  metadata: JsonRecord;

  constructor({
    id,
    span,
    xlamSection,
    timberSection,
    xlamMaterial,
    timberMaterial,
    connector,
    kmod = 0.9,
    gammaXlam = 1.45,
    gammaTimber = 1.45,
    gammaConnection = 1.5,
    serviceClass = 2,
    psi2 = 0,
    loads = {},
    deflectionLimitShortDenominator = 300,
    deflectionLimitLongDenominator = 200,
    units = null,
    metadata = {},
  }: TimberXlamCompositeBeamModelOptions) {
    if (!id) {
      throw new Error("A timber-xlam composite beam model id is required.");
    }

    assertExplicitUnitSystem(units, "TimberXlamCompositeBeamModel");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });
    const convertLineLoad = (value: unknown): unknown =>
      unitResolver.lineLoad(value as number | null | undefined);

    this.id = id;
    this.span = unitResolver.length(span);
    this.xlamSection = xlamSection;
    this.timberSection = timberSection;
    this.xlamMaterial = xlamMaterial;
    this.timberMaterial = timberMaterial;
    this.connector = connector;
    this.kmod = kmod;
    this.gammaXlam = gammaXlam;
    this.gammaTimber = gammaTimber;
    this.gammaConnection = gammaConnection;
    this.serviceClass = serviceClass;
    this.psi2 = psi2;
    this.loads = convertUnitProperties(loads, {
      ulsLineLoad: convertLineLoad,
      slePermanentLineLoad: convertLineLoad,
      sleVariableLineLoad: convertLineLoad,
    });
    this.deflectionLimitShortDenominator = deflectionLimitShortDenominator;
    this.deflectionLimitLongDenominator = deflectionLimitLongDenominator;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  kdef() {
    if (this.serviceClass === 1) {
      return 0.6;
    }

    if (this.serviceClass === 2) {
      return 0.8;
    }

    return 2;
  }

  relativeCentroidDistance() {
    const layers = this.xlamSection.layerThicknesses;
    const [t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0] = layers;
    void t1;

    return this.timberSection.height / 2 + t5 + t4 + t3 / 2;
  }

  xlamBendingLeverArm() {
    const [, t2 = 0, t3 = 0, t4 = 0] = this.xlamSection.layerThicknesses;

    return (t2 + t3 + t4) / 2;
  }

  workbookEquivalentXlamInertia() {
    const [, t2 = 0, t3 = 0, t4 = 0] = this.xlamSection.layerThicknesses;
    const b = this.xlamSection.effectiveWidth;

    return (
      b * (t2 ** 3 / 12 + t4 ** 3 / 12 + t2 * ((t3 + t2) / 2) ** 2 + t4 * ((t3 + t4) / 2) ** 2)
    );
  }
}
