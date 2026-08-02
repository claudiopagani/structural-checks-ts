import {
  TimberMaterial,
  type TimberMaterialJson,
  type TimberMaterialOptions,
} from "./TimberMaterial.js";

export interface GlulamTimberMaterialOptions extends TimberMaterialOptions {
  glulamType?: string | null;
}

export interface GlulamTimberMaterialJson extends TimberMaterialJson {
  glulamType: string | null;
}

export class GlulamTimberMaterial extends TimberMaterial {
  declare readonly glulamType: string | null;

  constructor({ glulamType = null, ...props }: GlulamTimberMaterialOptions) {
    super({
      timberType: "glulam",
      ...props,
    });

    this.glulamType = glulamType;
  }

  override toJSON(): GlulamTimberMaterialJson {
    return {
      ...super.toJSON(),
      glulamType: this.glulamType,
    };
  }
}
