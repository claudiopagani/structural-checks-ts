import { AreaLoad } from "../loads/AreaLoad.js";

export interface FloorSlabOptions {
  description: string;
  loads?: readonly AreaLoad[];
}

function propertyValue(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

function loadGroup(load: AreaLoad): string | undefined {
  const value = propertyValue(load, "loadGroup");
  return typeof value === "string" ? value : undefined;
}

function loadEffect(load: AreaLoad): string | undefined {
  const value = propertyValue(load, "effect");
  return typeof value === "string" ? value : undefined;
}

function loadValue(load: AreaLoad): number {
  return Number(propertyValue(load, "value"));
}

export class FloorSlab {
  description: string;
  loads: AreaLoad[];

  constructor({ description, loads = [] }: FloorSlabOptions) {
    if (typeof description !== "string" || description.trim().length === 0) {
      throw new Error("A floor slab description is required.");
    }
    if (!Array.isArray(loads) || !loads.every((load) => load instanceof AreaLoad)) {
      throw new Error("FloorSlab loads must be an array of AreaLoad instances.");
    }
    this.description = description;
    this.loads = [...loads];
  }

  withDescription(description: string): FloorSlab {
    return new FloorSlab({ description, loads: this.loads });
  }

  addLoad(load: AreaLoad): FloorSlab {
    if (!(load instanceof AreaLoad)) {
      throw new Error("Only AreaLoad instances can be added to a floor slab.");
    }
    return new FloorSlab({ description: this.description, loads: [...this.loads, load] });
  }

  removeLoad(loadId: number): FloorSlab {
    if (!Number.isInteger(loadId)) {
      throw new Error("The slab load id to remove must be an integer.");
    }
    return new FloorSlab({
      description: this.description,
      loads: this.loads.filter((load) => {
        const candidateId: unknown = loadId;
        return load.id !== candidateId;
      }),
    });
  }

  getLoadTotal(requestedGroup: string, requestedEffect: string): number {
    return this.loads
      .filter((load) => loadGroup(load) === requestedGroup && loadEffect(load) === requestedEffect)
      .reduce((sum, load) => sum + loadValue(load), 0);
  }

  get g1UnfavourableTotal(): number {
    return this.getLoadTotal("G1", "unfavourable");
  }

  get g1FavourableTotal(): number {
    return this.getLoadTotal("G1", "favourable");
  }

  get g2UnfavourableTotal(): number {
    return this.getLoadTotal("G2", "unfavourable");
  }

  get g2FavourableTotal(): number {
    return this.getLoadTotal("G2", "favourable");
  }

  get variableLoads(): AreaLoad[] {
    return this.loads.filter((load) => loadGroup(load) === "Qk");
  }

  get variableTotal(): number {
    return this.variableLoads.reduce((sum, load) => sum + loadValue(load), 0);
  }

  get servicePermanentTotal(): number {
    return (
      this.g1UnfavourableTotal +
      this.g1FavourableTotal +
      this.g2UnfavourableTotal +
      this.g2FavourableTotal
    );
  }
}
