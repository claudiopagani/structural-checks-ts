// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/materials/MasonryMaterial.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { BaseMaterial, type BaseMaterialJson, type BaseMaterialOptions } from "./BaseMaterial.js";

export interface MasonryMaterialOptions extends Omit<BaseMaterialOptions, "category" | "units"> {
  masonryType: string;
  unitType?: string | null;
  mortarType?: string | null;
  fm?: number | null | undefined;
  tau0?: number | null | undefined;
  fv0?: number | null | undefined;
  units?: UnitSystemInput | null | undefined;
}

export interface MasonryMaterialJson extends BaseMaterialJson {
  masonryType: string;
  unitType: string | null;
  mortarType: string | null;
  fm: number | null | undefined;
  tau0: number | null | undefined;
  fv0: number | null | undefined;
}

export class MasonryMaterial extends BaseMaterial {
  declare readonly masonryType: string;
  declare readonly unitType: string | null;
  declare readonly mortarType: string | null;
  declare readonly fm: number | null | undefined;
  declare readonly tau0: number | null | undefined;
  declare readonly fv0: number | null | undefined;

  constructor({
    masonryType,
    unitType = null,
    mortarType = null,
    fm = null,
    tau0 = null,
    fv0 = null,
    units = null,
    ...baseProps
  }: MasonryMaterialOptions) {
    assertExplicitUnitSystem(units, "MasonryMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "masonry",
      units,
      ...baseProps,
    });

    this.masonryType = masonryType;
    this.unitType = unitType;
    this.mortarType = mortarType;
    this.fm = unitResolver.stress(fm);
    this.tau0 = unitResolver.stress(tau0);
    this.fv0 = unitResolver.stress(fv0);
  }

  override toJSON(): MasonryMaterialJson {
    return {
      ...super.toJSON(),
      masonryType: this.masonryType,
      unitType: this.unitType,
      mortarType: this.mortarType,
      fm: this.fm,
      tau0: this.tau0,
      fv0: this.fv0,
    };
  }
}
