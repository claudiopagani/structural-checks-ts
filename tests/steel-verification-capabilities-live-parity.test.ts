import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";

interface RuntimeCapabilitiesModule {
  readonly getSteelVerificationCapabilities: (options?: unknown) => unknown;
}

interface RuntimeRootModule {
  readonly getSteelVerificationCapabilities: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCapabilitiesModule(value: unknown): value is RuntimeCapabilitiesModule {
  return isRecord(value) && typeof value.getSteelVerificationCapabilities === "function";
}

function isRootModule(value: unknown): value is RuntimeRootModule {
  return isRecord(value) && "getSteelVerificationCapabilities" in value;
}

async function loadCapabilitiesModule(
  root: string,
  relativePath: string,
): Promise<RuntimeCapabilitiesModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isCapabilitiesModule(module)) {
    throw new Error(`The module ${relativePath} does not expose steel capabilities.`);
  }
  return module;
}

async function loadRootModule(root: string, relativePath: string): Promise<RuntimeRootModule> {
  const module: unknown = await import(pathToFileURL(path.join(root, relativePath)).href);
  if (!isRootModule(module)) {
    throw new Error("The root module does not expose steel capabilities.");
  }
  return module;
}

function gitOutput(repository: string, ...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Expected a serializable value.");
  return serialized;
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function exactJson(source: unknown, typescript: unknown, label: string): void {
  const sourceJson = json(source);
  const typescriptJson = json(typescript);
  assert.equal(typescriptJson, sourceJson, `${label}: exact JSON`);
  assert.deepEqual(codePoints(typescriptJson), codePoints(sourceJson), `${label}: Unicode`);
}

function errorSnapshot(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

function assertErrorParity(
  sourceCallback: () => unknown,
  typescriptCallback: () => unknown,
  label: string,
): void {
  assert.deepEqual(errorSnapshot(sourceCallback), errorSnapshot(typescriptCallback), label);
}

void test("steel verification capabilities match the independent pinned JavaScript implementation", async () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  const source = await loadCapabilitiesModule(
    sourceRoot,
    "src/applications/steel-frames/checks/steelVerificationCapabilities.js",
  );
  const typescript = await loadCapabilitiesModule(
    path.join(repositoryRoot, "dist"),
    "applications/steel-frames/checks/steelVerificationCapabilities.js",
  );
  const sourceRootModule = await loadRootModule(sourceRoot, "src/index.js");
  const typescriptRootModule = await loadRootModule(path.join(repositoryRoot, "dist"), "index.js");

  assert.equal(
    sourceRootModule.getSteelVerificationCapabilities,
    source.getSteelVerificationCapabilities,
  );
  assert.equal(
    typescriptRootModule.getSteelVerificationCapabilities,
    typescript.getSteelVerificationCapabilities,
  );
  assert.notEqual(
    source.getSteelVerificationCapabilities,
    typescript.getSteelVerificationCapabilities,
  );

  const units = { force: "kN", length: "m" };
  const rhsSource = source.getSteelVerificationCapabilities({
    profileName: "RHS200X100X6.3",
    units,
  });
  const rhsTypescript = typescript.getSteelVerificationCapabilities({
    profileName: "RHS200X100X6.3",
    units,
  });
  exactJson(rhsSource, rhsTypescript, "RHS capabilities and units");
  assert.ok(isRecord(rhsSource));
  assert.ok(isRecord(rhsTypescript));
  assert.equal(rhsTypescript.status, rhsSource.status, "exact capability status");

  exactJson(
    source.getSteelVerificationCapabilities({ profileName: "UPN200", units }),
    typescript.getSteelVerificationCapabilities({ profileName: "UPN200", units }),
    "UPN guarded capabilities",
  );
  exactJson(
    source.getSteelVerificationCapabilities({
      section: {
        family: "COMPOUND",
        profileName: "compound-λ",
        metadata: { profileName: "compound-λ" },
      },
    }),
    typescript.getSteelVerificationCapabilities({
      section: {
        family: "COMPOUND",
        profileName: "compound-λ",
        metadata: { profileName: "compound-λ" },
      },
    }),
    "compound capabilities and Unicode metadata",
  );
  exactJson(
    source.getSteelVerificationCapabilities({ profileName: "XYZ999", units }),
    typescript.getSteelVerificationCapabilities({ profileName: "XYZ999", units }),
    "unsupported profile error mapping",
  );
  exactJson(
    source.getSteelVerificationCapabilities({}),
    typescript.getSteelVerificationCapabilities({}),
    "missing section behavior",
  );
  exactJson(
    source.getSteelVerificationCapabilities({
      section: { family: "IPE", metadata: { profileName: "IPE-λ" } },
    }),
    typescript.getSteelVerificationCapabilities({
      section: { family: "IPE", metadata: { profileName: "IPE-λ" } },
    }),
    "direct section metadata fallback",
  );

  assertErrorParity(
    () => source.getSteelVerificationCapabilities(null),
    () => typescript.getSteelVerificationCapabilities(null),
    "null capability options error",
  );
});
