import {
  TimberMaterial,
  type TimberMaterialJson,
  type TimberMaterialOptions,
} from "./TimberMaterial.js";

export interface SolidTimberMaterialOptions extends TimberMaterialOptions {
  gradingMethod?: string | null;
}

export interface SolidTimberMaterialJson extends TimberMaterialJson {
  gradingMethod: string | null;
}

export class SolidTimberMaterial extends TimberMaterial {
  declare readonly gradingMethod: string | null;

  constructor({ gradingMethod = null, ...props }: SolidTimberMaterialOptions) {
    super({
      timberType: "solid-timber",
      ...props,
    });

    this.gradingMethod = gradingMethod;
  }

  override toJSON(): SolidTimberMaterialJson {
    return {
      ...super.toJSON(),
      gradingMethod: this.gradingMethod,
    };
  }
}
