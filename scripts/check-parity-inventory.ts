import path from "node:path";
import { pathToFileURL } from "node:url";

import type * as InventoryModule from "./parity-inventory.js";

const inventoryModule = (await import(
    pathToFileURL(path.join(import.meta.dirname, "parity-inventory.ts")).href
)) as typeof InventoryModule;

/**
 * Drift check over the frozen parity inventory.
 *
 * The JavaScript side of `migration/parity-inventory.json` is a frozen historical record; the
 * previous implementation is never consulted. The check validates the frozen record against
 * itself and against the recorded baseline manifest, and verifies that the recomputed current
 * TypeScript surface counts match the recorded TypeScript-side counts.
 */

const paths = inventoryModule.defaultPaths();
const recorded = await inventoryModule.loadRecordedParityInventory(paths.inventoryPath);
const baseline = await inventoryModule.loadBaselineManifest();

const recordErrors = inventoryModule.verifyRecordedParityInventory(recorded, baseline);
if (recordErrors.length > 0) {
    for (const error of recordErrors) {
        console.error(`Parity inventory error: ${error}`);
    }
    process.exit(1);
}

const current = await inventoryModule.computeCurrentTypescriptCounts(recorded);
const checkedCounts = [
    "rootExports",
    "applicationsExports",
    "packageEntryPoints",
    "sourceFiles",
    "tests",
] as const;
for (const key of checkedCounts) {
    const recordedCount = recorded.counts[key].typescript;
    const currentCount = current[key];
    if (recordedCount !== currentCount) {
        console.error(
            `Parity inventory error: current TypeScript ${key} count is ${currentCount}, recorded ${recordedCount}. ` +
            "Update the frozen record with a deliberate decision before changing this count.",
        );
        process.exit(1);
    }
}

console.log(
    `Parity inventory check passed (frozen JavaScript baseline at ${recorded.source.revision}; ` +
    `${current.rootExports} root exports, ${current.applicationsExports} applications exports, ` +
    `${current.packageEntryPoints} package entry points, ${current.sourceFiles} source files, ` +
    `${current.tests} tests).`,
);
