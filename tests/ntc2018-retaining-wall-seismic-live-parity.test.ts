import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NTC2018_RETAINING_WALL_SEISMIC_REFERENCE,
  calculateNTC2018RetainingWallSeismicCoefficients,
  createNTC2018MononobeOkabeSeismicInput,
} from "../dist/index.js";
import * as targetModule from "../dist/norms/ntc2018/geotechnics/ntc2018RetainingWallSeismic.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const normativeRevision = "41da3faa489600173106935bbcf726119300e48d";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const normativeRoot = path.resolve(repositoryRoot, "..", "strutture-normative");
const sourceModulePath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "geotechnics",
  "ntc2018RetainingWallSeismic.js",
);
const sourceIndexPath = path.join(sourceRoot, "src", "index.js");

const sourceModule = (await import(pathToFileURL(sourceModulePath).href)) as Record<
  string,
  unknown
>;
const sourceIndex = (await import(pathToFileURL(sourceIndexPath).href)) as Record<string, unknown>;

function gitOutput(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function assertFunction(
  value: unknown,
  label: string,
): asserts value is (...args: unknown[]) => unknown {
  assert.equal(typeof value, "function", `${label} must be a function`);
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

const sourceCalculate = sourceModule.calculateNTC2018RetainingWallSeismicCoefficients;
const sourceCreate = sourceModule.createNTC2018MononobeOkabeSeismicInput;
assertFunction(sourceCalculate, "source retaining-wall coefficient function");
assertFunction(sourceCreate, "source Mononobe-Okabe input factory");

void test("NTC 2018 retaining-wall seismic adapters match pinned JavaScript exactly", () => {
  assert.equal(gitOutput(sourceRoot, "rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput(sourceRoot, "status", "--porcelain"), "");
  assert.equal(gitOutput(normativeRoot, "rev-parse", "HEAD"), normativeRevision);
  assert.equal(gitOutput(normativeRoot, "status", "--porcelain"), "");

  assert.deepEqual(Object.keys(targetModule).sort(), Object.keys(sourceModule).sort());
  assert.equal(
    NTC2018_RETAINING_WALL_SEISMIC_REFERENCE,
    sourceIndex.NTC2018_RETAINING_WALL_SEISMIC_REFERENCE,
  );
  assert.equal(
    JSON.stringify(NTC2018_RETAINING_WALL_SEISMIC_REFERENCE),
    JSON.stringify(sourceIndex.NTC2018_RETAINING_WALL_SEISMIC_REFERENCE),
  );

  const sourceCoefficients = sourceCalculate({
    maximumSiteAccelerationRatio: 0.25,
    betaM: 0.38,
  });
  const targetCoefficients = calculateNTC2018RetainingWallSeismicCoefficients({
    maximumSiteAccelerationRatio: 0.25,
    betaM: 0.38,
  });
  assert.equal(JSON.stringify(targetCoefficients), JSON.stringify(sourceCoefficients));
  assert.deepEqual(targetCoefficients, sourceCoefficients);

  const sourceInput = sourceCreate({
    maximumSiteAccelerationRatio: "0.25",
    betaM: "0.38",
    verticalCase: "increased-effective-gravity",
    distributionModel: "resultant-μ",
  });
  const targetInput = createNTC2018MononobeOkabeSeismicInput({
    maximumSiteAccelerationRatio: "0.25",
    betaM: "0.38",
    verticalCase: "increased-effective-gravity",
    distributionModel: "resultant-μ",
  });
  assert.equal(JSON.stringify(targetInput), JSON.stringify(sourceInput));
  assert.deepEqual(
    JSON.parse(JSON.stringify(targetInput)),
    JSON.parse(JSON.stringify(sourceInput)),
  );
});

void test("NTC 2018 retaining-wall seismic error paths match pinned JavaScript", () => {
  const cases: Array<{ source: () => unknown; target: () => unknown }> = [
    {
      source: () => sourceCalculate({ betaM: 0.38 }),
      target: () => calculateNTC2018RetainingWallSeismicCoefficients({ betaM: 0.38 }),
    },
    {
      source: () => sourceCalculate({ maximumSiteAccelerationRatio: -0.25, betaM: 0.38 }),
      target: () =>
        calculateNTC2018RetainingWallSeismicCoefficients({
          maximumSiteAccelerationRatio: -0.25,
          betaM: 0.38,
        }),
    },
    {
      source: () => sourceCalculate({ maximumSiteAccelerationRatio: 0.25, betaM: 1.01 }),
      target: () =>
        calculateNTC2018RetainingWallSeismicCoefficients({
          maximumSiteAccelerationRatio: 0.25,
          betaM: 1.01,
        }),
    },
    {
      source: () =>
        sourceCreate({
          maximumSiteAccelerationRatio: 0.25,
          betaM: 0.38,
          verticalCase: "unsupported",
        }),
      target: () =>
        createNTC2018MononobeOkabeSeismicInput({
          maximumSiteAccelerationRatio: 0.25,
          betaM: 0.38,
          verticalCase: "unsupported",
        }),
    },
    {
      source: () => Reflect.apply(sourceCalculate, undefined, [null]),
      target: () => {
        Reflect.apply(calculateNTC2018RetainingWallSeismicCoefficients, undefined, [null]);
        throw new Error("Expected the callback to throw.");
      },
    },
    {
      source: () => Reflect.apply(sourceCreate, undefined, [null]),
      target: () => {
        Reflect.apply(createNTC2018MononobeOkabeSeismicInput, undefined, [null]);
        throw new Error("Expected the callback to throw.");
      },
    },
  ];

  for (const { source, target } of cases) {
    assert.deepEqual(errorSignature(source), errorSignature(target));
  }
});
