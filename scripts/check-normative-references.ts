import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const defaultCorpusPath = path.resolve(repositoryRoot, "..", "strutture-normative");

interface NormativeReferenceRecord {
  citation: string;
  unitId: string | null;
  assetIds: string[];
  resolutionStatus: "outside-corpus" | "resolved";
}

interface NormativeManifest {
  references: NormativeReferenceRecord[];
  outsideCorpusReferences: NormativeReferenceRecord[];
}

function parseCorpusPath(argv: string[]): string {
  let corpusPath = process.env.STRUTTURE_NORMATIVE_PATH
    ? path.resolve(process.env.STRUTTURE_NORMATIVE_PATH)
    : defaultCorpusPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--corpus") {
      throw new Error(`Unsupported argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error("--corpus requires a directory path.");
    }
    corpusPath = path.resolve(value);
    index += 1;
  }

  return corpusPath;
}

async function collectJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

async function git(corpusPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", corpusPath, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

const corpusPath = parseCorpusPath(process.argv.slice(2));
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "migration", "normative-references.json"), "utf8"),
) as NormativeManifest;
const unitsRoot = path.join(corpusPath, "corpus", "units");
const assetsRoot = path.join(corpusPath, "corpus", "assets");
const errors: string[] = [];

if (!(await isDirectory(unitsRoot)) || !(await isDirectory(assetsRoot))) {
  throw new Error(`No canonical strutture-normative corpus found at ${corpusPath}.`);
}

const revision = await git(corpusPath, ["rev-parse", "HEAD"]);
const status = await git(corpusPath, ["status", "--porcelain", "--", "corpus", "schemas"]);
if (status.length > 0) {
  errors.push("The selected canonical corpus or its schemas have uncommitted changes.");
}

const units = new Set<string>();
for (const filePath of await collectJsonFiles(unitsRoot)) {
  const record = JSON.parse(await readFile(filePath, "utf8")) as {
    id?: string;
    recordType?: string;
  };
  if (record.recordType !== "canonical-unit" || record.id === undefined) {
    continue;
  }
  if (units.has(record.id)) {
    errors.push(`Duplicate canonical unit id: ${record.id}.`);
  }
  units.add(record.id);
}

const assets = new Map<string, { unitId: string }>();
for (const filePath of await collectJsonFiles(assetsRoot)) {
  const record = JSON.parse(await readFile(filePath, "utf8")) as Record<
    string,
    { id?: string; unitId?: string }[] | undefined
  >;
  for (const assetType of ["formulas", "tables", "figures"]) {
    for (const asset of record[assetType] ?? []) {
      if (asset.id === undefined || asset.unitId === undefined) {
        continue;
      }
      if (assets.has(asset.id)) {
        errors.push(`Duplicate canonical asset id: ${asset.id}.`);
      }
      assets.set(asset.id, { unitId: asset.unitId });
    }
  }
}

const references = [...manifest.references, ...manifest.outsideCorpusReferences];
for (const reference of references) {
  if (reference.resolutionStatus === "outside-corpus") {
    if (reference.unitId !== null || reference.assetIds.length > 0) {
      errors.push(`${reference.citation} is outside the corpus but claims canonical identifiers.`);
    }
    continue;
  }

  if (reference.unitId === null || !units.has(reference.unitId)) {
    errors.push(`Unknown canonical unit id: ${String(reference.unitId)}.`);
    continue;
  }

  for (const assetId of reference.assetIds) {
    const asset = assets.get(assetId);
    if (asset === undefined) {
      errors.push(`Unknown canonical asset id: ${assetId}.`);
    } else if (asset.unitId !== reference.unitId) {
      errors.push(`${assetId} belongs to ${asset.unitId}, not ${reference.unitId}.`);
    }
  }
}

for (const forbiddenDirectory of [
  path.join(repositoryRoot, "corpus"),
  path.join(repositoryRoot, "src", "corpus"),
  path.join(repositoryRoot, "viewer"),
]) {
  if (await isDirectory(forbiddenDirectory)) {
    errors.push(`Runtime repository contains forbidden corpus material: ${forbiddenDirectory}.`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Normative reference error: ${error}`);
  }
  process.exitCode = 1;
} else {
  const resolvedCount = references.filter(
    (reference) => reference.resolutionStatus === "resolved",
  ).length;
  const outsideCount = references.length - resolvedCount;
  console.log(
    `Normative reference check passed (${resolvedCount} resolved references, ` +
      `${outsideCount} outside-corpus references, ${units.size} canonical units, ` +
      `${assets.size} assets, revision ${revision}).`,
  );
}
