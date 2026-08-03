import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SOURCE_REVISION = "6f33baead8b88166c4b2cf94af41763412e3c751";
export const NORMATIVE_REVISION = "41da3faa489600173106935bbcf726119300e48d";

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

interface SourceRecord {
  path: string;
  gitBlobSha1: string;
  targetPath?: string;
}

interface SliceManifest {
  sliceId: string;
  source: { revision: string };
  sourceFiles: SourceRecord[];
  sourceOracles: SourceRecord[];
  sourcePublicExport?: SourceRecord;
  targetTests: string[];
  publicExports: string[];
  publicTypeExports?: string[];
  implementationStatus?: string;
  independentValidation?: JsonObject;
}

interface ParsedExport {
  name: string;
  sourcePath: string;
}

interface SourcePackage {
  name: string;
  version: string;
  license: string;
  exports: Record<string, unknown>;
}

interface TargetPackage {
  exports: Record<string, unknown>;
}

interface CatalogRecord {
  id: string;
  name: string;
  domain: string;
  maturity: string;
  primaryFocus?: string;
}

interface TargetFiles {
  paths: Set<string>;
  texts: Map<string, string>;
}

interface SourceContext {
  sourcePath: string;
  sourceTree: Map<string, string>;
  sourceTexts: Map<string, string>;
  sourcePackage: SourcePackage;
  normativePath: string;
  targetFiles: TargetFiles;
  slices: SliceManifest[];
  sourceToSlices: Map<string, string[]>;
  sourceToTarget: Map<string, string>;
  sourceToOracles: Map<string, string[]>;
  sourceToTargetTests: Map<string, string[]>;
  sourceToValidation: Map<string, string[]>;
  exportToSlices: Map<string, string[]>;
  exportToOracles: Map<string, string[]>;
  exportToTargetTests: Map<string, string[]>;
  exportToValidation: Map<string, string[]>;
  validationEvidence: ValidationEvidenceInventoryItem[];
  phaseA4Scope: PhaseA4Scope;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const defaultSourcePath = path.resolve(repositoryRoot, "..", "strutture-js");
const defaultNormativePath = path.resolve(repositoryRoot, "..", "strutture-normative");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item));
  return isRecord(value) && Object.values(value).every((item) => isJsonValue(item));
}

function asJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) return {};
  const output: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (isJsonValue(item)) output[key] = item;
  }
  return output;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function execGit(repositoryPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function parsePhaseA4Scope(value: unknown): PhaseA4Scope {
  if (!isRecord(value)) {
    throw new Error("migration/phase-a4-scope.json is not an object.");
  }

  if (value.schemaVersion !== 1 || value.phase !== "A4" || value.status !== "revised") {
    throw new Error("migration/phase-a4-scope.json has unsupported scope metadata.");
  }

  const sourceRevision = stringValue(value.sourceRevision, "");
  const normativeRevision = stringValue(value.normativeRevision, "");
  if (sourceRevision !== SOURCE_REVISION || normativeRevision !== NORMATIVE_REVISION) {
    throw new Error("migration/phase-a4-scope.json revisions do not match the pinned baselines.");
  }

  return {
    schemaVersion: 1,
    phase: "A4",
    status: "revised",
    sourceRevision,
    normativeRevision,
    retainedSourcePaths: stringArray(value.retainedSourcePaths),
    deferredSourcePaths: stringArray(value.deferredSourcePaths),
    deferredApplicationExports: stringArray(value.deferredApplicationExports),
    deferredRootExports: stringArray(value.deferredRootExports),
    deferredRegistryApplicationIds: stringArray(value.deferredRegistryApplicationIds),
    decision: stringValue(value.decision, ""),
  };
}

async function loadPhaseA4Scope(): Promise<PhaseA4Scope> {
  return parsePhaseA4Scope(
    await readJson(path.join(repositoryRoot, "migration", "phase-a4-scope.json")),
  );
}

async function loadTargetFiles(): Promise<TargetFiles> {
  const tracked = (await execGit(repositoryRoot, ["ls-files"]))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const untracked = (await execGit(repositoryRoot, ["ls-files", "--others", "--exclude-standard"]))
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

async function loadSourceTree(sourcePath: string): Promise<Map<string, string>> {
  const tree = await execGit(sourcePath, ["ls-tree", "-r", "--full-tree", SOURCE_REVISION]);
  const result = new Map<string, string>();
  for (const line of tree.trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^(?:\d+)\s+blob\s+([0-9a-f]+)\t(.+)$/.exec(line);
    if (match?.[1] && match[2]) result.set(match[2], match[1]);
  }
  return result;
}

async function loadSourceText(context: SourceContext, sourceRelativePath: string): Promise<string> {
  const cached = context.sourceTexts.get(sourceRelativePath);
  if (cached !== undefined) return cached;
  const text = await readFile(path.join(context.sourcePath, sourceRelativePath), "utf8");
  context.sourceTexts.set(sourceRelativePath, text);
  return text;
}

function parseSourcePackage(value: unknown): SourcePackage {
  if (!isRecord(value)) throw new Error("Source package.json is not an object.");
  const exportsValue = value.exports;
  if (!isRecord(exportsValue)) throw new Error("Source package.json exports is not an object.");
  return {
    name: stringValue(value.name, ""),
    version: stringValue(value.version, ""),
    license: stringValue(value.license, ""),
    exports: exportsValue,
  };
}

function parseTargetPackage(value: unknown): TargetPackage {
  if (!isRecord(value) || !isRecord(value.exports)) return { exports: {} };
  return { exports: value.exports };
}

async function verifyPinnedRepositories(
  sourcePath: string,
  normativePath: string,
): Promise<{ sourcePackage: SourcePackage; sourceTree: Map<string, string> }> {
  const sourceRevision = (await execGit(sourcePath, ["rev-parse", "HEAD"])).trim();
  const normativeRevision = (await execGit(normativePath, ["rev-parse", "HEAD"])).trim();
  if (sourceRevision !== SOURCE_REVISION) {
    throw new Error(`strutture-js revision ${sourceRevision} differs from ${SOURCE_REVISION}.`);
  }
  if (normativeRevision !== NORMATIVE_REVISION) {
    throw new Error(
      `strutture-normative revision ${normativeRevision} differs from ${NORMATIVE_REVISION}.`,
    );
  }
  const sourceStatus = (await execGit(sourcePath, ["status", "--porcelain=v1"])).trim();
  const normativeStatus = (await execGit(normativePath, ["status", "--porcelain=v1"])).trim();
  if (sourceStatus) throw new Error("strutture-js baseline worktree is dirty.");
  if (normativeStatus) throw new Error("strutture-normative worktree is dirty.");
  const sourcePackage = parseSourcePackage(await readJson(path.join(sourcePath, "package.json")));
  return { sourcePackage, sourceTree: await loadSourceTree(sourcePath) };
}

function parseSourceRecord(value: unknown): SourceRecord | null {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.gitBlobSha1 !== "string") {
    return null;
  }
  return {
    path: value.path,
    gitBlobSha1: value.gitBlobSha1,
    ...(typeof value.targetPath === "string" ? { targetPath: value.targetPath } : {}),
  };
}

function parseSlice(value: unknown): SliceManifest | null {
  if (!isRecord(value) || typeof value.sliceId !== "string" || !isRecord(value.source)) return null;
  const sourceFiles = Array.isArray(value.sourceFiles)
    ? value.sourceFiles.map(parseSourceRecord).filter((item): item is SourceRecord => item !== null)
    : [];
  const sourceOracles = Array.isArray(value.sourceOracles)
    ? value.sourceOracles
        .map(parseSourceRecord)
        .filter((item): item is SourceRecord => item !== null)
    : [];
  const sourcePublicExport = parseSourceRecord(value.sourcePublicExport);
  return {
    sliceId: value.sliceId,
    source: { revision: stringValue(value.source.revision, "") },
    sourceFiles,
    sourceOracles,
    ...(sourcePublicExport ? { sourcePublicExport } : {}),
    targetTests: stringArray(value.targetTests),
    publicExports: stringArray(value.publicExports),
    ...(Array.isArray(value.publicTypeExports)
      ? { publicTypeExports: stringArray(value.publicTypeExports) }
      : {}),
    ...(typeof value.implementationStatus === "string"
      ? { implementationStatus: value.implementationStatus }
      : {}),
    ...(isRecord(value.independentValidation)
      ? { independentValidation: asJsonObject(value.independentValidation) }
      : {}),
  };
}

async function loadSlices(): Promise<SliceManifest[]> {
  const directory = path.join(repositoryRoot, "migration", "slices");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const slices = await Promise.all(
    names.map(async (name) => parseSlice(await readJson(path.join(directory, name)))),
  );
  return slices.filter((slice): slice is SliceManifest => slice !== null);
}

function addMapValue(map: Map<string, string[]>, key: string, values: string[]): void {
  const current = map.get(key) ?? [];
  map.set(key, [...new Set([...current, ...values])].sort());
}

function buildSliceMaps(
  slices: SliceManifest[],
): Pick<
  SourceContext,
  | "sourceToSlices"
  | "sourceToTarget"
  | "sourceToOracles"
  | "sourceToTargetTests"
  | "sourceToValidation"
  | "exportToSlices"
  | "exportToOracles"
  | "exportToTargetTests"
  | "exportToValidation"
  | "validationEvidence"
> {
  const sourceToSlices = new Map<string, string[]>();
  const sourceToTarget = new Map<string, string>();
  const sourceToOracles = new Map<string, string[]>();
  const sourceToTargetTests = new Map<string, string[]>();
  const sourceToValidation = new Map<string, string[]>();
  const exportToSlices = new Map<string, string[]>();
  const exportToOracles = new Map<string, string[]>();
  const exportToTargetTests = new Map<string, string[]>();
  const exportToValidation = new Map<string, string[]>();
  const validationEvidence: ValidationEvidenceInventoryItem[] = [];

  for (const slice of slices) {
    const sliceId = slice.sliceId;
    const validation = slice.independentValidation;
    if (validation) {
      const targetTests = stringArray(validation.targetTests);
      const targetTest = typeof validation.targetTest === "string" ? validation.targetTest : null;
      validationEvidence.push({
        sliceId,
        sourceRevision: slice.source.revision,
        method: typeof validation.method === "string" ? validation.method : null,
        targetTests: [...new Set([...targetTests, ...(targetTest ? [targetTest] : [])])].sort(),
        fixture: typeof validation.fixture === "string" ? validation.fixture : null,
        tolerances: asJsonObject(validation.tolerances),
      });
    }

    for (const record of slice.sourceFiles) {
      addMapValue(sourceToSlices, record.path, [sliceId]);
      if (record.targetPath) sourceToTarget.set(record.path, record.targetPath);
      addMapValue(
        sourceToOracles,
        record.path,
        slice.sourceOracles.map((oracle) => oracle.path),
      );
      addMapValue(sourceToTargetTests, record.path, slice.targetTests);
      if (validation) addMapValue(sourceToValidation, record.path, [sliceId]);
    }
    for (const oracle of slice.sourceOracles) {
      addMapValue(sourceToSlices, oracle.path, [sliceId]);
      addMapValue(sourceToOracles, oracle.path, [oracle.path]);
      addMapValue(sourceToTargetTests, oracle.path, slice.targetTests);
      if (validation) addMapValue(sourceToValidation, oracle.path, [sliceId]);
    }
    if (slice.sourcePublicExport) {
      addMapValue(sourceToSlices, slice.sourcePublicExport.path, [sliceId]);
      if (slice.sourcePublicExport.targetPath) {
        sourceToTarget.set(slice.sourcePublicExport.path, slice.sourcePublicExport.targetPath);
      }
    }
    for (const name of [...slice.publicExports, ...(slice.publicTypeExports ?? [])]) {
      addMapValue(exportToSlices, name, [sliceId]);
      addMapValue(
        exportToOracles,
        name,
        slice.sourceOracles.map((oracle) => oracle.path),
      );
      addMapValue(exportToTargetTests, name, slice.targetTests);
      if (validation) addMapValue(exportToValidation, name, [sliceId]);
    }
  }

  return {
    sourceToSlices,
    sourceToTarget,
    sourceToOracles,
    sourceToTargetTests,
    sourceToValidation,
    exportToSlices,
    exportToOracles,
    exportToTargetTests,
    exportToValidation,
    validationEvidence: validationEvidence.sort((left, right) =>
      left.sliceId.localeCompare(right.sliceId),
    ),
  };
}

function removeComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function resolveSourceModule(
  relativePath: string,
  specifier: string,
  sourceTree: Map<string, string>,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier));
  const candidates = [base, base.endsWith(".js") ? base : `${base}.js`, `${base}/index.js`];
  return candidates.find((candidate) => sourceTree.has(candidate)) ?? null;
}

function resolveTargetModule(
  relativePath: string,
  specifier: string,
  targetFiles: TargetFiles,
): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier));
  const candidates = [base, base.endsWith(".ts") ? base : `${base}.ts`, `${base}/index.ts`];
  return candidates.find((candidate) => targetFiles.paths.has(candidate)) ?? null;
}

async function collectModuleExports(
  context: SourceContext,
  relativePath: string,
  cache: Map<string, ParsedExport[]>,
  active: Set<string>,
): Promise<ParsedExport[]> {
  const cached = cache.get(relativePath);
  if (cached) return cached;
  if (active.has(relativePath)) return [];
  active.add(relativePath);
  const text = await loadSourceText(context, relativePath);
  const cleaned = removeComments(text);
  const result = new Map<string, ParsedExport>();
  const add = (name: string, sourcePath: string): void => {
    if (name !== "default" && !result.has(name)) result.set(name, { name, sourcePath });
  };

  for (const match of cleaned.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']\s*;?/g)) {
    const modulePath = match[1]
      ? resolveSourceModule(relativePath, match[1], context.sourceTree)
      : null;
    if (!modulePath) continue;
    for (const item of await collectModuleExports(context, modulePath, cache, active))
      add(item.name, item.sourcePath);
  }

  for (const match of cleaned.matchAll(
    /export\s+(\{[\s\S]*?\})(?:\s+from\s+["']([^"']+)["'])?\s*;?/g,
  )) {
    const body = match[1] ?? "";
    const modulePath = match[2]
      ? resolveSourceModule(relativePath, match[2], context.sourceTree)
      : null;
    for (const rawPart of body.slice(1, -1).split(",")) {
      const part = rawPart.trim();
      if (!part || part.startsWith("type ")) continue;
      const named = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(part);
      if (!named?.[1]) continue;
      const importedName = named[1];
      const exportedName = named[2] ?? importedName;
      if (modulePath) {
        const nested = await collectModuleExports(context, modulePath, cache, active);
        const resolved = nested.find((item) => item.name === importedName);
        add(exportedName, resolved?.sourcePath ?? modulePath);
      } else {
        add(exportedName, relativePath);
      }
    }
  }

  for (const match of cleaned.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g)) {
    if (match[1]) add(match[1], relativePath);
  }
  for (const match of cleaned.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) {
    if (match[1]) add(match[1], relativePath);
  }
  const exports = [...result.values()].sort((left, right) => left.name.localeCompare(right.name));
  cache.set(relativePath, exports);
  active.delete(relativePath);
  return exports;
}

async function collectTargetModuleExports(
  context: SourceContext,
  relativePath: string,
  cache: Map<string, string[]>,
  active: Set<string>,
): Promise<string[]> {
  const cached = cache.get(relativePath);
  if (cached) return cached;
  if (active.has(relativePath)) return [];
  active.add(relativePath);
  const text = context.targetFiles.texts.get(relativePath) ?? "";
  const cleaned = removeComments(text);
  const names = new Set<string>();
  for (const match of cleaned.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']\s*;?/g)) {
    const modulePath = match[1]
      ? resolveTargetModule(relativePath, match[1], context.targetFiles)
      : null;
    if (modulePath) {
      for (const name of await collectTargetModuleExports(context, modulePath, cache, active))
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
    const modulePath = match[2]
      ? resolveTargetModule(relativePath, match[2], context.targetFiles)
      : null;
    if (modulePath) {
      for (const name of await collectTargetModuleExports(context, modulePath, cache, active))
        names.add(name);
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

function sourceTargetPath(sourcePath: string): string {
  return sourcePath.endsWith(".js") ? `${sourcePath.slice(0, -3)}.ts` : sourcePath;
}

function packageTargetValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    for (const key of ["import", "default", "types", "require"]) {
      if (typeof value[key] === "string") return value[key];
    }
  }
  return "";
}

function sourceEntryPathForPackageKey(key: string, sourceTarget: string): string {
  if (key === "./applications/*") return "src/applications/index.js";
  return sourceTarget.replace(/^\.\//, "");
}

function targetSourcePathForPackageValue(value: string): string | null {
  if (!value) return null;
  const sourceValue = value
    .replace(/^\.\/dist\//, "./src/")
    .replace(/\.d\.ts$/, ".ts")
    .replace(/\.js$/, ".ts");
  const normalized = sourceValue.replace(/^\.\//, "");
  return normalized;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function targetTestsFor(
  context: SourceContext,
  slices: string[],
  mappedTests: string[],
  name?: string,
): string[] {
  const candidates = uniqueSorted(mappedTests);
  const existing = candidates.filter((testPath) => context.targetFiles.paths.has(testPath));
  if (existing.length > 0) return existing;
  if (!name) return [];
  return [...context.targetFiles.texts.entries()]
    .filter(
      ([filePath, text]) =>
        filePath.startsWith("tests/") &&
        filePath.endsWith(".test.ts") &&
        new RegExp(`\\b${name.replace(/[$^.*+?()[\]{}|\\]/g, "\\$&")}\\b`).test(text),
    )
    .map(([filePath]) => filePath)
    .sort();
}

function itemStatus(
  targetPath: string | null,
  targetExists: boolean,
  slices: string[],
  targetTests: string[],
  sourceOracles: string[],
): InventoryStatus {
  if (!targetExists) return "missing";
  if (slices.length > 0 && (targetTests.length > 0 || sourceOracles.length > 0))
    return "exact-parity";
  return "partial";
}

function makeStatusCounts(items: Array<{ status: InventoryStatus }>): StatusCounts {
  const result: StatusCounts = {
    "exact-parity": 0,
    partial: 0,
    missing: 0,
    deferred: 0,
    "intentionally-excluded": 0,
    "decision-required": 0,
  };
  for (const item of items) result[item.status] += 1;
  return result;
}

function applyPhaseA4Scope<T extends { status: InventoryStatus }>(
  items: T[],
  shouldDefer: (item: T) => boolean,
): T[] {
  return items.map((item) =>
    item.status !== "exact-parity" && shouldDefer(item) ? { ...item, status: "deferred" } : item,
  );
}

function defaultTargetTestsForSource(sourcePath: string): string[] {
  if (!sourcePath.startsWith("tests/") || !sourcePath.endsWith(".test.js")) return [];
  return [sourcePath.slice(0, -3) + ".ts"];
}

function sourceTestKind(sourcePath: string): SourceTestInventoryItem["testKind"] {
  if (sourcePath.endsWith("run-tests.js")) return "runner";
  if (sourcePath.includes("/fixtures/")) return "fixture";
  return "test";
}

function campaignId(text: string): string | null {
  const ids = [...text.matchAll(/(?:id|campaignId):\s*["']([^"']*validation-campaign[^"']*)["']/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
  return ids.at(-1) ?? null;
}

function exportedFunctions(text: string): string[] {
  return [...text.matchAll(/export\s+function\s+(\w+)/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .sort();
}

function parseCatalog(text: string): CatalogRecord[] {
  const records: CatalogRecord[] = [];
  const pattern =
    /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*domain:\s*"([^"]+)",\s*maturity:\s*"([^"]+)",([\s\S]*?)\n\s*\},/g;
  for (const match of text.matchAll(pattern)) {
    const body = match[5] ?? "";
    const primaryFocus = /primaryFocus:\s*"([^"]*)"/.exec(body)?.[1];
    if (match[1] && match[2] && match[3] && match[4]) {
      records.push({
        id: match[1],
        name: match[2],
        domain: match[3],
        maturity: match[4],
        ...(primaryFocus ? { primaryFocus } : {}),
      });
    }
  }
  return records;
}

function parseRegistryEntries(
  text: string,
  catalog: CatalogRecord[],
): Array<{
  applicationClass: string;
  applicationId: string;
  targetApplicationPath: string;
  maturity: string | null;
}> {
  const importMap = new Map<string, string>();
  for (const match of text.matchAll(/import\s+\{([^}]*)\}\s+from\s+"\.\/([^/]+)\/index\.js"/g)) {
    const importedNames = (match[1] ?? "")
      .split(",")
      .map((part) => /\b(\w+)\b/.exec(part.trim())?.[1])
      .filter((name): name is string => Boolean(name));
    for (const importedName of importedNames) {
      if (match[2]) importMap.set(importedName, match[2]);
    }
  }
  const body = /new\s+ApplicationRegistry\(\[([\s\S]*?)\]\)/.exec(text)?.[1] ?? "";
  return [...body.matchAll(/new\s+(\w+)\(\s*\)/g)]
    .map((match) => {
      const applicationClass = match[1] ?? "";
      const applicationId = importMap.get(applicationClass) ?? "";
      const maturity = catalog.find((entry) => entry.id === applicationId)?.maturity ?? null;
      return {
        applicationClass,
        applicationId,
        targetApplicationPath: `src/applications/${applicationId}`,
        maturity,
      };
    })
    .filter((entry) => entry.applicationClass && entry.applicationId);
}

function sourceLiteralValue(text: string, name: string): string | number | null {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;\\n]+)`).exec(text);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  if (/^"(?:[^"\\]|\\.)*"$/.test(raw) || /^'(?:[^'\\]|\\.)*'$/.test(raw)) return raw.slice(1, -1);
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function itemFromSource(
  context: SourceContext,
  sourcePath: string,
  options: {
    id?: string;
    name?: string;
    targetPath?: string | null;
    slices?: string[];
    sourceOracles?: string[];
    targetTests?: string[];
    validationEvidence?: string[];
    notes?: string[];
  } = {},
): InventoryItem {
  const targetPath =
    options.targetPath ?? context.sourceToTarget.get(sourcePath) ?? sourceTargetPath(sourcePath);
  const slices = uniqueSorted(options.slices ?? context.sourceToSlices.get(sourcePath) ?? []);
  const sourceOracles = uniqueSorted(
    options.sourceOracles ?? context.sourceToOracles.get(sourcePath) ?? [],
  );
  const targetTests = targetTestsFor(
    context,
    slices,
    options.targetTests ??
      context.sourceToTargetTests.get(sourcePath) ??
      defaultTargetTestsForSource(sourcePath),
    options.name,
  );
  const targetExists =
    (targetPath !== null && context.targetFiles.paths.has(targetPath)) ||
    targetTests.some((testPath) => context.targetFiles.paths.has(testPath));
  const validation = uniqueSorted(
    options.validationEvidence ?? context.sourceToValidation.get(sourcePath) ?? [],
  );
  return {
    id: options.id ?? sourcePath,
    ...(options.name ? { name: options.name } : {}),
    sourcePath,
    sourceBlobSha1: context.sourceTree.get(sourcePath) ?? "",
    targetPath,
    migrationSlices: slices,
    sourceOracles,
    targetTests,
    validationEvidence: validation,
    status: itemStatus(targetPath, targetExists, slices, targetTests, sourceOracles),
    ...(options.notes ? { notes: options.notes } : {}),
  };
}

function exportItem(
  context: SourceContext,
  entrypoint: string,
  entrypointBlob: string,
  item: ParsedExport,
  exportMap: Map<string, string[]>,
  oracleMap: Map<string, string[]>,
  testMap: Map<string, string[]>,
  validationMap: Map<string, string[]>,
): ExportInventoryItem {
  const targetPath =
    context.sourceToTarget.get(item.sourcePath) ?? sourceTargetPath(item.sourcePath);
  const targetExists = context.targetFiles.paths.has(targetPath);
  const slices = exportMap.get(item.name) ?? [];
  const sourceOracles = oracleMap.get(item.name) ?? [];
  const targetTests = targetTestsFor(context, slices, testMap.get(item.name) ?? [], item.name);
  return {
    id: item.name,
    name: item.name,
    sourcePath: item.sourcePath,
    sourceBlobSha1: context.sourceTree.get(item.sourcePath) ?? "",
    targetPath,
    migrationSlices: slices,
    sourceOracles,
    targetTests,
    validationEvidence: validationMap.get(item.name) ?? [],
    status: itemStatus(targetPath, targetExists, slices, targetTests, sourceOracles),
    publicEntryPath: entrypoint,
    publicEntryBlobSha1: entrypointBlob,
  };
}

function categoryForSource(sourcePath: string): keyof ParityInventory["remainingBacklog"] {
  if (sourcePath.startsWith("src/domain/")) return "domain";
  if (sourcePath.startsWith("src/norms/")) return "norms";
  if (
    sourcePath.startsWith("src/applications/") ||
    sourcePath.startsWith("src/core/") ||
    sourcePath.startsWith("src/config/")
  )
    return "applications";
  return "packageValidation";
}

function addBacklog(
  groups: Record<
    keyof ParityInventory["remainingBacklog"],
    Array<{ id: string; status: InventoryStatus }>
  >,
  category: keyof ParityInventory["remainingBacklog"],
  items: Array<{ id: string; status: InventoryStatus }>,
): void {
  groups[category].push(...items.filter((item) => item.status !== "exact-parity"));
}

function makeBacklogGroup(items: Array<{ id: string; status: InventoryStatus }>): BacklogGroup {
  return { statusCounts: makeStatusCounts(items), itemIds: items.map((item) => item.id).sort() };
}

function sourceFilesByPrefix(items: InventoryItem[], prefix: string): InventoryItem[] {
  return items.filter((item) => item.sourcePath.startsWith(prefix));
}

async function buildSourceExportItems(
  context: SourceContext,
  entrypoint: string,
  exportMap: Map<string, string[]>,
  oracleMap: Map<string, string[]>,
  testMap: Map<string, string[]>,
  validationMap: Map<string, string[]>,
): Promise<ExportInventoryItem[]> {
  const items = await collectModuleExports(context, entrypoint, new Map(), new Set());
  const entrypointBlob = context.sourceTree.get(entrypoint) ?? "";
  return items.map((item) =>
    exportItem(
      context,
      entrypoint,
      entrypointBlob,
      item,
      exportMap,
      oracleMap,
      testMap,
      validationMap,
    ),
  );
}

async function buildPackageExports(
  context: SourceContext,
  targetPackage: TargetPackage,
  sourceRootExports: ExportInventoryItem[],
  sourceApplicationExports: ExportInventoryItem[],
): Promise<PackageExportInventoryItem[]> {
  const targetCache = new Map<string, string[]>();
  const result: PackageExportInventoryItem[] = [];
  for (const [key, rawValue] of Object.entries(context.sourcePackage.exports)) {
    const sourceTarget = packageTargetValue(rawValue);
    const sourceEntryPath = sourceEntryPathForPackageKey(key, sourceTarget);
    const sourceNames =
      key === "."
        ? sourceRootExports.map((item) => item.id)
        : key === "./applications" || key === "./applications/*"
          ? sourceApplicationExports.map((item) => item.id)
          : await collectModuleExports(context, sourceEntryPath, new Map(), new Set()).then(
              (items) => items.map((item) => item.name),
            );
    const targetRawValue = targetPackage.exports[key];
    const targetValue = packageTargetValue(targetRawValue);
    const targetPath = targetSourcePathForPackageValue(targetValue);
    const targetNames =
      targetPath && context.targetFiles.paths.has(targetPath)
        ? await collectTargetModuleExports(context, targetPath, targetCache, new Set())
        : [];
    const sourceNamesSorted = uniqueSorted(
      sourceNames.filter((name): name is string => typeof name === "string"),
    );
    const targetNamesSorted = uniqueSorted(targetNames);
    const status: InventoryStatus =
      targetRawValue === undefined
        ? "missing"
        : targetPath === null || !context.targetFiles.paths.has(targetPath)
          ? "missing"
          : sourceNamesSorted.length === targetNamesSorted.length &&
              sourceNamesSorted.every((name, index) => name === targetNamesSorted[index])
            ? "exact-parity"
            : "partial";
    result.push({
      id: key,
      key,
      sourcePath: "package.json",
      sourceBlobSha1: context.sourceTree.get("package.json") ?? "",
      sourceTarget,
      sourceExportNames: sourceNamesSorted,
      targetPath,
      targetExportNames: targetNamesSorted,
      status,
      ...(key === "./applications/*"
        ? {
            notes: [
              "Wildcard application subpath is resolved to the source applications entrypoint.",
            ],
          }
        : {}),
    });
  }
  return result.sort((left, right) => left.key.localeCompare(right.key));
}

export async function buildParityInventory(
  options: { sourcePath?: string; normativePath?: string } = {},
): Promise<ParityInventory> {
  const sourcePath = path.resolve(
    options.sourcePath ?? process.env.STRUTTURE_JS_BASELINE_PATH ?? defaultSourcePath,
  );
  const normativePath = path.resolve(
    options.normativePath ?? process.env.STRUTTURE_NORMATIVE_PATH ?? defaultNormativePath,
  );
  const { sourcePackage, sourceTree } = await verifyPinnedRepositories(sourcePath, normativePath);
  const phaseA4Scope = await loadPhaseA4Scope();
  const targetFiles = await loadTargetFiles();
  const slices = await loadSlices();
  const maps = buildSliceMaps(slices);
  const context: SourceContext = {
    sourcePath,
    sourceTree,
    sourceTexts: new Map(),
    sourcePackage,
    normativePath,
    targetFiles,
    slices,
    phaseA4Scope,
    ...maps,
  };
  const targetPackage = parseTargetPackage(
    await readJson(path.join(repositoryRoot, "package.json")),
  );
  const rootExports = applyPhaseA4Scope(
    await buildSourceExportItems(
      context,
      "src/index.js",
      maps.exportToSlices,
      maps.exportToOracles,
      maps.exportToTargetTests,
      maps.exportToValidation,
    ),
    (item) => phaseA4Scope.deferredRootExports.includes(item.id),
  );
  const applicationsExports = applyPhaseA4Scope(
    await buildSourceExportItems(
      context,
      "src/applications/index.js",
      maps.exportToSlices,
      maps.exportToOracles,
      maps.exportToTargetTests,
      maps.exportToValidation,
    ),
    (item) => phaseA4Scope.deferredApplicationExports.includes(item.id),
  );

  const sourceFiles = applyPhaseA4Scope(
    [...sourceTree.keys()]
      .filter((filePath) => filePath.startsWith("src/"))
      .sort()
      .map((filePath) => itemFromSource(context, filePath)),
    (item) => phaseA4Scope.deferredSourcePaths.includes(item.sourcePath),
  );
  const sourceTests = [...sourceTree.keys()]
    .filter((filePath) => filePath.startsWith("tests/"))
    .sort()
    .map((filePath) => ({
      ...itemFromSource(context, filePath),
      testKind: sourceTestKind(filePath),
    }));
  const validationFiles = [...sourceTree.keys()]
    .filter((filePath) => filePath.startsWith("validation/"))
    .sort()
    .map((filePath) => itemFromSource(context, filePath));
  const examples = [...sourceTree.keys()]
    .filter((filePath) => filePath.startsWith("examples/"))
    .sort()
    .map((filePath) => itemFromSource(context, filePath));
  const benchmarkPaths = [...sourceTree.keys()]
    .filter((filePath) => filePath.startsWith("scripts/") && filePath.includes("benchmark-"))
    .sort();
  const benchmarks = benchmarkPaths.map((filePath) => itemFromSource(context, filePath));
  const browserGates = ["scripts/check-web-worker-bundle.js"]
    .filter((filePath) => sourceTree.has(filePath))
    .map((filePath) =>
      itemFromSource(context, filePath, {
        id: "browser-esm-bundle",
        name: "Browser ESM bundle gate",
        targetPath: "scripts/check-worker-bundle.ts",
        notes: [
          "The source gate uses an esbuild browser platform bundle; it is also the Web Worker gate input.",
        ],
      }),
    );
  const webWorkerGates = ["scripts/check-web-worker-bundle.js"]
    .filter((filePath) => sourceTree.has(filePath))
    .map((filePath) =>
      itemFromSource(context, filePath, {
        id: "web-worker-bundle",
        name: "Web Worker bundle and smoke gate",
        targetPath: "scripts/check-worker-bundle.ts",
        targetTests: ["tests/fixtures/globalFemBuildingFixture.ts"],
        notes: ["The source fixture is tests/fixtures/strutture-js-web-worker-entry.js."],
      }),
    );

  const catalogPath = "src/config/applicationCatalog.js";
  const catalogText = await loadSourceText(context, catalogPath);
  const catalog = parseCatalog(catalogText);
  const catalogTargetFile = "src/config/applicationCatalog.ts";
  const applicationCatalogEntries: ApplicationCatalogInventoryItem[] = catalog.map((entry) => {
    const item = itemFromSource(context, catalogPath, {
      id: entry.id,
      name: entry.name,
      targetPath: catalogTargetFile,
      targetTests: [],
      notes: [
        "Catalog maturity is copied from the pinned source; no TypeScript catalog is currently present.",
      ],
    });
    return {
      ...item,
      domain: entry.domain,
      maturity: entry.maturity,
      ...(entry.primaryFocus ? { primaryFocus: entry.primaryFocus } : {}),
    };
  });

  const registryPath = "src/applications/index.js";
  const registryText = await loadSourceText(context, registryPath);
  const registryEntries = parseRegistryEntries(registryText, catalog);
  const applicationRegistryEntries: RegistryInventoryItem[] = applyPhaseA4Scope(
    registryEntries.map((entry) => {
      const item = itemFromSource(context, registryPath, {
        id: entry.applicationId,
        name: entry.applicationClass,
        targetPath: "src/applications/index.ts",
        targetTests: [],
        notes: ["Default registry construction is not present in the current TypeScript target."],
      });
      const targetApplicationExists = [...targetFiles.paths].some((filePath) =>
        filePath.startsWith(`${entry.targetApplicationPath}/`),
      );
      const status: InventoryStatus = targetApplicationExists ? "partial" : "missing";
      return {
        ...item,
        status,
        applicationId: entry.applicationId,
        applicationClass: entry.applicationClass,
        targetApplicationPath: entry.targetApplicationPath,
        maturity: entry.maturity,
      };
    }),
    (item) => phaseA4Scope.deferredRegistryApplicationIds.includes(item.applicationId),
  );

  const schemaNames = uniqueSorted(
    rootExports
      .map((item) => item.id)
      .filter((name) => /(?:SCHEMA|VERSION|STATE_VERSION|CONTRACT_VERSION)/i.test(name)),
  );
  const serializedSchemas: SerializedSchemaInventoryItem[] = [];
  for (const name of schemaNames) {
    const sourceExport = rootExports.find((item) => item.name === name);
    if (!sourceExport) continue;
    const sourceText = await loadSourceText(context, sourceExport.sourcePath);
    const targetPath =
      context.sourceToTarget.get(sourceExport.sourcePath) ??
      sourceTargetPath(sourceExport.sourcePath);
    const targetExists = context.targetFiles.paths.has(targetPath);
    const targetTests = targetTestsFor(
      context,
      sourceExport.migrationSlices,
      sourceExport.targetTests,
      name,
    );
    serializedSchemas.push({
      ...sourceExport,
      targetPath,
      status: itemStatus(
        targetPath,
        targetExists,
        sourceExport.migrationSlices,
        targetTests,
        sourceExport.sourceOracles,
      ),
      value: sourceLiteralValue(sourceText, name),
    });
  }

  const validationCampaigns = [] as ValidationCampaignInventoryItem[];
  for (const filePath of [...sourceTree.keys()]
    .filter((item) => item.startsWith("validation/") && item.endsWith("ValidationCampaign.js"))
    .sort()) {
    const text = await loadSourceText(context, filePath);
    const targetPath = sourceTargetPath(filePath);
    const sourceTestPath = `tests/${path.posix.basename(filePath, ".js")}.test.js`;
    const mappedSourceTest = sourceTree.has(sourceTestPath) ? sourceTestPath : null;
    const targetTests = mappedSourceTest
      ? (context.sourceToTargetTests.get(mappedSourceTest) ?? [])
      : [];
    const item = itemFromSource(context, filePath, {
      targetPath,
      targetTests,
      notes: ["Validation campaign code is not part of the current TypeScript target."],
    });
    validationCampaigns.push({
      ...item,
      campaignId: campaignId(text),
      exportedFunctions: exportedFunctions(text),
    });
  }

  const packageExports = await buildPackageExports(
    context,
    targetPackage,
    rootExports,
    applicationsExports,
  );

  const groups: Record<
    keyof ParityInventory["remainingBacklog"],
    Array<{ id: string; status: InventoryStatus }>
  > = {
    domain: [],
    norms: [],
    applications: [],
    packageValidation: [],
  };
  addBacklog(
    groups,
    "domain",
    sourceFilesByPrefix(sourceFiles, "src/domain/").map((item) => ({
      id: `source:${item.id}`,
      status: item.status,
    })),
  );
  addBacklog(
    groups,
    "domain",
    rootExports
      .filter((item) => categoryForSource(item.sourcePath) === "domain")
      .map((item) => ({ id: `root-export:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "norms",
    sourceFilesByPrefix(sourceFiles, "src/norms/").map((item) => ({
      id: `source:${item.id}`,
      status: item.status,
    })),
  );
  addBacklog(
    groups,
    "norms",
    rootExports
      .filter((item) => categoryForSource(item.sourcePath) === "norms")
      .map((item) => ({ id: `root-export:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "applications",
    sourceFiles
      .filter((item) => categoryForSource(item.sourcePath) === "applications")
      .map((item) => ({ id: `source:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "applications",
    rootExports
      .filter((item) => categoryForSource(item.sourcePath) === "applications")
      .map((item) => ({ id: `root-export:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "applications",
    applicationsExports.map((item) => ({
      id: `application-export:${item.id}`,
      status: item.status,
    })),
  );
  addBacklog(
    groups,
    "applications",
    applicationRegistryEntries.map((item) => ({ id: `registry:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "applications",
    applicationCatalogEntries.map((item) => ({ id: `catalog:${item.id}`, status: item.status })),
  );
  addBacklog(
    groups,
    "packageValidation",
    packageExports.map((item) => ({ id: `package:${item.key}`, status: item.status })),
  );
  addBacklog(
    groups,
    "packageValidation",
    [
      ...sourceTests,
      ...validationFiles,
      ...validationCampaigns,
      ...examples,
      ...benchmarks,
      ...browserGates,
      ...webWorkerGates,
    ].map((item) => ({
      id: `${item.sourcePath.startsWith("tests/") ? "test" : "artifact"}:${item.id}`,
      status: item.status,
    })),
  );

  const targetRootNames = targetFiles.paths.has("src/index.ts")
    ? await collectTargetModuleExports(context, "src/index.ts", new Map(), new Set())
    : [];
  const targetApplicationNames = targetRootNames.filter((name) =>
    applicationsExports.some((item) => item.id === name),
  );
  const targetSourceFileCount = [...targetFiles.paths].filter(
    (filePath) => filePath.startsWith("src/") && filePath.endsWith(".ts"),
  ).length;
  const targetTestCount = [...targetFiles.paths].filter(
    (filePath) => filePath.startsWith("tests/") && filePath.endsWith(".test.ts"),
  ).length;
  const counts: InventoryCounts = {
    rootExports: { javascript: rootExports.length, typescript: targetRootNames.length },
    applicationsExports: {
      javascript: applicationsExports.length,
      typescript: uniqueSorted(targetApplicationNames).length,
    },
    packageEntryPoints: {
      javascript: packageExports.length,
      typescript: Object.keys(targetPackage.exports).length,
    },
    applicationRegistryEntries: {
      javascript: applicationRegistryEntries.length,
      typescript: applicationRegistryEntries.filter((item) => item.status === "exact-parity")
        .length,
    },
    applicationCatalogEntries: {
      javascript: applicationCatalogEntries.length,
      typescript: applicationCatalogEntries.filter((item) => item.status === "exact-parity").length,
    },
    serializedSchemas: {
      javascript: serializedSchemas.length,
      typescript: serializedSchemas.filter((item) => item.status === "exact-parity").length,
    },
    sourceFiles: { javascript: sourceFiles.length, typescript: targetSourceFileCount },
    tests: { javascript: sourceTests.length, typescript: targetTestCount },
    validationCampaigns: {
      javascript: validationCampaigns.length,
      typescript: validationCampaigns.filter((item) => item.status !== "missing").length,
    },
    validationFiles: {
      javascript: validationFiles.length,
      typescript: validationFiles.filter((item) => item.status !== "missing").length,
    },
    examples: {
      javascript: examples.length,
      typescript: examples.filter((item) => item.status !== "missing").length,
    },
    benchmarks: {
      javascript: benchmarks.length,
      typescript: benchmarks.filter((item) => item.status !== "missing").length,
    },
    browserGates: {
      javascript: browserGates.length,
      typescript: browserGates.filter((item) => item.status !== "missing").length,
    },
    webWorkerGates: {
      javascript: webWorkerGates.length,
      typescript: webWorkerGates.filter((item) => item.status !== "missing").length,
    },
  };

  const ambiguities = [
    "The source package exposes ./applications/* as a wildcard; the inventory resolves it to src/applications/index.js and does not expand private application files into package entrypoints.",
    "The source browser gate is implemented by the Web Worker bundle script; no separate browser-only smoke script is present in the pinned source.",
    "An existing TypeScript target file is classified as partial unless a recorded migration slice also supplies source-oracle or target-test evidence; matching filenames are never treated as proof of parity.",
  ];

  return {
    schemaVersion: 1,
    generatedBy: "scripts/generate-parity-inventory.ts",
    source: {
      repositoryPath: sourcePath,
      revision: SOURCE_REVISION,
      packageName: sourcePackage.name,
      packageVersion: sourcePackage.version,
      license: sourcePackage.license,
      worktree: "clean",
    },
    normativeCorpus: {
      repositoryPath: normativePath,
      revision: NORMATIVE_REVISION,
      worktree: "clean",
    },
    packageExports,
    rootExports,
    applicationsExports,
    applicationRegistryEntries,
    applicationCatalogEntries,
    serializedSchemas,
    sourceFiles,
    tests: sourceTests,
    validationFiles,
    validationCampaigns,
    examples,
    benchmarks,
    browserGates,
    webWorkerGates,
    validationEvidence: maps.validationEvidence,
    phaseA4Scope,
    counts,
    remainingBacklog: {
      domain: makeBacklogGroup(groups.domain),
      norms: makeBacklogGroup(groups.norms),
      applications: makeBacklogGroup(groups.applications),
      packageValidation: makeBacklogGroup(groups.packageValidation),
    },
    ambiguities,
  };
}

export async function writeParityInventory(
  inventory: ParityInventory,
  inventoryPath = path.join(repositoryRoot, "migration", "parity-inventory.json"),
): Promise<void> {
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
}

export function renderParitySummary(inventory: ParityInventory): string {
  const countRows: Array<[string, number, number]> = [
    [
      "Root exports",
      inventory.counts.rootExports.javascript,
      inventory.counts.rootExports.typescript,
    ],
    [
      "Applications exports",
      inventory.counts.applicationsExports.javascript,
      inventory.counts.applicationsExports.typescript,
    ],
    [
      "Package entry points",
      inventory.counts.packageEntryPoints.javascript,
      inventory.counts.packageEntryPoints.typescript,
    ],
    [
      "ApplicationRegistry entries",
      inventory.counts.applicationRegistryEntries.javascript,
      inventory.counts.applicationRegistryEntries.typescript,
    ],
    [
      "Application catalog entries",
      inventory.counts.applicationCatalogEntries.javascript,
      inventory.counts.applicationCatalogEntries.typescript,
    ],
    [
      "Serialized schema/version symbols",
      inventory.counts.serializedSchemas.javascript,
      inventory.counts.serializedSchemas.typescript,
    ],
    [
      "Source files",
      inventory.counts.sourceFiles.javascript,
      inventory.counts.sourceFiles.typescript,
    ],
    ["Tests", inventory.counts.tests.javascript, inventory.counts.tests.typescript],
    [
      "Validation campaigns",
      inventory.counts.validationCampaigns.javascript,
      inventory.counts.validationCampaigns.typescript,
    ],
    [
      "Validation files",
      inventory.counts.validationFiles.javascript,
      inventory.counts.validationFiles.typescript,
    ],
    ["Examples", inventory.counts.examples.javascript, inventory.counts.examples.typescript],
    ["Benchmarks", inventory.counts.benchmarks.javascript, inventory.counts.benchmarks.typescript],
    [
      "Browser gates",
      inventory.counts.browserGates.javascript,
      inventory.counts.browserGates.typescript,
    ],
    [
      "Web Worker gates",
      inventory.counts.webWorkerGates.javascript,
      inventory.counts.webWorkerGates.typescript,
    ],
  ];
  const lines = [
    "# Phase A1 parity inventory",
    "",
    "This is a generated, source-pinned inventory. It is not a claim that matching filenames or exports establish behavioral parity.",
    "",
    `- JavaScript baseline: ${inventory.source.packageName} ${inventory.source.packageVersion} at \`${inventory.source.revision}\` (clean worktree).`,
    `- Normative corpus: \`${inventory.normativeCorpus.revision}\` (clean worktree, development-only reference).`,
    `- Drift check: \`npm run check:parity-inventory\`.`,
    `- Machine-readable inventory: [migration/parity-inventory.json](../migration/parity-inventory.json).`,
    "",
    "## Surface counts",
    "",
    "| Surface | Pinned JavaScript | Current TypeScript |",
    "| --- | ---: | ---: |",
    ...countRows.map(
      ([name, javascript, typescript]) => `| ${name} | ${javascript} | ${typescript} |`,
    ),
    "",
    "## Dependency-ordered remaining backlog",
    "",
    "The JSON inventory contains the exact item IDs for every non-exact item. The groups below are the implementation order required by the repository architecture.",
    "",
  ];
  for (const [name, group] of Object.entries(inventory.remainingBacklog)) {
    const counts = Object.entries(group.statusCounts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");
    lines.push(`- **${name}** — ${counts || "no remaining items"}.`);
  }
  lines.push(
    "",
    "## Status semantics",
    "",
    "- `exact-parity`: the target item exists and an existing migration slice/oracle or target test provides recorded evidence.",
    "- `partial`: a target exists but the inventory has not established complete source behavior.",
    "- `missing`: no target item was found at the planned TypeScript path.",
    "- `deferred`: the item is explicitly outside the revised Phase A4 scope and remains untranslated for a later phase.",
    "- `intentionally-excluded`: the source item is outside the target library boundary and has a recorded reason.",
    "- `decision-required`: a maintainer decision is needed before mapping can be finalized.",
    "",
    "## Auditable ambiguities",
    "",
    ...inventory.ambiguities.map((ambiguity) => `- ${ambiguity}`),
    "",
  );
  return `${lines.join("\n")}\n`;
}

export async function writeParitySummary(
  inventory: ParityInventory,
  summaryPath = path.join(repositoryRoot, "docs", "parity-inventory.md"),
): Promise<void> {
  await writeFile(summaryPath, renderParitySummary(inventory), "utf8");
}

export function defaultPaths(): { inventoryPath: string; summaryPath: string } {
  return {
    inventoryPath: path.join(repositoryRoot, "migration", "parity-inventory.json"),
    summaryPath: path.join(repositoryRoot, "docs", "parity-inventory.md"),
  };
}
