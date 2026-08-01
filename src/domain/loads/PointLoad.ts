import { Load, type LoadInput, type LoadJson, type LoadTarget } from "./Load.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export interface PointLoadComponentsInput {
  fx?: number;
  fy?: number;
  fz?: number;
  mx?: number;
  my?: number;
  mz?: number;
}

export interface PointLoadComponents {
  fx: number;
  fy: number;
  fz: number;
  mx: number;
  my: number;
  mz: number;
}

export interface PointLoadInput extends Omit<LoadInput, "dimension" | "target" | "type"> {
  type?: string;
  direction?: string | null;
  components?: PointLoadComponentsInput;
  units?: UnitSystemInput | null;
  target?: LoadTarget | null;
}

export interface PointLoadJson extends LoadJson {
  direction: string | null;
  components: PointLoadComponents;
  resultant: {
    force: number;
    moment: number;
  };
}

export class PointLoad extends Load {
  readonly direction: string | null;
  readonly components: PointLoadComponents;
  declare readonly units: UnitSystem;

  constructor({
    type = "point",
    direction = null,
    components = {},
    units = null,
    ...baseProps
  }: PointLoadInput) {
    super({
      ...baseProps,
      type,
      dimension: "point",
    });

    assertExplicitUnitSystem(units, "PointLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });

    this.direction = direction;
    this.components = {
      fx: unitResolver.force(components.fx ?? 0),
      fy: unitResolver.force(components.fy ?? 0),
      fz: unitResolver.force(components.fz ?? 0),
      mx: unitResolver.moment(components.mx ?? 0),
      my: unitResolver.moment(components.my ?? 0),
      mz: unitResolver.moment(components.mz ?? 0),
    };
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...this.metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: this.metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  forceResultant(): number {
    const { fx, fy, fz } = this.components;
    return Math.sqrt(fx ** 2 + fy ** 2 + fz ** 2);
  }

  momentResultant(): number {
    const { mx, my, mz } = this.components;
    return Math.sqrt(mx ** 2 + my ** 2 + mz ** 2);
  }

  override referenceValue(): number {
    return this.forceResultant();
  }

  override resultant(): { force: number; moment: number } {
    return {
      force: this.forceResultant(),
      moment: this.momentResultant(),
    };
  }

  override toJSON(): PointLoadJson {
    return {
      ...super.toJSON(),
      direction: this.direction,
      components: { ...this.components },
      resultant: this.resultant(),
    };
  }
}
