import test from "node:test";

import { createTecnariaConnector } from "../dist/index.js";
import type { TecnariaConnector, TecnariaConnectorOptions } from "../dist/index.js";

const options: TecnariaConnectorOptions = {
  type: "MAXI",
  boardThickness: 0,
  units: { force: "N", length: "mm" },
  metadata: { label: "Factory \u6728" },
};

const connector: TecnariaConnector = createTecnariaConnector(options);
const serialized = connector.toJSON();

void connector;
void serialized;

void test("createTecnariaConnector exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
