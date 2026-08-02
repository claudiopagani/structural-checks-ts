import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const mojibakeLeadCodePoints = new Set([0x00c2, 0x00c3, 0x00ce, 0x00e2]);

interface EncodingHit {
  file: string;
  line: number;
  codePoints: string;
}

const hits: EncodingHit[] = [];

function suspiciousCodePoints(line: string): number[] {
  const codePoints = [...line]
    .map((character) => character.codePointAt(0))
    .filter((codePoint): codePoint is number => codePoint !== undefined);
  const suspicious = new Set<number>();
  for (let index = 0; index < codePoints.length; index += 1) {
    const codePoint = codePoints[index];
    const nextCodePoint = codePoints[index + 1];
    if (codePoint === undefined) continue;
    if (codePoint === 0xfffd) suspicious.add(codePoint);
    if (
      mojibakeLeadCodePoints.has(codePoint) &&
      nextCodePoint !== undefined &&
      ((nextCodePoint >= 0x0080 && nextCodePoint <= 0x00bf) ||
        (nextCodePoint >= 0x2000 && nextCodePoint <= 0x206f))
    ) {
      suspicious.add(codePoint);
      suspicious.add(nextCodePoint);
    }
  }
  return [...suspicious];
}

async function scanDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(absolutePath);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    const lines = (await readFile(absolutePath, "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      const suspicious = suspiciousCodePoints(line);
      if (suspicious.length === 0) return;
      hits.push({
        file: path.relative(repositoryRoot, absolutePath).replaceAll("\\", "/"),
        line: index + 1,
        codePoints: [...new Set(suspicious)]
          .map((codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`)
          .join(", "),
      });
    });
  }
}

await scanDirectory(repositoryRoot);

if (hits.length > 0) {
  const details = hits.map((hit) => `${hit.file}:${hit.line} (${hit.codePoints})`).join("\n");
  throw new Error(`Potential mojibake or replacement characters found:\n${details}`);
}

console.log("Encoding check passed: no suspicious mojibake code points in authored text files.");
