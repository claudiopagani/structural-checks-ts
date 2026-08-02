// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/connectors/createTecnariaConnector.js.

import { TecnariaConnector, type TecnariaConnectorOptions } from "./TecnariaConnector.js";

export function createTecnariaConnector(options: TecnariaConnectorOptions): TecnariaConnector {
  return new TecnariaConnector(options);
}
