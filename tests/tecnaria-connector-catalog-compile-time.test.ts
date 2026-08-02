import test from "node:test";

import {
  TECNARIA_CONNECTOR_CATALOG,
  TECNARIA_CONNECTOR_TYPES,
  getTecnariaConnectorData,
} from "../dist/index.js";
import type {
  TecnariaConnectorCatalog,
  TecnariaConnectorData,
  TecnariaConnectorFamily,
} from "../dist/index.js";

const catalog: TecnariaConnectorCatalog = TECNARIA_CONNECTOR_CATALOG;
const family: TecnariaConnectorFamily = catalog.BASE;
const data: TecnariaConnectorData | null = getTecnariaConnectorData("MAXI", 0);
const types: readonly string[] = TECNARIA_CONNECTOR_TYPES;

void catalog;
void family;
void data;
void types;

void test("Tecnaria connector catalog exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
