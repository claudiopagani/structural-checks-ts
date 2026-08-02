import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitSystemInput,
} from "../units/UnitSystem.js";
import { SlabLoad, type SlabLoadJson } from "./SlabLoad.js";

export interface VariableLoadOptions {
  description: string;
  value: number;
  psi0: number;
  psi1: number;
  psi2: number;
  category?: string | null;
  units?: UnitSystemInput | null;
}

export interface VariableLoadJson extends SlabLoadJson {
  variableLoadId: number;
  category: string | null;
  psi0: number;
  psi1: number;
  psi2: number;
}

export class VariableLoad extends SlabLoad {
  static nextVariableId = 1;

  variableLoadId: number;
  category: string | null;
  psi0: number;
  psi1: number;
  psi2: number;
  declare readonly intensity: number;
  _value: number;

  constructor({
    description,
    value,
    psi0,
    psi1,
    psi2,
    category = null,
    units = null,
  }: VariableLoadOptions) {
    super({ description, loadGroup: "Qk", effect: "unfavourable", units });
    assertExplicitUnitSystem(units, "VariableLoad");
    const unitResolver = createUnitResolver(units, { force: "kN", length: "m" });
    const resolvedValue = unitResolver.areaLoad(value);
    if (![resolvedValue, psi0, psi1, psi2].every(Number.isFinite)) {
      throw new Error("Finite Qk, psi0, psi1 and psi2 values are required.");
    }
    this.variableLoadId = VariableLoad.nextVariableId++;
    this.category = category ?? null;
    this._value = resolvedValue;
    this.psi0 = psi0;
    this.psi1 = psi1;
    this.psi2 = psi2;
    this.intensity = resolvedValue;
  }

  get value(): number {
    return this._value;
  }

  override toJSON(): VariableLoadJson {
    return {
      ...super.toJSON(),
      variableLoadId: this.variableLoadId,
      category: this.category,
      psi0: this.psi0,
      psi1: this.psi1,
      psi2: this.psi2,
    };
  }
}
