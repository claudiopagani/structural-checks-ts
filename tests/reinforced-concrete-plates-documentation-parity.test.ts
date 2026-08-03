import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const sourcePath = "src/applications/reinforced-concrete-plates/README.md";
const sourceBlobSha1 = "ba943a0a8e0e8fbb22dbff6675041801a69d57c6";

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

void test("reinforced-concrete plates documentation matches the pinned source exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.equal(
    gitOutput(sourceRoot, "rev-parse", `${sourceRevision}:${sourcePath}`),
    sourceBlobSha1,
  );

  const sourceText = execFileSync(
    "git",
    ["-C", sourceRoot, "show", `${sourceRevision}:${sourcePath}`],
    {
      encoding: "utf8",
    },
  );
  const targetText = readFileSync(path.join(repositoryRoot, sourcePath), "utf8");

  assert.equal(targetText, sourceText);
  assert.deepEqual(
    Array.from(targetText, (character) => character.codePointAt(0)),
    Array.from(sourceText, (character) => character.codePointAt(0)),
  );
});
