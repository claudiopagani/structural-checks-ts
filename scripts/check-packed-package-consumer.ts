import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as {
  name: string;
  private: boolean;
  version: string;
  exports: Record<string, unknown>;
};

assert.equal(packageJson.private, true);
assert.equal(packageJson.version, "0.0.0");

const npmCliPath =
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

async function runNpm(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(process.execPath, [npmCliPath, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout;
}

function packageImportSpecifiers(applicationDirectories: string[]): string[] {
  const subpaths = Object.keys(packageJson.exports)
    .filter((key) => key !== "./applications/*")
    .map((key) => (key === "." ? packageJson.name : `${packageJson.name}${key.slice(1)}`));
  return [
    ...subpaths,
    ...applicationDirectories.map((directory) => `${packageJson.name}/applications/${directory}`),
  ];
}

const applicationDirectories = (
  await readdir(path.join(repositoryRoot, "src", "applications"), { withFileTypes: true })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const importSpecifiers = packageImportSpecifiers(applicationDirectories);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "structural-checks-ts-pack-"));
const packDirectory = path.join(temporaryRoot, "pack");
const consumerDirectory = path.join(temporaryRoot, "consumer");
const consumerFile = path.join(consumerDirectory, "consumer.mjs");

await mkdir(packDirectory, { recursive: true });
await mkdir(consumerDirectory, { recursive: true });

try {
  const dryRun = JSON.parse(
    await runNpm(["pack", "--dry-run", "--json", "--ignore-scripts"], repositoryRoot),
  ) as Array<{ name: string; version: string; files?: Array<{ path: string }> }>;
  assert.equal(dryRun[0]?.name, packageJson.name);
  assert.equal(dryRun[0]?.version, packageJson.version);
  assert.ok((dryRun[0]?.files ?? []).some((file) => file.path === "dist/index.js"));

  await runNpm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory],
    repositoryRoot,
  );
  const packedFiles = await readdir(packDirectory);
  const tarball = packedFiles.find((file) => file.endsWith(".tgz"));
  assert.ok(tarball, "npm pack did not produce a tarball.");

  await runNpm(["init", "--yes"], consumerDirectory);
  await runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-save",
      path.join(packDirectory, tarball),
    ],
    consumerDirectory,
  );

  const consumerSource = [
    "import assert from 'node:assert/strict';",
    `const specifiers = ${JSON.stringify(importSpecifiers)};`,
    "const modules = await Promise.all(specifiers.map((specifier) => import(specifier)));",
    "assert.equal(modules.length, specifiers.length);",
    "for (const module of modules) assert.ok(Object.keys(module).length > 0);",
  ].join("\n");
  assert.doesNotMatch(consumerSource, /(?:^|[/\\])src(?:[/\\]|$)/);
  await writeFile(consumerFile, consumerSource, "utf8");
  await execFileAsync(process.execPath, [consumerFile], {
    cwd: consumerDirectory,
    encoding: "utf8",
  });

  const installedPackageJson = JSON.parse(
    await readFile(
      path.join(consumerDirectory, "node_modules", packageJson.name, "package.json"),
      "utf8",
    ),
  ) as { exports: Record<string, unknown> };
  for (const value of Object.values(installedPackageJson.exports)) {
    const importTarget =
      typeof value === "string"
        ? value
        : value &&
            typeof value === "object" &&
            typeof (value as Record<string, unknown>).import === "string"
          ? (value as Record<string, string>).import
          : null;
    assert.ok(
      importTarget?.startsWith("./dist/"),
      `packed export must resolve through dist: ${importTarget}`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(
  `Packed consumer check passed (${importSpecifiers.length} package and wildcard imports, publication disabled).`,
);
