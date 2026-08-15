import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Frozen parity inventory support.
 *
 * The link to the previous JavaScript implementation is severed: `migration/parity-inventory.json`
 * is a frozen historical record of the JavaScript origin and is never regenerated from a live
 * checkout. This module only reads the frozen record, validates its internal consistency, and
 * recomputes the TypeScript-side surface counts used by the drift check.
 */

const execFileAsync = promisify(execFile);

export type InventoryStatus =
    | "exact-parity"
    | "partial"
    | "missing"
    | "deferred"
    | "intentionally-excluded"
    | "decision-required";

export interface JsonObject {
    [key: string]: JsonValue;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface InventoryItem {
    id: string;
    name?: string;
    sourcePath: string;
    sourceBlobSha1: string;
    targetPath: string | null;
    migrationSlices: string[];
    sourceOracles: string[];
    targetTests: string[];
    validationEvidence: string[];
    status: InventoryStatus;
    notes?: string[];
}

export interface ExportInventoryItem extends InventoryItem {
    publicEntryPath: string;
    publicEntryBlobSha1: string;
}

export interface PackageExportInventoryItem {
    id: string;
    key: string;
    sourcePath: string;
    sourceBlobSha1: string;
    sourceTarget: string;
    sourceExportNames: string[];
    targetPath: string | null;
    targetExportNames: string[];
    status: InventoryStatus;
    notes?: string[];
}

export interface ApplicationCatalogInventoryItem extends InventoryItem {
    domain: string;
    maturity: string;
    primaryFocus?: string;
}

export interface RegistryInventoryItem extends InventoryItem {
    applicationId: string;
    applicationClass: string;
    targetApplicationPath: string;
    maturity: string | null;
}

export interface SerializedSchemaInventoryItem extends InventoryItem {
    value: string | number | null;
}

export interface SourceTestInventoryItem extends InventoryItem {
    testKind: "test" | "fixture" | "runner";
}

export interface ValidationCampaignInventoryItem extends InventoryItem {
    campaignId: string | null;
    exportedFunctions: string[];
}

export interface ValidationEvidenceInventoryItem {
    sliceId: string;
    sourceRevision: string;
    method: string | null;
    targetTests: string[];
    fixture: string | null;
    tolerances: JsonObject;
}

export interface StatusCounts {
    "exact-parity": number;
    partial: number;
    missing: number;
    deferred: number;
    "intentionally-excluded": number;
    "decision-required": number;
}

export interface PhaseA4Scope {
    schemaVersion: 1;
    phase: "A4";
    status: "revised";
    sourceRevision: string;
    normativeRevision: string;
    retainedSourcePaths: string[];
    deferredSourcePaths: string[];
    deferredApplicationExports: string[];
    deferredRootExports: string[];
    deferredRegistryApplicationIds: string[];
    decision: string;
}

export interface InventoryCounts {
    rootExports: { javascript: number; typescript: number };
    applicationsExports: { javascript: number; typescript: number };
    packageEntryPoints: { javascript: number; typescript: number };
    applicationRegistryEntries: { javascript: number; typescript: number };
    applicationCatalogEntries: { javascript: number; typescript: number };
    serializedSchemas: { javascript: number; typescript: number };
    sourceFiles: { javascript: number; typescript: number };
    tests: { javascript: number; typescript: number };
    validationCampaigns: { javascript: number; typescript: number };
    validationFiles: { javascript: number; typescript: number };
    examples: { javascript: number; typescript: number };
    benchmarks: { javascript: number; typescript: number };
    browserGates: { javascript: number; typescript: number };
    webWorkerGates: { javascript: number; typescript: number };
}

export interface BacklogGroup {
    statusCounts: StatusCounts;
    itemIds: string[];
}

export interface ParityInventory {
    schemaVersion: 1;
    generatedBy: string;
    source: {
        repositoryPath: string;
        revision: string;
        packageName: string;
        packageVersion: string;
        license: string;
        worktree: "clean";
    };
    normativeCorpus: {
        repositoryPath: string;
        revision: string;
        worktree: "clean";
    };
    packageExports: PackageExportInventoryItem[];
    rootExports: ExportInventoryItem[];
    applicationsExports: ExportInventoryItem[];
    applicationRegistryEntries: RegistryInventoryItem[];
    applicationCatalogEntries: ApplicationCatalogInventoryItem[];
    serializedSchemas: SerializedSchemaInventoryItem[];
    sourceFiles: InventoryItem[];
    tests: SourceTestInventoryItem[];
    validationFiles: InventoryItem[];
    validationCampaigns: ValidationCampaignInventoryItem[];
    examples: InventoryItem[];
    benchmarks: InventoryItem[];
    browserGates: InventoryItem[];
    webWorkerGates: InventoryItem[];
    validationEvidence: ValidationEvidenceInventoryItem[];
    phaseA4Scope: PhaseA4Scope;
    counts: InventoryCounts;
    remainingBacklog: {
        domain: BacklogGroup;
        norms: BacklogGroup;
        applications: BacklogGroup;
        packageValidation: BacklogGroup;
    };
    ambiguities: string[];
}

export interface RecordedBaselineManifest {
    source: {
        revision: string;
        packageName: string;
        packageVersion: string;
        license: string;
    };
}

interface TargetFiles {
    paths: Set<string>;
    texts: Map<string, string>;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function execGit(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
        maxBuffer: 50 * 1024 * 1024,
    });
    return stdout;
}

async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadBaselineManifest(): Promise<RecordedBaselineManifest> {
    const value = await readJson(path.join(repositoryRoot, "migration", "baseline.json"));
    if (!isRecord(value) || !isRecord(value.source)) {
        throw new Error("migration/baseline.json is not a valid baseline manifest.");
    }
    const source = value.source;
    const revision = source.revision;
    const packageName = source.packageName;
    const packageVersion = source.packageVersion;
    const license = source.license;
    if (
        typeof revision !== "string" ||
        revision.length === 0 ||
        typeof packageName !== "string" ||
        packageName.length === 0 ||
        typeof packageVersion !== "string" ||
        packageVersion.length === 0 ||
        typeof license !== "string" ||
        license.length === 0
    ) {
        throw new Error("migration/baseline.json does not record a complete source manifest.");
    }
    return {
        source: {
            revision,
            packageName,
            packageVersion,
            license,
        },
    };
}

function isInventoryArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

export async function loadRecordedParityInventory(
    inventoryPath = path.join(repositoryRoot, "migration", "parity-inventory.json"),
): Promise<ParityInventory> {
    const value = await readJson(inventoryPath);
    if (!isRecord(value) || !isRecord(value.counts) || !isRecord(value.source)) {
        throw new Error(`${inventoryPath} is not a valid parity inventory record.`);
    }
    for (const field of [
        "packageExports",
        "rootExports",
        "applicationsExports",
        "applicationRegistryEntries",
        "applicationCatalogEntries",
        "serializedSchemas",
        "sourceFiles",
        "tests",
        "validationFiles",
        "validationCampaigns",
        "examples",
        "benchmarks",
        "browserGates",
        "webWorkerGates",
    ]) {
        if (!isInventoryArray(value[field])) {
            throw new Error(`${inventoryPath} is missing the ${field} array.`);
        }
    }
    return value as unknown as ParityInventory;
}

/**
 * Validates the frozen record against itself and against the recorded baseline manifest. Returns
 * an empty array when the record is consistent.
 */
export function verifyRecordedParityInventory(
    recorded: ParityInventory,
    baseline: RecordedBaselineManifest,
): string[] {
    const errors: string[] = [];
    const schemaVersion: number = recorded.schemaVersion;
    if (schemaVersion !== 1) {
        errors.push(`Recorded inventory schemaVersion is ${schemaVersion}, expected 1.`);
    }
    if (recorded.source.revision !== baseline.source.revision) {
        errors.push(
            `Recorded source revision ${recorded.source.revision} differs from baseline revision ${baseline.source.revision}.`,
        );
    }
    const javascriptLengths: Array<[keyof ParityInventory, keyof InventoryCounts]> = [
        ["packageExports", "packageEntryPoints"],
        ["rootExports", "rootExports"],
        ["applicationsExports", "applicationsExports"],
        ["applicationRegistryEntries", "applicationRegistryEntries"],
        ["applicationCatalogEntries", "applicationCatalogEntries"],
        ["serializedSchemas", "serializedSchemas"],
        ["sourceFiles", "sourceFiles"],
        ["tests", "tests"],
        ["validationCampaigns", "validationCampaigns"],
        ["validationFiles", "validationFiles"],
        ["examples", "examples"],
        ["benchmarks", "benchmarks"],
        ["browserGates", "browserGates"],
        ["webWorkerGates", "webWorkerGates"],
    ];
    for (const [arrayField, countField] of javascriptLengths) {
        const length = (recorded[arrayField] as unknown[]).length;
        if (recorded.counts[countField].javascript !== length) {
            errors.push(
                `Recorded counts.${countField}.javascript is ${recorded.counts[countField].javascript}, but the ${arrayField} array has ${length} items.`,
            );
        }
    }
    return errors;
}

async function loadTargetFiles(): Promise<TargetFiles> {
    const tracked = (await execGit(["ls-files"])).trim().split(/\r?\n/).filter(Boolean);
    const untracked = (await execGit(["ls-files", "--others", "--exclude-standard"]))
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
    const paths = new Set([...tracked, ...untracked]);
    const texts = new Map<string, string>();
    await Promise.all(
        [...paths]
            .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".json"))
            .map(async (filePath) => {
                try {
                    texts.set(filePath, await readFile(path.join(repositoryRoot, filePath), "utf8"));
                } catch {
                    // A tracked generated file may not be present in a fresh checkout.
                }
            }),
    );
    return { paths, texts };
}

function removeComments(value: string): string {
    return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function resolveTargetModule(
    relativePath: string,
    specifier: string,
    targetFiles: TargetFiles,
): string | null {
    if (!specifier.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier));
    const targetBase = base.endsWith(".js") ? `${base.slice(0, -3)}.ts` : base;
    const candidates = [
        base,
        targetBase,
        base.endsWith(".ts") ? base : `${base}.ts`,
        `${base}/index.ts`,
    ];
    return candidates.find((candidate) => targetFiles.paths.has(candidate)) ?? null;
}

async function collectTargetModuleExports(
    targetFiles: TargetFiles,
    relativePath: string,
    cache: Map<string, string[]>,
    active: Set<string>,
): Promise<string[]> {
    const cached = cache.get(relativePath);
    if (cached) return cached;
    if (active.has(relativePath)) return [];
    active.add(relativePath);
    const text = targetFiles.texts.get(relativePath) ?? "";
    const cleaned = removeComments(text);
    const names = new Set<string>();
    for (const match of cleaned.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']\s*;?/g)) {
        const modulePath = match[1] ? resolveTargetModule(relativePath, match[1], targetFiles) : null;
        if (modulePath) {
            for (const name of await collectTargetModuleExports(targetFiles, modulePath, cache, active))
                names.add(name);
        }
    }
    for (const match of cleaned.matchAll(
        /export\s+(\{[\s\S]*?\})(?:\s+from\s+["']([^"']+)["'])?\s*;?/g,
    )) {
        for (const rawPart of (match[1] ?? "").slice(1, -1).split(",")) {
            const part = rawPart.trim();
            if (!part || part.startsWith("type ")) continue;
            const named = /^(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?$/.exec(part);
            if (named?.[1]) names.add(named[2] ?? named[1]);
        }
    }
    for (const match of cleaned.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g)) {
        if (match[1]) names.add(match[1]);
    }
    for (const match of cleaned.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) {
        if (match[1]) names.add(match[1]);
    }
    const result = [...names].sort();
    cache.set(relativePath, result);
    active.delete(relativePath);
    return result;
}

export interface CurrentTypescriptCounts {
    rootExports: number;
    applicationsExports: number;
    packageEntryPoints: number;
    sourceFiles: number;
    tests: number;
}

/**
 * Recomputes the TypeScript-side surface counts from the current working tree. These are the
 * counts the drift check compares against the frozen record; no JavaScript-side quantity is
 * recomputed because the previous implementation is never consulted.
 */
export async function computeCurrentTypescriptCounts(
    recorded: ParityInventory,
): Promise<CurrentTypescriptCounts> {
    const targetFiles = await loadTargetFiles();
    const packageJson = (await readJson(path.join(repositoryRoot, "package.json"))) as {
        exports?: Record<string, unknown>;
    };
    const rootExports = targetFiles.paths.has("src/index.ts")
        ? await collectTargetModuleExports(targetFiles, "src/index.ts", new Map(), new Set())
        : [];
    const applicationsExports = rootExports.filter((name) =>
        recorded.applicationsExports.some((item) => item.id === name),
    ).length;
    const sourceFiles = [...targetFiles.paths].filter(
        (filePath) => filePath.startsWith("src/") && filePath.endsWith(".ts"),
    ).length;
    const tests = [...targetFiles.paths].filter(
        (filePath) => filePath.startsWith("tests/") && filePath.endsWith(".test.ts"),
    ).length;
    return {
        rootExports: rootExports.length,
        applicationsExports,
        packageEntryPoints: Object.keys(packageJson.exports ?? {}).length,
        sourceFiles,
        tests,
    };
}

export function defaultPaths(): { inventoryPath: string; summaryPath: string } {
    return {
        inventoryPath: path.join(repositoryRoot, "migration", "parity-inventory.json"),
        summaryPath: path.join(repositoryRoot, "docs", "parity-inventory.md"),
    };
}
