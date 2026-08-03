import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as targetIndex from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/masonry/index.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceModulePath = path.join(sourceRoot, "src", "norms", "ntc2018", "masonry", "index.js");
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function call(module: Record<string, unknown>, name: string, ...args: unknown[]): unknown {
  const candidate = module[name];
  assert.equal(typeof candidate, "function", `${name} must be callable`);
  if (typeof candidate !== "function") {
    throw new Error(`${name} must be callable`);
  }
  return Reflect.apply(candidate, undefined, args);
}

function serialize(value: unknown): unknown {
  const json = JSON.stringify(value);
  assert.notEqual(json, undefined);
  return JSON.parse(json) as unknown;
}

function errorSignature(callback: () => unknown): { name: string; message: string } {
  try {
    callback();
  } catch (error) {
    assert.ok(error instanceof Error);
    return { name: error.name, message: error.message };
  }
  throw new Error("Expected the callback to throw.");
}

const exportedFunctions = [
  "calculateNTC2018MasonryPierElasticStiffness",
  "calculateNTC2018MasonryPierFlexuralCapacity",
  "calculateNTC2018MasonryPierIrregularDiagonalCapacity",
  "calculateNTC2018MasonryPierRegularDiagonalCapacity",
  "calculateNTC2018MasonryPierSlidingCapacity",
  "calculateNTC2018MasonryPierUltimateDisplacement",
  "evaluateNTC2018MasonryPier",
  "selectNTC2018MasonryPierGoverningCapacity",
];

void test("pinned repositories and masonry-pier module exports remain independent", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");
  assert.deepEqual(Object.keys(sourceModule).sort(), Object.keys(targetModule).sort());

  for (const name of [
    "NTC2018_MASONRY_PIER_CAPACITY_REFERENCES",
    "NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES",
    "NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE",
    ...exportedFunctions,
  ]) {
    assert.equal(
      typeof sourceIndex[name],
      typeof Reflect.get(targetIndex, name),
      `${name} root export type`,
    );
  }
});

void test("capacity, governing, deformation, stiffness, and Unicode references match exactly", () => {
  for (const name of [
    "NTC2018_MASONRY_PIER_CAPACITY_REFERENCES",
    "NTC2018_MASONRY_PIER_DEFORMATION_REFERENCES",
    "NTC2018_MASONRY_PIER_STIFFNESS_REFERENCE",
  ]) {
    assert.deepEqual(serialize(Reflect.get(targetModule, name)), serialize(sourceModule[name]));
  }

  const cases: Array<[string, unknown]> = [
    [
      "calculateNTC2018MasonryPierFlexuralCapacity",
      {
        axialCompression: 300000,
        compressiveStrength: 4,
        length: 1500,
        thickness: 300,
        shearSpan: 3000,
      },
    ],
    [
      "calculateNTC2018MasonryPierFlexuralCapacity",
      {
        axialCompression: -10,
        compressiveStrength: 4,
        length: 1500,
        thickness: 300,
        shearSpan: 3000,
      },
    ],
    [
      "calculateNTC2018MasonryPierSlidingCapacity",
      {
        axialCompression: 1000000,
        cohesion: 0.1,
        shearStrengthLimit: 10,
        length: 1500,
        thickness: 300,
        shearSpan: 1500,
      },
    ],
    [
      "calculateNTC2018MasonryPierSlidingCapacity",
      {
        axialCompression: -1000000,
        cohesion: 0.1,
        shearStrengthLimit: 10,
        length: 1500,
        thickness: 300,
        shearSpan: 1500,
      },
    ],
    [
      "calculateNTC2018MasonryPierIrregularDiagonalCapacity",
      {
        axialCompression: 300000,
        referenceShearStrength: 0.08,
        length: 1500,
        thickness: 300,
        height: 3000,
      },
    ],
    [
      "calculateNTC2018MasonryPierRegularDiagonalCapacity",
      {
        axialCompression: 300000,
        cohesion: 0.1,
        interlockingCoefficient: 0.5,
        blockTensileStrength: 1,
        length: 1500,
        thickness: 300,
        height: 3000,
      },
    ],
  ];

  for (const [name, options] of cases) {
    const source = call(sourceModule, name, options);
    const target = call(targetModule, name, options);
    assert.deepEqual(serialize(target), serialize(source));
    assert.equal(JSON.stringify(target), JSON.stringify(source));
  }

  const governingInput = [
    { mechanism: "zero", available: true, capacity: 0 },
    call(targetModule, "calculateNTC2018MasonryPierFlexuralCapacity", {
      axialCompression: -10,
      compressiveStrength: 4,
      length: 1500,
      thickness: 300,
      shearSpan: 3000,
    }),
  ];
  assert.deepEqual(
    serialize(call(targetModule, "selectNTC2018MasonryPierGoverningCapacity", governingInput)),
    serialize(call(sourceModule, "selectNTC2018MasonryPierGoverningCapacity", governingInput)),
  );

  const deformationCases = [
    { height: 3000, mechanism: "flexural", scope: "existing" },
    { height: 3000, mechanism: "bed-joint-sliding", scope: "new-ordinary" },
    {
      height: 3000,
      mechanism: "diagonal-cracking-regular",
      scope: "existing",
      modernPerforatedBlocks: true,
    },
  ];
  for (const options of deformationCases) {
    assert.deepEqual(
      serialize(call(targetModule, "calculateNTC2018MasonryPierUltimateDisplacement", options)),
      serialize(call(sourceModule, "calculateNTC2018MasonryPierUltimateDisplacement", options)),
    );
  }

  const stiffnessCases = [
    {
      elasticModulus: 1800,
      shearModulus: 600,
      length: 1500,
      thickness: 300,
      deformableHeight: 3000,
    },
    {
      elasticModulus: 1800,
      shearModulus: 600,
      length: 1500,
      thickness: 300,
      deformableHeight: 3000,
      boundaryCondition: "fixed-fixed",
      crackedStiffnessFactor: 0.4,
      shearCorrectionFactor: 0.8,
    },
  ];
  for (const options of stiffnessCases) {
    assert.deepEqual(
      serialize(call(targetModule, "calculateNTC2018MasonryPierElasticStiffness", options)),
      serialize(call(sourceModule, "calculateNTC2018MasonryPierElasticStiffness", options)),
    );
  }
});

void test("evaluator preserves complete and incomplete serialized behavior", () => {
  const completeOptions = {
    geometry: { length: 1.5, height: 3, thickness: 0.3, label: "parete μ—1" },
    material: {
      compressiveStrength: 4,
      cohesion: 0.1,
      shearStrengthLimit: 1,
      referenceShearStrength: 0.08,
      elasticModulus: 1800,
      shearModulus: 600,
    },
    actions: { axialCompression: 300, shearAxialCompression: 300 },
    options: {
      scope: "existing",
      masonryTexture: "irregular",
      boundaryCondition: "cantilever",
      modernPerforatedBlocks: true,
    },
    lateralDisplacement: 0.01,
  };
  const completeSource = call(sourceModule, "evaluateNTC2018MasonryPier", completeOptions);
  const completeTarget = call(targetModule, "evaluateNTC2018MasonryPier", completeOptions);
  assert.deepEqual(serialize(completeTarget), serialize(completeSource));
  assert.equal(JSON.stringify(completeTarget), JSON.stringify(completeSource));

  const regularOptions = {
    ...completeOptions,
    material: {
      ...completeOptions.material,
      interlockingCoefficient: 0.5,
      blockTensileStrength: 1,
    },
    options: { ...completeOptions.options, masonryTexture: "regular" },
  };
  assert.deepEqual(
    serialize(call(targetModule, "evaluateNTC2018MasonryPier", regularOptions)),
    serialize(call(sourceModule, "evaluateNTC2018MasonryPier", regularOptions)),
  );

  const incompleteOptions = {
    geometry: { length: 1.5, height: 3, thickness: 0.3 },
    material: { compressiveStrength: 4, cohesion: 0.1, elasticModulus: 1800, shearModulus: 600 },
    actions: { axialCompression: 300 },
  };
  assert.deepEqual(
    serialize(call(targetModule, "evaluateNTC2018MasonryPier", incompleteOptions)),
    serialize(call(sourceModule, "evaluateNTC2018MasonryPier", incompleteOptions)),
  );
});

void test("unsupported and missing-input errors match exactly", () => {
  const cases: Array<[string, unknown]> = [
    [
      "calculateNTC2018MasonryPierFlexuralCapacity",
      {
        compressiveStrength: 4,
        length: 0,
        thickness: 300,
        shearSpan: 3000,
      },
    ],
    [
      "calculateNTC2018MasonryPierUltimateDisplacement",
      {
        height: 3000,
        mechanism: "unknown",
      },
    ],
    [
      "calculateNTC2018MasonryPierUltimateDisplacement",
      {
        height: 3000,
        mechanism: "flexural",
        scope: "unsupported",
      },
    ],
    [
      "calculateNTC2018MasonryPierElasticStiffness",
      {
        elasticModulus: 1800,
        shearModulus: 600,
        length: 1500,
        thickness: 300,
        deformableHeight: 3000,
        boundaryCondition: "unsupported",
      },
    ],
    [
      "calculateNTC2018MasonryPierElasticStiffness",
      {
        elasticModulus: 1800,
        shearModulus: 600,
        length: 1500,
        thickness: 300,
        deformableHeight: 3000,
        crackedStiffnessFactor: 1.1,
      },
    ],
    [
      "evaluateNTC2018MasonryPier",
      {
        geometry: { length: 1.5, height: 3, thickness: 0.3 },
        material: {},
        actions: {},
        options: { masonryTexture: "unsupported" },
      },
    ],
  ];

  for (const [name, options] of cases) {
    assert.deepEqual(
      errorSignature(() => call(targetModule, name, options)),
      errorSignature(() => call(sourceModule, name, options)),
    );
  }
});
