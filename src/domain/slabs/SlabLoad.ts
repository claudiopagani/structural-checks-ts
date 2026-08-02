import { AreaLoad, type AreaLoadJson } from "../loads/AreaLoad.js";
import type { UnitSystemInput } from "../units/UnitSystem.js";

export interface SlabLoadOptions {
  description: string;
  loadGroup: string;
  effect?: string;
  units?: UnitSystemInput | null;
}

export interface SlabLoadJson extends AreaLoadJson {
  description: string;
  loadGroup: string;
  effect: string;
  value: unknown;
}

function propertyValue(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

export class SlabLoad extends AreaLoad {
  static nextId = 1;

  description: string;
  loadGroup: string;
  effect: string;

  constructor({ description, loadGroup, effect = "unfavourable", units = null }: SlabLoadOptions) {
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error("A slab load description is required.");
    }
    if (!["G1", "G2", "Qk"].includes(loadGroup)) {
      throw new Error(`Unsupported slab load group: ${loadGroup}.`);
    }
    if (!["favourable", "unfavourable"].includes(effect)) {
      throw new Error(`Unsupported slab load effect: ${effect}.`);
    }

    const normalizedEffect = loadGroup === "Qk" ? "unfavourable" : effect;
    super({
      id: `SLAB-${SlabLoad.nextId++}`,
      name: description,
      type: "slab",
      intensity: 0,
      units,
      metadata: { loadGroup, effect: normalizedEffect },
    });
    this.description = description;
    this.loadGroup = loadGroup;
    this.effect = normalizedEffect;
  }

  override toJSON(): SlabLoadJson {
    return {
      ...super.toJSON(),
      description: this.description,
      loadGroup: this.loadGroup,
      effect: this.effect,
      value: propertyValue(this, "value"),
    };
  }
}
