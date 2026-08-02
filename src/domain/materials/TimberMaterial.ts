import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { BaseMaterial, type BaseMaterialJson, type BaseMaterialOptions } from "./BaseMaterial.js";

export interface TimberMaterialOptions extends Omit<BaseMaterialOptions, "category" | "units"> {
  strengthClass: string;
  timberType?: string | null;
  productStandard?: string | null;
  strengthStandard?: string | null;
  serviceClass?: number | string | null;
  kmod?: number | null;
  fmK?: number | null;
  fc0K?: number | null;
  ft0K?: number | null;
  fvK?: number | null;
  e0_05?: number | null;
  g0_05?: number | null;
  units?: UnitSystemInput | null;
}

export interface TimberMaterialJson extends BaseMaterialJson {
  strengthClass: string;
  timberType: string | null;
  productStandard: string | null;
  strengthStandard: string | null;
  serviceClass: number | string | null;
  kmod: number | null;
  fmK: number | null | undefined;
  fc0K: number | null | undefined;
  ft0K: number | null | undefined;
  fvK: number | null | undefined;
  e0_05: number | null | undefined;
  g0_05: number | null | undefined;
}

export class TimberMaterial extends BaseMaterial {
  declare readonly strengthClass: string;
  declare readonly timberType: string | null;
  declare readonly productStandard: string | null;
  declare readonly strengthStandard: string | null;
  declare readonly serviceClass: number | string | null;
  declare readonly kmod: number | null;
  declare readonly fmK: number | null | undefined;
  declare readonly fc0K: number | null | undefined;
  declare readonly ft0K: number | null | undefined;
  declare readonly fvK: number | null | undefined;
  declare readonly e0_05: number | null | undefined;
  declare readonly g0_05: number | null | undefined;

  constructor({
    strengthClass,
    timberType = null,
    productStandard = null,
    strengthStandard = null,
    serviceClass = null,
    kmod = null,
    fmK = null,
    fc0K = null,
    ft0K = null,
    fvK = null,
    e0_05 = null,
    g0_05 = null,
    units = null,
    ...baseProps
  }: TimberMaterialOptions) {
    assertExplicitUnitSystem(units, "TimberMaterial");
    const unitResolver = createUnitResolver(units, { force: "N", length: "mm" });

    super({
      category: "timber",
      units,
      ...baseProps,
    });

    this.strengthClass = strengthClass;
    this.timberType = timberType;
    this.productStandard = productStandard;
    this.strengthStandard = strengthStandard;
    this.serviceClass = serviceClass;
    this.kmod = kmod;
    this.fmK = unitResolver.stress(fmK);
    this.fc0K = unitResolver.stress(fc0K);
    this.ft0K = unitResolver.stress(ft0K);
    this.fvK = unitResolver.stress(fvK);
    this.e0_05 = unitResolver.stress(e0_05);
    this.g0_05 = unitResolver.stress(g0_05);
  }

  override toJSON(): TimberMaterialJson {
    return {
      ...super.toJSON(),
      strengthClass: this.strengthClass,
      timberType: this.timberType,
      productStandard: this.productStandard,
      strengthStandard: this.strengthStandard,
      serviceClass: this.serviceClass,
      kmod: this.kmod,
      fmK: this.fmK,
      fc0K: this.fc0K,
      ft0K: this.ft0K,
      fvK: this.fvK,
      e0_05: this.e0_05,
      g0_05: this.g0_05,
    };
  }
}
