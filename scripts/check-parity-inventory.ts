import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type * as InventoryModule from "./parity-inventory.js";

const inventoryModule = (await import(
  pathToFileURL(path.join(import.meta.dirname, "parity-inventory.ts")).href
)) as typeof InventoryModule;
type ParityInventory = InventoryModule.ParityInventory;

const paths = inventoryModule.defaultPaths();
const expected = await inventoryModule.buildParityInventory();
const recorded = JSON.parse(await readFile(paths.inventoryPath, "utf8")) as ParityInventory;

assert.deepEqual(
  recorded,
  expected,
  "migration/parity-inventory.json is stale; run npm run inventory:generate against the pinned baseline.",
);

console.log(
  `Parity inventory check passed (${expected.counts.rootExports.javascript} root exports, ${expected.counts.applicationsExports.javascript} applications exports, ${expected.counts.packageEntryPoints.javascript} package entry points).`,
);
