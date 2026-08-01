import { Load, type LoadInput, type LoadJson, type LoadTarget } from "./Load.js";
import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";

export interface LineLoadInput extends Omit<LoadInput, "dimension" | "target" | "type"> {
  type?: string;
  direction?: string | null;
  startValue: number;
  endValue?: number | null;
  distribution?: string;
  referenceSystem?: string;
  length?: number | null;
  units?: UnitSystemInput | null;
  target?: LoadTarget | null;
}

export interface LineLoadJson extends LoadJson {
  direction: string | null;
  startValue: number;
  endValue: number;
  distribution: string;
  referenceSystem: string;
  length: number | null;
  resultant: number | null;
}

export class LineLoad extends Load {
  readonly direction: string | null;
  readonly startValue: number;
  readonly endValue: number;
  readonly distribution: string;
  readonly referenceSystem: string;
  readonly lengthOverride: number | null;
  declare readonly units: UnitSystem;

  constructor({
    type = "line",
    direction = null,
    startValue,
    endValue = null,
    distribution = "uniform",
    referenceSystem = "local",
    length = null,
    units = null,
    ...baseProps
  }: LineLoadInput) {
    super({
      ...baseProps,
      type,
      dimension: "line",
    });

    assertExplicitUnitSystem(units, "LineLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedStartValue = unitResolver.lineLoad(startValue);
    const resolvedEndValue = endValue === null ? null : unitResolver.lineLoad(endValue);
    const resolvedLength = length == null ? length : unitResolver.length(length);

    if (!Number.isFinite(resolvedStartValue)) {
      throw new Error("A finite startValue is required for a line load.");
    }

    if (resolvedEndValue !== null && !Number.isFinite(resolvedEndValue)) {
      throw new Error("The endValue of a line load must be finite when provided.");
    }

    this.direction = direction;
    this.startValue = resolvedStartValue;
    this.endValue = resolvedEndValue ?? resolvedStartValue;
    this.distribution = distribution;
    this.referenceSystem = referenceSystem;
    this.lengthOverride = resolvedLength;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...this.metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: this.metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  averageIntensity(): number {
    return (this.startValue + this.endValue) / 2;
  }

  resolvedLength(): number | null {
    if (Number.isFinite(this.lengthOverride)) {
      return this.lengthOverride;
    }

    const target = this.target;
    if (target && "length" in target) {
      const targetLength = target.length;
      if (typeof targetLength === "function") {
        return (targetLength as (this: LoadTarget) => number).call(target);
      }
      if (Number.isFinite(targetLength)) {
        return targetLength as number;
      }
    }

    return null;
  }

  override referenceValue(): number {
    return this.averageIntensity();
  }

  override resultant(): number | null {
    const length = this.resolvedLength();
    return length === null ? null : this.averageIntensity() * length;
  }

  override toJSON(): LineLoadJson {
    return {
      ...super.toJSON(),
      direction: this.direction,
      startValue: this.startValue,
      endValue: this.endValue,
      distribution: this.distribution,
      referenceSystem: this.referenceSystem,
      length: this.resolvedLength(),
      resultant: this.resultant(),
    };
  }
}
