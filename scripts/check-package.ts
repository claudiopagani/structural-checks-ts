import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const officialLgpl21Sha256 = "20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95";
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as {
  name: string;
  version: string;
  private: boolean;
  license: string;
  dependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
};
const lock = JSON.parse(await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8")) as {
  name: string;
  version: string;
  packages?: Record<
    string,
    {
      license?: string;
      name?: string;
      version?: string;
    }
  >;
};

assert.equal(packageJson.name, "structural-checks-ts-migration-workspace");
assert.equal(packageJson.version, "0.0.0");
assert.equal(packageJson.private, true, "Publication guard must remain enabled.");
assert.equal(packageJson.license, "LGPL-2.1-or-later");
assert.ok(packageJson.exports?.["."], "The package root export is required.");
assert.ok(
  packageJson.exports?.["./domain/math"],
  "The public domain/math subpath export is required.",
);
assert.deepEqual(
  packageJson.dependencies,
  undefined,
  "The foundation slice needs no runtime deps.",
);
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
assert.ok(notice.includes(sourceRevision));
assert.ok(notice.includes("strutture-js"));

const npmCliPath = process.env.npm_execpath;
assert.ok(npmCliPath !== undefined, "npm_execpath is required for the package check.");
const { stdout } = await execFileAsync(
  process.execPath,
  [npmCliPath, "pack", "--dry-run", "--json", "--ignore-scripts"],
  {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  },
);
const packResult = JSON.parse(stdout) as {
  files: { path: string }[];
}[];
const packedFiles = new Set((packResult[0]?.files ?? []).map((file) => file.path));

for (const expectedPath of [
  "LICENSE",
  "NOTICE",
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/domain/math/index.d.ts",
  "dist/domain/math/index.js",
  "docs/licensing.md",
  "migration/baseline.json",
  "scripts/build.ts",
  "src/index.ts",
  "src/domain/math/index.ts",
  "tsconfig.build.json",
]) {
  assert.ok(packedFiles.has(expectedPath), `Package is missing ${expectedPath}.`);
}

for (const packedPath of packedFiles) {
  assert.doesNotMatch(packedPath, /(?:^|\/)(?:corpus|viewer)(?:\/|$)/u);
}

console.log(
  `Package check passed (${packageJson.name}@${packageJson.version}, ` +
    `${packedFiles.size} packed files, publication disabled).`,
);
