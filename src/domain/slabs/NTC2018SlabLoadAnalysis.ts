import type { FloorSlab } from "./FloorSlab.js";

type RecordValue = Record<string, unknown>;

export interface NTC2018SlabLoadCoefficients extends RecordValue {
  g1Unfavourable?: number;
  g1Favourable?: number;
  g2Unfavourable?: number;
  g2Favourable?: number;
  qUnfavourable?: number;
}

export interface NTC2018SlabLoadAnalysisOptions {
  floorSlab: FloorSlab;
}

const DEFAULT_ULS_COEFFICIENTS = {
  g1Unfavourable: 1.3,
  g1Favourable: 1.0,
  g2Unfavourable: 1.5,
  g2Favourable: 0.8,
  qUnfavourable: 1.5,
};

function propertyValue(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

function numberValue(value: unknown): number {
  return Number(value);
}

function stringValue(value: unknown): string {
  return String(value);
}

function variableValue(load: unknown): number {
  return numberValue(propertyValue(load, "value"));
}

function variableId(load: unknown): unknown {
  return propertyValue(load, "variableLoadId");
}

function variableDescription(load: unknown): string {
  return stringValue(propertyValue(load, "description"));
}

function maximumValue(values: readonly RecordValue[]): RecordValue {
  return values.reduce(
    (maximum, current) =>
      numberValue(current.value) > numberValue(maximum.value) ? current : maximum,
    values[0]!,
  );
}

export class NTC2018SlabLoadAnalysis {
  floorSlab: FloorSlab;

  constructor(floorSlab: FloorSlab) {
    this.floorSlab = floorSlab;
  }

  calculateULS(coefficients: NTC2018SlabLoadCoefficients = {}): RecordValue {
    const factors: RecordValue = { ...DEFAULT_ULS_COEFFICIENTS, ...coefficients };
    const permanentBase =
      numberValue(factors.g1Unfavourable) * this.floorSlab.g1UnfavourableTotal +
      numberValue(factors.g1Favourable) * this.floorSlab.g1FavourableTotal +
      numberValue(factors.g2Unfavourable) * this.floorSlab.g2UnfavourableTotal +
      numberValue(factors.g2Favourable) * this.floorSlab.g2FavourableTotal;
    const variableLoads = this.floorSlab.variableLoads;
    if (variableLoads.length === 0) {
      return {
        combination: "ULS",
        noVariableLoad: true,
        values: [],
        maximum: {
          value: permanentBase,
          note: "No variable loads are present.",
          dominantVariableLoadId: null,
        },
      };
    }
    const qFactor = numberValue(factors.qUnfavourable);
    const values = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce(
          (sum, load) =>
            sum + qFactor * numberValue(propertyValue(load, "psi0")) * variableValue(load),
          0,
        );
      return {
        value: permanentBase + qFactor * variableValue(leadingLoad) + accompanyingValue,
        note: `with ${variableDescription(leadingLoad)} as leading variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? variableId(leadingLoad) : null,
      };
    });
    return {
      combination: "ULS",
      noVariableLoad: false,
      values,
      maximum: maximumValue(values),
    };
  }

  calculateSLE(): RecordValue {
    const variableLoads = this.floorSlab.variableLoads;
    const permanentTotal = this.floorSlab.servicePermanentTotal;
    if (variableLoads.length === 0) {
      const maximum = {
        value: permanentTotal,
        note: "No variable loads are present.",
        dominantVariableLoadId: null,
      };
      return {
        rare: {
          combination: "SLE_RARE",
          noVariableLoad: true,
          values: [],
          maximum,
        },
        frequent: {
          combination: "SLE_FREQUENT",
          noVariableLoad: true,
          values: [],
          maximum,
        },
        quasiPermanent: {
          combination: "SLE_QUASI_PERMANENT",
          noVariableLoad: true,
          value: permanentTotal,
        },
      };
    }
    const rareValues = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce(
          (sum, load) => sum + numberValue(propertyValue(load, "psi0")) * variableValue(load),
          0,
        );
      return {
        value: permanentTotal + variableValue(leadingLoad) + accompanyingValue,
        note: `with ${variableDescription(leadingLoad)} as leading variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? variableId(leadingLoad) : null,
      };
    });
    const frequentValues = variableLoads.map((leadingLoad, index) => {
      const accompanyingValue = variableLoads
        .filter((_, loadIndex) => loadIndex !== index)
        .reduce(
          (sum, load) => sum + numberValue(propertyValue(load, "psi2")) * variableValue(load),
          0,
        );
      return {
        value:
          permanentTotal +
          numberValue(propertyValue(leadingLoad, "psi1")) * variableValue(leadingLoad) +
          accompanyingValue,
        note: `with ${variableDescription(leadingLoad)} as main variable action`,
        dominantVariableLoadId: variableLoads.length > 1 ? variableId(leadingLoad) : null,
      };
    });
    const quasiPermanentVariableValue = variableLoads.reduce(
      (sum, load) => sum + numberValue(propertyValue(load, "psi2")) * variableValue(load),
      0,
    );
    return {
      rare: {
        combination: "SLE_RARE",
        values: rareValues,
        maximum: maximumValue(rareValues),
      },
      frequent: {
        combination: "SLE_FREQUENT",
        values: frequentValues,
        maximum: maximumValue(frequentValues),
      },
      quasiPermanent: {
        combination: "SLE_QUASI_PERMANENT",
        value: permanentTotal + quasiPermanentVariableValue,
      },
    };
  }
}
