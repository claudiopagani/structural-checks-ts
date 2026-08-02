import test from "node:test";

import { TimberDowelConnector } from "../dist/index.js";
import type {
  TimberDowelCharacteristicResistance,
  TimberDowelConnectorJson,
  TimberDowelConnectorOptions,
} from "../dist/index.js";

const options: TimberDowelConnectorOptions = {
  id: "typed-dowel",
  diameter: 16,
  timberDensityMean: 410,
  timberDensityCharacteristicSection1: 380,
  timberDensityCharacteristicSection2: 410,
  ultimateTensileStrength: 360,
  penetrationLength: 90,
  spacing: 50,
  units: { force: "N", length: "mm" },
  metadata: { label: "Dowel \u6728" },
};

const connector: TimberDowelConnector = new TimberDowelConnector(options);
const resistance: TimberDowelCharacteristicResistance =
  connector.timberTimberCharacteristicResistance(40);
const serialized: TimberDowelConnectorJson = connector.toJSON();

void connector;
void resistance;
void serialized;

void test("TimberDowelConnector exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
