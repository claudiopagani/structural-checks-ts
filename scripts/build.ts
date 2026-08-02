import { execFile } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.resolve(repositoryRoot, "dist");

if (path.dirname(outputDirectory) !== repositoryRoot || path.basename(outputDirectory) !== "dist") {
  throw new Error(`Refusing to clean unexpected build directory: ${outputDirectory}`);
}

await rm(outputDirectory, { force: true, recursive: true });

const tscPath = require.resolve("typescript/bin/tsc");
const { stderr, stdout } = await execFileAsync(
  process.execPath,
  [tscPath, "-p", path.join(repositoryRoot, "tsconfig.build.json")],
  {
    cwd: repositoryRoot,
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (stdout.trim().length > 0) {
  process.stdout.write(stdout);
}
if (stderr.trim().length > 0) {
  process.stderr.write(stderr);
}

const dataDirectory = path.join(repositoryRoot, "src", "data");
const outputDataDirectory = path.join(outputDirectory, "data");
await mkdir(outputDataDirectory, { recursive: true });
await copyFile(
  path.join(dataDirectory, "section_database.json"),
  path.join(outputDataDirectory, "section_database.json"),
);

console.log("Built ESM JavaScript, source maps, and TypeScript declarations in dist/.");
