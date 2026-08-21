import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const officialLgpl21Sha256 = "20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95";

interface ExportConditions {
  types?: string;
  import?: string;
  default?: string;
}

interface PackageManifest {
  name: string;
  version: string;
  private?: boolean;
  license: string;
  repository?: { type?: string; url?: string };
  homepage?: string;
  bugs?: { url?: string };
  publishConfig?: { access?: string };
  dependencies?: Record<string, string>;
  exports?: Record<string, string | ExportConditions>;
}

const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as PackageManifest;
const lock = JSON.parse(await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8")) as {
  name: string;
  version: string;
  packages?: Record<string, { license?: string; name?: string; version?: string }>;
};

assert.equal(packageJson.name, "structural-checks-ts");
assert.equal(packageJson.version, "0.2.0");
assert.equal(packageJson.private, undefined, "The release package must not be private.");
assert.equal(packageJson.license, "LGPL-2.1-or-later");
assert.deepEqual(packageJson.repository, {
  type: "git",
  url: "git+https://github.com/claudiopagani/structural-checks-ts.git",
});
assert.equal(packageJson.homepage, "https://github.com/claudiopagani/structural-checks-ts#readme");
assert.equal(packageJson.bugs?.url, "https://github.com/claudiopagani/structural-checks-ts/issues");
assert.deepEqual(packageJson.publishConfig, { access: "public" });
assert.ok(packageJson.exports?.["."], "The package root export is required.");
assert.ok(packageJson.exports?.["./applications/*"], "Application wildcard exports are required.");
assert.ok(packageJson.exports?.["./domain/math"], "The domain/math subpath is required.");
assert.equal(packageJson.dependencies, undefined, "The package must have no runtime dependencies.");
assert.equal(lock.name, packageJson.name);
assert.equal(lock.version, packageJson.version);
assert.equal(lock.packages?.[""]?.name, packageJson.name);
assert.equal(lock.packages?.[""]?.version, packageJson.version);
assert.equal(lock.packages?.[""]?.license, packageJson.license);

const license = (await readFile(path.join(repositoryRoot, "LICENSE"), "utf8")).replaceAll(
  "\r\n",
  "\n",
);
assert.equal(
  createHash("sha256").update(license).digest("hex"),
  officialLgpl21Sha256,
  "LICENSE is not the unmodified GNU LGPL 2.1 text.",
);

const notice = await readFile(path.join(repositoryRoot, "NOTICE"), "utf8");
assert.ok(notice.includes("Copyright (C) 2026 Claudio Pagani"));
const baseline = JSON.parse(
  await readFile(path.join(repositoryRoot, "migration", "baseline.json"), "utf8"),
) as { source?: { revision?: string } };
const recordedSourceRevision = baseline.source?.revision ?? "";
assert.ok(recordedSourceRevision.length > 0, "The frozen migration baseline needs a revision.");
assert.ok(notice.includes(recordedSourceRevision), "NOTICE must record the migration revision.");

const npmCliPath = process.env.npm_execpath;
assert.ok(npmCliPath !== undefined, "npm_execpath is required for the package check.");
const { stdout } = await execFileAsync(
  process.execPath,
  [npmCliPath, "pack", "--dry-run", "--json"],
  {
    cwd: repositoryRoot,
    maxBuffer: 32 * 1024 * 1024,
  },
);
const jsonStart = stdout.indexOf("[");
assert.ok(jsonStart >= 0, "npm pack did not return JSON output.");
const packResult = JSON.parse(stdout.slice(jsonStart)) as Array<{
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  files: Array<{ path: string }>;
}>;
const packed = packResult[0];
assert.ok(packed !== undefined, "npm pack returned no package description.");
assert.equal(packed.name, packageJson.name);
assert.equal(packed.version, packageJson.version);
const packedFiles = new Set(packed.files.map((file) => file.path));

for (const expectedPath of [
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "dist/applications/masonry-arches/index.d.ts",
  "dist/applications/masonry-arches/index.js",
  "dist/domain/math/index.d.ts",
  "dist/domain/math/index.js",
  "docs/licensing.md",
  "package.json",
]) {
  assert.ok(packedFiles.has(expectedPath), `Package is missing ${expectedPath}.`);
}

const allowedRootFiles = new Set([
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "package.json",
]);
for (const packedPath of packedFiles) {
  assert.ok(
    allowedRootFiles.has(packedPath) ||
      packedPath.startsWith("dist/") ||
      packedPath === "docs/licensing.md",
    `Unexpected file in the public tarball: ${packedPath}`,
  );
  assert.doesNotMatch(
    packedPath,
    /(?:^|\/)(?:src|tests|scripts|migration|benchmarks|\.github)(?:\/|$)/u,
  );
}

for (const [subpath, conditions] of Object.entries(packageJson.exports ?? {})) {
  if (subpath === "./applications/*") continue;
  const targets =
    typeof conditions === "string"
      ? [conditions]
      : [conditions.types, conditions.import, conditions.default].filter(
          (target): target is string => target !== undefined,
        );
  for (const target of targets) {
    assert.ok(target.startsWith("./dist/"), `${subpath} must resolve through dist: ${target}`);
    assert.ok(packedFiles.has(target.slice(2)), `Export target is absent from tarball: ${target}`);
  }
}

const applicationIndexes = [...packedFiles].filter((packedPath) =>
  /^dist\/applications\/[^/]+\/index\.js$/u.test(packedPath),
);
assert.ok(applicationIndexes.length > 0, "The application wildcard must resolve public modules.");
for (const javascriptPath of applicationIndexes) {
  assert.ok(
    packedFiles.has(javascriptPath.replace(/\.js$/u, ".d.ts")),
    `Wildcard export has no declaration entry: ${javascriptPath}`,
  );
  assert.ok(
    packedFiles.has(`${javascriptPath}.map`),
    `Wildcard export has no JavaScript source map: ${javascriptPath}`,
  );
}

const mapPaths = [...packedFiles].filter((packedPath) => packedPath.endsWith(".map"));
assert.ok(mapPaths.length > 0, "The package must include source maps.");
for (const mapPath of mapPaths) {
  const sourceMap = JSON.parse(await readFile(path.join(repositoryRoot, mapPath), "utf8")) as {
    sources?: string[];
    sourcesContent?: Array<string | null>;
  };
  assert.ok((sourceMap.sources?.length ?? 0) > 0, `${mapPath} contains no sources.`);
  assert.equal(
    sourceMap.sourcesContent?.length,
    sourceMap.sources?.length,
    `${mapPath} must embed every referenced source because src is not shipped separately.`,
  );
  assert.ok(sourceMap.sourcesContent?.every((source) => source !== null));
}

console.log(
  `Package check passed (${packageJson.name}@${packageJson.version}, ${packedFiles.size} files, ` +
    `${packed.size} packed bytes, ${packed.unpackedSize} unpacked bytes).`,
);
