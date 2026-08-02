import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface KinematicsModule {
  readonly addVectors: (left: number[], right: number[]) => number[];
  readonly frameTransformationMatrix: (c: number, s: number) => number[][];
  readonly identityMatrix: (size: number) => number[][];
  readonly masonryPierBasicKinematicMatrix: (length: number) => number[][];
  readonly masonryPierComponentCompatibilityMatrix: (length: number) => number[][];
  readonly multiplyMatrices: (left: number[][], right: number[][]) => number[][];
  readonly multiplyMatrixVector: (matrix: number[][], vector: number[]) => number[];
  readonly subtractMatrices: (left: number[][], right: number[][]) => number[][];
  readonly subtractVectors: (left: number[], right: number[]) => number[];
  readonly transpose: (matrix: number[][]) => number[][];
}

function isKinematicsModule(value: unknown): value is KinematicsModule {
  return (
    value !== null &&
    typeof value === "object" &&
    [
      "addVectors",
      "frameTransformationMatrix",
      "identityMatrix",
      "masonryPierBasicKinematicMatrix",
      "masonryPierComponentCompatibilityMatrix",
      "multiplyMatrices",
      "multiplyMatrixVector",
      "subtractMatrices",
      "subtractVectors",
      "transpose",
    ].every((name) => name in value && typeof Reflect.get(value, name) === "function")
  );
}

function isFunction(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === "function";
}

function callFunction(
  module: KinematicsModule,
  name: string,
  arguments_: readonly unknown[],
): unknown {
  const functionValue: unknown = Reflect.get(module, name);
  assert.ok(isFunction(functionValue), `${name} is not callable`);
  return functionValue(...arguments_);
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function assertExactParity(source: KinematicsModule, typescript: KinematicsModule): void {
  const matrix = [
    [1, 2, 3],
    [-4, 5, 6],
  ];
  const right = [
    [0.5, -1],
    [2, 3],
    [4, 1.5],
  ];
  const vector = [2, -3, 4];
  const calls: Array<readonly [string, unknown[]]> = [
    ["transpose", [matrix]],
    ["multiplyMatrices", [matrix, right]],
    ["multiplyMatrixVector", [matrix, vector]],
    [
      "subtractVectors",
      [
        [1, 2, 3],
        [4, -1, 2],
      ],
    ],
    [
      "addVectors",
      [
        [1, 2, 3],
        [4, -1, 2],
      ],
    ],
    ["subtractMatrices", [matrix, matrix]],
    ["identityMatrix", [3]],
    ["masonryPierBasicKinematicMatrix", [4.5]],
    ["masonryPierComponentCompatibilityMatrix", [4.5]],
    ["frameTransformationMatrix", [0.8, -0.6]],
  ];

  for (const [name, arguments_] of calls) {
    const sourceResult = callFunction(source, name, arguments_);
    const typescriptResult = callFunction(typescript, name, arguments_);
    assert.deepEqual(typescriptResult, sourceResult, name);
    assert.equal(JSON.stringify(typescriptResult), JSON.stringify(sourceResult), name);
  }
}

void test("masonry pier kinematics match the independent pinned JavaScript implementation", async () => {
  assertSourceBaseline();
  const sourceModule: unknown = await import(
    pathToFileURL(
      path.join(
        sourceRoot,
        "src",
        "domain",
        "fem",
        "elements",
        "masonry",
        "MasonryPierKinematics.js",
      ),
    ).href
  );
  const typescriptModule: unknown = await import(
    pathToFileURL(
      path.join(
        repositoryRoot,
        "dist",
        "domain",
        "fem",
        "elements",
        "masonry",
        "MasonryPierKinematics.js",
      ),
    ).href
  );
  if (!isKinematicsModule(sourceModule) || !isKinematicsModule(typescriptModule)) {
    throw new Error("Masonry pier kinematics modules do not expose the expected API.");
  }
  assert.notEqual(sourceModule.transpose, typescriptModule.transpose);
  assertExactParity(sourceModule, typescriptModule);

  assert.throws(
    () => sourceModule.transpose([]),
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      return error.message === "Cannot read properties of undefined (reading 'map')";
    },
  );
  assert.throws(
    () => typescriptModule.transpose([]),
    (error: unknown) => {
      assert.ok(error instanceof TypeError);
      return error.message === "Cannot read properties of undefined (reading 'map')";
    },
  );
});
