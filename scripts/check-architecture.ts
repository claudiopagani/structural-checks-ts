import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(repositoryRoot, "src");
const importPattern = /\b(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu;
const forbiddenSolverPattern = /\b(?:NextFEM|OOFEM)\b/gu;

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

function sourceLayer(filePath: string): "applications" | "core" | "domain" | "norms" | "root" {
  const relativePath = path.relative(sourceRoot, filePath);
  const [firstSegment] = relativePath.split(path.sep);

  if (
    firstSegment === "applications" ||
    firstSegment === "core" ||
    firstSegment === "domain" ||
    firstSegment === "norms"
  ) {
    return firstSegment;
  }

  return "root";
}

function importedLayer(filePath: string, specifier: string): ReturnType<typeof sourceLayer> | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const resolvedPath = path.resolve(path.dirname(filePath), specifier.replace(/\.js$/u, ".ts"));
  if (!resolvedPath.startsWith(`${sourceRoot}${path.sep}`) && resolvedPath !== sourceRoot) {
    return null;
  }

  return sourceLayer(resolvedPath);
}

const files = await collectTypeScriptFiles(sourceRoot);
const errors: string[] = [];
let relativeDependencyCount = 0;

for (const filePath of files) {
  const source = await readFile(filePath, "utf8");
  const relativePath = path.relative(repositoryRoot, filePath).replaceAll(path.sep, "/");
  const layer = sourceLayer(filePath);

  if (forbiddenSolverPattern.test(source)) {
    errors.push(`${relativePath} contains a solver-specific NextFEM or OOFEM identifier.`);
  }
  forbiddenSolverPattern.lastIndex = 0;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier === undefined || !specifier.startsWith(".")) {
      continue;
    }

    relativeDependencyCount += 1;
    const dependencyLayer = importedLayer(filePath, specifier);

    if (layer === "domain" && (dependencyLayer === "norms" || dependencyLayer === "applications")) {
      errors.push(`${relativePath} violates domain independence by importing ${specifier}.`);
    }

    if (layer === "norms" && dependencyLayer === "applications") {
      errors.push(`${relativePath} violates norms independence by importing ${specifier}.`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`Architecture error: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Architecture check passed (${files.length} source files, ` +
      `${relativeDependencyCount} guarded relative dependencies).`,
  );
}
