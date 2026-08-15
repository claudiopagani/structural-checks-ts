import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Provenance check for the frozen migration evidence.
 *
 * The repository no longer depends on a live checkout of the previous JavaScript implementation:
 * that link is severed by design. This check validates the recorded evidence itself: the baseline
 * manifest, every migration slice manifest, the recorded source revision consistency, and the
 * existence of every migrated target file. Git blob verification against the historical checkout
 * is intentionally not performed.
 */

const repositoryRoot = path.resolve(import.meta.dirname, "..");

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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceFileRecord(value: unknown): value is SourceFileRecord {
    return (
        isRecord(value) &&
        typeof value.path === "string" &&
        value.path.length > 0 &&
        typeof value.gitBlobSha1 === "string" &&
        value.gitBlobSha1.length > 0 &&
        (value.targetPath === undefined || typeof value.targetPath === "string")
    );
}

function parseSlice(value: unknown): SliceManifest | null {
    if (!isRecord(value) || typeof value.sliceId !== "string" || !isRecord(value.source)) {
        return null;
    }
    if (
        typeof value.source.revision !== "string" ||
        !Array.isArray(value.sourceFiles) ||
        !Array.isArray(value.sourceOracles) ||
        !isSourceFileRecord(value.sourcePublicExport)
    ) {
        return null;
    }
    return {
        sliceId: value.sliceId,
        source: { revision: value.source.revision },
        sourceFiles: value.sourceFiles.filter(isSourceFileRecord),
        sourceOracles: value.sourceOracles.filter(isSourceFileRecord),
        sourcePublicExport: value.sourcePublicExport,
    };
}

async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

const baseline = (await readJson(
    path.join(repositoryRoot, "migration", "baseline.json"),
)) as Partial<BaselineManifest> | null;
const errors: string[] = [];

if (
    baseline === null ||
    baseline === undefined ||
    !isRecord(baseline.source) ||
    typeof baseline.source.revision !== "string" ||
    baseline.source.revision.length === 0 ||
    typeof baseline.source.packageName !== "string" ||
    typeof baseline.source.packageVersion !== "string" ||
    typeof baseline.source.license !== "string"
) {
    errors.push("migration/baseline.json does not record a complete source manifest.");
}

const recordedRevision =
    baseline !== null &&
        baseline !== undefined &&
        isRecord(baseline.source) &&
        typeof baseline.source.revision === "string"
        ? baseline.source.revision
        : "";

const slicesDirectory = path.join(repositoryRoot, "migration", "slices");
const sliceFileNames = (await readdir(slicesDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
const slices: SliceManifest[] = [];
const sliceIds = new Set<string>();
for (const fileName of sliceFileNames) {
    const parsed = parseSlice(await readJson(path.join(slicesDirectory, fileName)));
    if (parsed === null) {
        errors.push(`migration/slices/${fileName} is not a valid slice manifest.`);
        continue;
    }
    if (sliceIds.has(parsed.sliceId)) {
        errors.push(`${parsed.sliceId}: duplicate slice id.`);
    }
    sliceIds.add(parsed.sliceId);
    slices.push(parsed);
}

let recordCount = 0;
for (const slice of slices) {
    if (recordedRevision.length > 0 && slice.source.revision !== recordedRevision) {
        errors.push(
            `${slice.sliceId}: recorded revision ${slice.source.revision} differs from baseline revision ${recordedRevision}.`,
        );
    }
    const records = [...slice.sourceFiles, ...slice.sourceOracles, slice.sourcePublicExport];
    recordCount += records.length;
    for (const record of records) {
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
        `Provenance check passed (${slices.length} slices, ${recordCount} recorded source artifacts at recorded revision ${recordedRevision}; live source verification is severed by design).`,
    );
}
