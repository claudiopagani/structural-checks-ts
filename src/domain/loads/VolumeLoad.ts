// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/loads/VolumeLoad.js.

import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystem,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { Load, type LoadInput, type LoadJson, type LoadTarget } from "./Load.js";

export interface VolumeLoadInput extends Omit<LoadInput, "dimension" | "type"> {
  type?: string;
  direction?: string | null;
  intensity: number;
  volume?: number | null | undefined;
  referenceSystem?: string;
  units?: UnitSystemInput | null | undefined;
  target?: VolumeLoadTarget | null | undefined;
}

export interface VolumeLoadTarget extends LoadTarget {
  volume?: number | (() => number);
}

export interface VolumeLoadJson extends LoadJson {
  direction: string | null;
  intensity: number;
  volume: number | null;
  referenceSystem: string;
  resultant: number | null;
}

export class VolumeLoad extends Load {
  declare readonly direction: string | null;
  declare readonly intensity: number;
  declare readonly volumeOverride: number | null;
  declare readonly referenceSystem: string;
  declare readonly units: UnitSystem;

  constructor({
    type = "volume",
    direction = null,
    intensity,
    volume = null,
    referenceSystem = "global",
    units = null,
    ...baseProps
  }: VolumeLoadInput) {
    super({
      ...baseProps,
      type,
      dimension: "volume",
    });

    assertExplicitUnitSystem(units, "VolumeLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedIntensity = unitResolver.volumeLoad(intensity);

    if (!Number.isFinite(resolvedIntensity)) {
      throw new Error("A finite volume load intensity is required.");
    }

    this.direction = direction;
    this.intensity = resolvedIntensity;
    this.volumeOverride = volume == null ? volume : unitResolver.volume(volume);
    this.referenceSystem = referenceSystem;
    this.units = unitResolver.targetUnitSystem;
    this.metadata = {
      ...this.metadata,
      unitSystem: unitResolver.targetUnitSystem,
      sourceUnitSystem: this.metadata.sourceUnitSystem ?? unitResolver.sourceUnitSystem,
    };
  }

  resolvedVolume(): number | null {
    if (Number.isFinite(this.volumeOverride)) {
      return this.volumeOverride;
    }

    if (typeof this.target?.volume === "function") {
      return this.target.volume();
    }

    const targetVolume = this.target?.volume;
    if (typeof targetVolume === "number" && Number.isFinite(targetVolume)) {
      return targetVolume;
    }

    return null;
  }

  override referenceValue(): number {
    return this.intensity;
  }

  override resultant(): number | null {
    const volume = this.resolvedVolume();
    return volume === null ? null : this.intensity * volume;
  }

  override toJSON(): VolumeLoadJson {
    return {
      ...super.toJSON(),
      direction: this.direction,
      intensity: this.intensity,
      volume: this.resolvedVolume(),
      referenceSystem: this.referenceSystem,
      resultant: this.resultant(),
    };
  }
}
