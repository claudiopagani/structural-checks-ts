// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/connectors/TecnariaConnector.js.

import { assertExplicitUnitSystem, type UnitSystemInput } from "../units/UnitSystem.js";
import {
  TECNARIA_CONNECTOR_CATALOG,
  getTecnariaConnectorData,
} from "./tecnariaConnectorCatalog.js";
import { ShearConnector, type ShearConnectorJson } from "./ShearConnector.js";

export interface TecnariaConnectorOptions extends Record<string, unknown> {
  type: string;
  boardThickness: number | string;
  id?: unknown;
  name?: unknown;
  units?: UnitSystemInput | null;
  metadata?: Record<string, unknown>;
}

export interface TecnariaConnectorJson extends ShearConnectorJson {
  type: unknown;
  boardThickness: number;
}

export class TecnariaConnector extends ShearConnector {
  type: unknown;
  boardThickness: number;

  constructor({
    type,
    boardThickness,
    id = null,
    name = null,
    units = null,
    metadata = {},
  }: TecnariaConnectorOptions) {
    assertExplicitUnitSystem(units, "TecnariaConnector");
    const family = TECNARIA_CONNECTOR_CATALOG[type];
    const data = getTecnariaConnectorData(type, boardThickness);
    const catalogUnits = { force: "kN", length: "mm" } as const;

    if (!family || !data) {
      throw new Error(
        `Unsupported Tecnaria connector configuration: ${type} / ${boardThickness} cm.`,
      );
    }

    super({
      id,
      name: name ?? `Tecnaria ${type} ${boardThickness} cm`,
      family: type,
      producer: family.producer,
      kser: data.kser,
      ku: data.ku,
      fvrk: data.fvrk,
      units: catalogUnits,
      metadata: {
        ...metadata,
        boardThickness,
        source: "tecnaria_catalog",
      },
    });

    this.type = type;
    this.boardThickness = Number(boardThickness);
  }

  override toJSON(): TecnariaConnectorJson {
    return {
      ...super.toJSON(),
      type: this.type,
      boardThickness: this.boardThickness,
    };
  }
}
