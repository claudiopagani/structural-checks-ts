import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import {
  ExistingMaterial,
  type ExistingMaterialJson,
  type ExistingMaterialOptions,
} from "./ExistingMaterial.js";

export type ExistingMasonryPropertyValue = number | null | undefined;
export type ExistingMasonryProperties = Record<string, ExistingMasonryPropertyValue>;
export type ExistingMasonryFactors = Record<string, number>;

export interface ExistingMasonryMaterialOptions
  extends Omit<ExistingMaterialOptions, "category" | "units"> {
  masonryType: string;
  unitType?: string | null;
  mortarType?: string | null;
  baseProperties?: ExistingMasonryProperties;
  surveyFactors?: ExistingMasonryFactors;
  improvementFactors?: ExistingMasonryFactors;
  ntcReference?: string;
  units?: UnitSystemInput | null;
}

export interface ExistingMasonryMaterialJson extends ExistingMaterialJson {
  masonryType: string;
  unitType: string | null;
  mortarType: string | null;
  baseProperties: ExistingMasonryProperties;
  surveyFactors: ExistingMasonryFactors;
  improvementFactors: ExistingMasonryFactors;
  ntcReference: string;
  adjustedProperties: Record<string, number | null>;
}

function multiplyFactors(factors: ExistingMasonryFactors): number {
  return Object.values(factors).reduce((accumulator, value) => accumulator * value, 1);
}

export class ExistingMasonryMaterial extends ExistingMaterial {
  declare readonly masonryType: string;
  declare readonly unitType: string | null;
  declare readonly mortarType: string | null;
  declare readonly baseProperties: ExistingMasonryProperties;
  declare readonly surveyFactors: ExistingMasonryFactors;
  declare readonly improvementFactors: ExistingMasonryFactors;
  declare readonly ntcReference: string;

  constructor({
    masonryType,
    unitType = null,
    mortarType = null,
    baseProperties = {},
    surveyFactors = {},
    improvementFactors = {},
    ntcReference = "NTC 2018",
    units = null,
    ...baseProps
  }: ExistingMasonryMaterialOptions) {
    assertExplicitUnitSystem(units, "ExistingMasonryMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "masonry",
      units,
      ...baseProps,
    });

    this.masonryType = masonryType;
    this.unitType = unitType;
    this.mortarType = mortarType;
    this.baseProperties = {
      ...baseProperties,
      fm: unitResolver.stress(baseProperties.fm),
      tau0: unitResolver.stress(baseProperties.tau0),
      fv0: unitResolver.stress(baseProperties.fv0),
      E: unitResolver.stress(baseProperties.E),
      G: unitResolver.stress(baseProperties.G),
      w: unitResolver.volumeLoad(baseProperties.w),
    };
    this.surveyFactors = {
      geometry: 1,
      connections: 1,
      workmanship: 1,
      degradation: 1,
      ...surveyFactors,
    };
    this.improvementFactors = {
      groutInjection: 1,
      reinforcedPlaster: 1,
      jacketing: 1,
      ties: 1,
      ...improvementFactors,
    };
    this.ntcReference = ntcReference;
  }

  correctionFactor(): number {
    return multiplyFactors(this.surveyFactors);
  }

  improvementFactor(): number {
    return multiplyFactors(this.improvementFactors);
  }

  adjustedProperty(propertyName: string): number | null {
    const value = this.baseProperties[propertyName];

    if (value == null) {
      return null;
    }

    return value * this.correctionFactor() * this.improvementFactor();
  }

  adjustedProperties(): Record<string, number | null> {
    return Object.keys(this.baseProperties).reduce<Record<string, number | null>>(
      (accumulator, key) => {
        accumulator[key] = this.adjustedProperty(key);
        return accumulator;
      },
      {},
    );
  }

  override toJSON(): ExistingMasonryMaterialJson {
    return {
      ...super.toJSON(),
      masonryType: this.masonryType,
      unitType: this.unitType,
      mortarType: this.mortarType,
      baseProperties: { ...this.baseProperties },
      surveyFactors: { ...this.surveyFactors },
      improvementFactors: { ...this.improvementFactors },
      ntcReference: this.ntcReference,
      adjustedProperties: this.adjustedProperties(),
    };
  }
}
