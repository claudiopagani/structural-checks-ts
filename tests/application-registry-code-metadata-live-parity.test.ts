import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");
const typescriptIndexPath = path.join(repositoryRoot, "dist", "index.js");

interface RuntimeApplicationOptions {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly domain?: string;
  readonly supportedCodes?: string[];
  readonly tags?: string[];
  readonly metadata?: Record<string, unknown>;
}

interface RuntimeApplication {
  readonly id: string;
  readonly getManifest: () => unknown;
  readonly run: (input?: unknown) => unknown;
}

interface RuntimeRegistry {
  readonly register: (application: RuntimeApplication) => RuntimeRegistry;
  readonly has: (applicationId: string) => boolean;
  readonly get: (applicationId: string) => RuntimeApplication | null;
  readonly list: () => RuntimeApplication[];
  readonly listManifests: () => unknown[];
  readonly run: (applicationId: string, input?: unknown) => unknown;
}

interface RuntimeDesignCodeContext {
  readonly toJSON: () => unknown;
}

interface RuntimeModule {
  readonly ApplicationRegistry: new (
    applications?: readonly RuntimeApplication[],
  ) => RuntimeRegistry;
  readonly StructuralApplication: new (options: RuntimeApplicationOptions) => RuntimeApplication;
  readonly DesignCodeContext: new (options: {
    readonly id: string;
    readonly name?: string;
    readonly jurisdiction?: string | null;
    readonly version?: string | null;
    readonly referenceDocuments?: string[];
    readonly metadata?: Record<string, unknown>;
  }) => RuntimeDesignCodeContext;
  readonly APPLICATION_CATALOG: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRuntimeModule(value: unknown): asserts value is RuntimeModule {
  assert.ok(isRecord(value));
  assert.equal(typeof value.ApplicationRegistry, "function");
  assert.equal(typeof value.StructuralApplication, "function");
  assert.equal(typeof value.DesignCodeContext, "function");
  assert.ok(Array.isArray(value.APPLICATION_CATALOG));
}

function sourceGitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(sourceGitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(sourceGitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => character.codePointAt(0) as number);
}

function compareValues(source: unknown, typescript: unknown, label: string): void {
  const absoluteTolerance = 1e-12;
  const relativeTolerance = 1e-12;
  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      const leftNumber = left as number;
      const rightNumber = right as number;
      const difference = Math.abs(leftNumber - rightNumber);
      const scale = Math.max(1, Math.abs(leftNumber), Math.abs(rightNumber));
      assert.ok(
        difference <= absoluteTolerance + relativeTolerance * scale,
        `${label}${valuePath}: numerical difference ${difference} exceeds tolerance`,
      );
      return;
    }
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(left, right, `${label}${valuePath}`);
      assert.deepEqual(
        codePoints(left as string),
        codePoints(right as string),
        `${label}${valuePath}: Unicode code points`,
      );
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
      return;
    }
    assert.deepEqual(left, right, `${label}${valuePath}`);
  };

  compare(source, typescript, "$");
  assert.equal(
    JSON.stringify(source),
    JSON.stringify(typescript),
    `${label}: exact serialized JSON`,
  );
}

function captureError(invoke: () => unknown): { readonly name: string; readonly message: string } {
  try {
    invoke();
  } catch (error) {
    return {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected the independent JavaScript oracle call to fail.");
}

const sourceModuleValue: unknown = await import(pathToFileURL(sourceIndexPath).href);
const typescriptModuleValue: unknown = await import(pathToFileURL(typescriptIndexPath).href);
assertRuntimeModule(sourceModuleValue);
assertRuntimeModule(typescriptModuleValue);
const sourceModule = sourceModuleValue;
const typescriptModule = typescriptModuleValue;

void test("application registry and code metadata match the independent JavaScript oracle", () => {
  assertSourceBaseline();
  assert.notEqual(sourceModule.ApplicationRegistry, typescriptModule.ApplicationRegistry);
  assert.notEqual(sourceModule.DesignCodeContext, typescriptModule.DesignCodeContext);
  assert.notEqual(sourceModule.APPLICATION_CATALOG, typescriptModule.APPLICATION_CATALOG);

  compareValues(sourceModule.APPLICATION_CATALOG, typescriptModule.APPLICATION_CATALOG, "catalog");
  assert.equal((sourceModule.APPLICATION_CATALOG as unknown[]).length, 30);

  const codeOptions = {
    id: "ntc2018",
    name: "Codice NTC 2018 § 7.4",
    jurisdiction: "IT",
    version: "2018",
    referenceDocuments: ["NTC 2018 § 7.4.4.3.1"],
    metadata: { normativeReference: "§ 7.4.4.3.1" },
  };
  const sourceCode = new sourceModule.DesignCodeContext(codeOptions);
  const typescriptCode = new typescriptModule.DesignCodeContext(codeOptions);
  compareValues(sourceCode.toJSON(), typescriptCode.toJSON(), "design code");

  const applicationOptions: RuntimeApplicationOptions = {
    id: "demo",
    name: "Demo § application",
    description: "A source-compatible registry fixture.",
    domain: "general",
    supportedCodes: ["NTC2018"],
    tags: ["fixture"],
    metadata: { maturity: "scaffolded" },
  };
  const sourceApplication = new sourceModule.StructuralApplication(applicationOptions);
  const typescriptApplication = new typescriptModule.StructuralApplication(applicationOptions);
  const sourceRegistry = new sourceModule.ApplicationRegistry([sourceApplication]);
  const typescriptRegistry = new typescriptModule.ApplicationRegistry([typescriptApplication]);
  assert.notEqual(sourceApplication, typescriptApplication);
  compareValues(sourceRegistry.list(), typescriptRegistry.list(), "registry.list");
  compareValues(
    sourceRegistry.listManifests(),
    typescriptRegistry.listManifests(),
    "registry.manifests",
  );
  compareValues(
    sourceRegistry.run("demo", { ignoredInput: true }),
    typescriptRegistry.run("demo", { ignoredInput: true }),
    "registry.run",
  );
  assert.equal(sourceRegistry.has("demo"), typescriptRegistry.has("demo"));
  compareValues(sourceRegistry.get("missing"), typescriptRegistry.get("missing"), "registry.get");

  const sourceDuplicate = captureError(() => sourceRegistry.register(sourceApplication));
  const typescriptDuplicate = captureError(() =>
    typescriptRegistry.register(typescriptApplication),
  );
  compareValues(sourceDuplicate, typescriptDuplicate, "duplicate registration error");
  const sourceUnknown = captureError(() => sourceRegistry.run("missing"));
  const typescriptUnknown = captureError(() => typescriptRegistry.run("missing"));
  compareValues(sourceUnknown, typescriptUnknown, "unknown application error");
});
