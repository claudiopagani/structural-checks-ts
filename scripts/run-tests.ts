import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const testsRoot = path.join(repositoryRoot, "tests");

type TestSuite = "all" | "canonical" | "legacy-parity";

function parseSuite(arguments_: readonly string[]): TestSuite {
  if (arguments_.length === 0) return "canonical";
  if (arguments_.length !== 2 || arguments_[0] !== "--suite") {
    throw new Error("Usage: run-tests.ts [--suite canonical|legacy-parity|all].");
  }
  const suite = arguments_[1];
  if (suite !== "canonical" && suite !== "legacy-parity" && suite !== "all") {
    throw new Error(`Unsupported test suite: ${String(suite)}.`);
  }
  return suite;
}

function isLegacyParityTest(source: string): boolean {
  return source.includes("strutture-js") || source.includes("STRUTTURE_JS_BASELINE_PATH");
}

const suite = parseSuite(process.argv.slice(2));
const testFiles = (await readdir(testsRoot))
  .filter((fileName) => fileName.endsWith(".test.ts"))
  .sort((a, b) => a.localeCompare(b));
const classified = await Promise.all(
  testFiles.map(async (fileName) => ({
    fileName,
    legacyParity: isLegacyParityTest(await readFile(path.join(testsRoot, fileName), "utf8")),
  })),
);
const selected = classified.filter((item) => {
  if (suite === "all") return true;
  return suite === "legacy-parity" ? item.legacyParity : !item.legacyParity;
});

if (selected.length === 0) {
  throw new Error(`No tests selected for suite ${suite}.`);
}

const canonicalCount = classified.filter((item) => !item.legacyParity).length;
const legacyCount = classified.length - canonicalCount;
console.log(
  `Running ${suite} test suite (${selected.length} selected; ${canonicalCount} canonical, ` +
    `${legacyCount} historical live-parity files).`,
);

const child = spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    ...selected.map((item) => path.join(testsRoot, item.fileName)),
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal !== null) {
      reject(new Error(`Test process terminated by signal ${signal}.`));
      return;
    }
    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;
