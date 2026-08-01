import { execFile } from "node:child_process";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const defaultSourcePath = path.resolve(repositoryRoot, "..", "strutture-js");

interface SourceFileRecord {
  path: string;
  gitBlobSha1: string;
  targetPath?: string;
}

interface SliceManifest {
  sliceId: string;
  source: {
    revision: string;
  };
  sourceFiles: SourceFileRecord[];
  sourceOracles: SourceFileRecord[];
  sourcePublicExport: SourceFileRecord;
}

interface BaselineManifest {
  source: {
    revision: string;
    packageName: string;
    packageVersion: string;
    license: string;
  };
}

function parseSourcePath(argv: string[]): string {
  let sourcePath = process.env.STRUTTURE_JS_BASELINE_PATH
    ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
    : defaultSourcePath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--source") {
      throw new Error(`Unsupported argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error("--source requires a directory path.");
    }
    sourcePath = path.resolve(value);
    index += 1;
  }

  return sourcePath;
}

async function git(sourcePath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", sourcePath, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

const sourcePath = parseSourcePath(process.argv.slice(2));
const baseline = JSON.parse(
  await readFile(path.join(repositoryRoot, "migration", "baseline.json"), "utf8"),
) as BaselineManifest;
const slicesDirectory = path.join(repositoryRoot, "migration", "slices");
const sliceFiles = (await readdir(slicesDirectory))
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();
const slices = await Promise.all(
  sliceFiles.map(
    async (fileName) =>
      JSON.parse(await readFile(path.join(slicesDirectory, fileName), "utf8")) as SliceManifest,
  ),
);
const errors: string[] = [];

const revision = await git(sourcePath, ["rev-parse", "HEAD"]);
if (revision !== baseline.source.revision) {
  errors.push(
    `Source revision ${revision} differs from recorded revision ${baseline.source.revision}.`,
  );
}
for (const slice of slices) {
  if (revision !== slice.source.revision) {
    errors.push(
      `Source revision ${revision} differs from ${slice.sliceId} revision ${slice.source.revision}.`,
    );
  }
}

const status = await git(sourcePath, ["status", "--porcelain"]);
if (status.length > 0) {
  errors.push("The strutture-js baseline worktree is dirty.");
}

const sourcePackage = JSON.parse(
  await readFile(path.join(sourcePath, "package.json"), "utf8"),
) as Record<string, unknown>;
for (const [field, expected] of [
  ["name", baseline.source.packageName],
  ["version", baseline.source.packageVersion],
  ["license", baseline.source.license],
] as const) {
  if (sourcePackage[field] !== expected) {
    errors.push(
      `Source package ${field} is ${String(sourcePackage[field])}, expected ${expected}.`,
    );
  }
}

let recordCount = 0;
for (const slice of slices) {
  const records = [...slice.sourceFiles, ...slice.sourceOracles, slice.sourcePublicExport];
  recordCount += records.length;

  for (const record of records) {
    const blob = await git(sourcePath, ["rev-parse", `${slice.source.revision}:${record.path}`]);
    if (blob !== record.gitBlobSha1) {
      errors.push(
        `${slice.sliceId}: ${record.path} has blob ${blob}, expected ${record.gitBlobSha1}.`,
      );
    }

    if (record.targetPath !== undefined) {
      try {
        await access(path.join(repositoryRoot, record.targetPath));
      } catch {
        errors.push(`${slice.sliceId}: migrated target is missing: ${record.targetPath}.`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Provenance error: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Provenance check passed (${slices.length} slices, ${recordCount} source artifacts at ${revision}).`,
  );
}
