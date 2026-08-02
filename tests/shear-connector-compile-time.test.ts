import test from "node:test";

import { ShearConnector } from "../dist/index.js";
import type { ShearConnectorJson, ShearConnectorOptions } from "../dist/index.js";

const options: ShearConnectorOptions = {
  id: "typed-connector",
  name: "Typed connector",
  family: "typed-family",
  producer: "TypedProducer",
  kser: 18_600,
  ku: 10_400,
  fvrk: 19_300,
  units: { force: "N", length: "mm" },
  metadata: { label: "Connector \u6728" },
};

const connector: ShearConnector = new ShearConnector(options);
const serialized: ShearConnectorJson = connector.toJSON();

void connector;
void serialized;

void test("ShearConnector exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
