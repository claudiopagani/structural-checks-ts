import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(repositoryRoot, "src");
const importPattern = /\b(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu;
const forbiddenSolverPattern = /\b(?:NextFEM|OOFEM)\b/gu;

/**
 * `pathCriteria.ts` is a mapping layer: it must copy the mechanical checks published by the
 * domain layer and must never re-derive a mechanical formula. These patterns target the exact
 * duplication the layer is forbidden to contain (Coulomb capacity, compression utilization, and
 * strength-based reconstruction).
 */
const pathCriteriaPath = path.join(sourceRoot, "applications", "masonry-arches", "pathCriteria.ts");
const forbiddenPathCriteriaPatterns: readonly {
  readonly name: string;
  readonly pattern: RegExp;
}[] = [
  { name: "cohesion-times", pattern: /\bcohesion\s*\*/u },
  { name: "friction-coefficient-times", pattern: /\bfrictionCoefficient\s*\*/u },
  { name: "demand-over-capacity", pattern: /\bdemand\s*\/\s*capacity\b/u },
  { name: "compressive-strength-reference", pattern: /\bcompressiveStrength\b/u },
];

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

const pathCriteriaSource = await readFile(pathCriteriaPath, "utf8");
for (const guard of forbiddenPathCriteriaPatterns) {
  if (guard.pattern.test(pathCriteriaSource)) {
    errors.push(
      `${path.relative(repositoryRoot, pathCriteriaPath)} must not contain a mechanical ` +
        `formula (guard ${guard.name}); path criteria copy domain-produced checks.`,
    );
  }
}

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
