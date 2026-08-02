// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/connectors/tecnariaConnectorCatalog.js.

export interface TecnariaConnectorData {
  fvrk: number;
  kser: number;
  ku: number;
}

export interface TecnariaConnectorFamily {
  producer: string;
  boardThickness: Record<string, TecnariaConnectorData>;
}

export interface TecnariaConnectorCatalog {
  BASE: TecnariaConnectorFamily;
  MAXI: TecnariaConnectorFamily;
  [type: string]: TecnariaConnectorFamily;
}

export const TECNARIA_CONNECTOR_CATALOG: TecnariaConnectorCatalog = {
  BASE: {
    producer: "Tecnaria",
    boardThickness: {
      0: { fvrk: 17.2, kser: 17.9, ku: 9.99 },
      2: { fvrk: 8.96, kser: 4.0, ku: 2.49 },
      4: { fvrk: 5.86, kser: 1.43, ku: 1.2 },
    },
  },
  MAXI: {
    producer: "Tecnaria",
    boardThickness: {
      0: { fvrk: 19.3, kser: 18.6, ku: 10.4 },
      2: { fvrk: 15.0, kser: 7.68, ku: 4.35 },
      4: { fvrk: 11.3, kser: 3.06, ku: 2.66 },
    },
  },
};

export const TECNARIA_CONNECTOR_TYPES: readonly string[] = Object.freeze(
  Object.keys(TECNARIA_CONNECTOR_CATALOG),
);

export function getTecnariaConnectorData(
  type: string,
  boardThickness: number | string,
): TecnariaConnectorData | null {
  const family = TECNARIA_CONNECTOR_CATALOG[type];

  if (!family) {
    return null;
  }

  return family.boardThickness[String(boardThickness)] ?? null;
}
