import test from "node:test";

import { TecnariaConnector } from "../dist/index.js";
import type { TecnariaConnectorJson, TecnariaConnectorOptions } from "../dist/index.js";

const options: TecnariaConnectorOptions = {
  type: "MAXI",
  boardThickness: 0,
  units: { force: "N", length: "mm" },
  metadata: { label: "Tecnaria \u6728" },
};

const connector: TecnariaConnector = new TecnariaConnector(options);
const serialized: TecnariaConnectorJson = connector.toJSON();

void connector;
void serialized;

void test("TecnariaConnector exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
