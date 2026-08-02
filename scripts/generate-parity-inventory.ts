import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as InventoryModule from "./parity-inventory.js";

const inventoryModule = (await import(
  pathToFileURL(path.join(import.meta.dirname, "parity-inventory.ts")).href
)) as typeof InventoryModule;

const inventory = await inventoryModule.buildParityInventory();
const paths = inventoryModule.defaultPaths();
await inventoryModule.writeParityInventory(inventory, paths.inventoryPath);
await inventoryModule.writeParitySummary(inventory, paths.summaryPath);

console.log(
  `Parity inventory generated (${inventory.counts.rootExports.javascript} root exports, ${inventory.counts.applicationsExports.javascript} applications exports, ${inventory.counts.packageEntryPoints.javascript} package entry points).`,
);
