import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES,
  classifyNTC2018Topography,
} from "../dist/index.js";
import type { Ntc2018TopographicClassificationOptions } from "../dist/index.js";

const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceModulePath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "actions",
  "ntc2018TopographicClassification.js",
);
const sourceConstantsPath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "actions",
  "topographicClassification.constants.js",
);
const sourceAlgorithmPath = path.join(
  sourceRoot,
  "src",
  "norms",
  "ntc2018",
  "actions",
  "topographicClassification.js",
);

interface SourceTopographicApi {
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD: typeof NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD;
  NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES: typeof NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES;
  classifyNTC2018Topography: typeof classifyNTC2018Topography;
}

function gitOutput(...args: string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" }).trim();
}

function buildGrid(
  gridSize = 51,
  radiusM = 250,
  elevationAt: (x: number, y: number) => number = () => 200,
  missingCount = 0,
): NonNullable<Ntc2018TopographicClassificationOptions["terrainGrid"]> {
  const points: Array<Record<string, unknown>> = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const northOffsetM = radiusM - row * 10;
      const eastOffsetM = -radiusM + col * 10;
      const elevation = elevationAt(eastOffsetM, northOffsetM);
      const isMissing = points.length < missingCount;
      points.push({
        row,
        col,
        northOffsetM,
        eastOffsetM,
        lat: 43.123 + northOffsetM / 111320,
        lon: 11.456 + eastOffsetM / 82000,
        elevation: isMissing ? null : elevation,
        elevation_m: isMissing ? null : elevation,
        source: "TINITALY",
        resolution_m: 10,
        method: "bilinear",
        nodata: isMissing,
      });
    }
  }

  return {
    center: { lat: 43.123, lon: 11.456 },
    radiusM,
    gridSize,
    spacingM: 10,
    extentM: radiusM * 2,
    points,
    provenance: {
      kind: "external-service",
      reference: "TINITALY – Unicode parity",
    },
  };
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

const sourceApi = (await import(
  pathToFileURL(sourceModulePath).href
)) as unknown as SourceTopographicApi;
const sourceConstants = (await import(pathToFileURL(sourceConstantsPath).href)) as Record<
  string,
  unknown
>;
const typescriptConstants = (await import(
  "../dist/norms/ntc2018/actions/topographicClassification.constants.js"
)) as Record<string, unknown>;
const sourceAlgorithm = (await import(pathToFileURL(sourceAlgorithmPath).href)) as Record<
  string,
  unknown
>;
const typescriptAlgorithm = (await import(
  "../dist/norms/ntc2018/actions/topographicClassification.js"
)) as Record<string, unknown>;

void test("topographic public exports and Unicode metadata match the pinned module", () => {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
  assert.deepEqual(
    NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
    sourceApi.NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD,
  );
  assert.deepEqual(
    NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES,
    sourceApi.NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES,
  );
  assert.ok(NTC2018_TOPOGRAPHIC_CLASSIFICATION_REFERENCES.ntc2018.includes("§"));
  assert.equal(Object.isFrozen(NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD), true);
  assert.equal(Object.isFrozen(sourceApi.NTC2018_TOPOGRAPHIC_CLASSIFICATION_METHOD), true);
  assert.deepEqual(typescriptConstants, sourceConstants);
  assert.deepEqual(Object.keys(typescriptAlgorithm).sort(), Object.keys(sourceAlgorithm).sort());
});

void test("flat, sloped, and incomplete grids serialize identically", () => {
  const cases: Ntc2018TopographicClassificationOptions[] = [
    { terrainGrid: buildGrid() },
    {
      terrainGrid: buildGrid(101, 500, (x) => 220 + Math.tan((20 * Math.PI) / 180) * x),
    },
    {
      terrainGrid: buildGrid(
        101,
        500,
        (x, y) =>
          200 + 240 * Math.exp(-(x * x) / (2 * 40 * 40)) * Math.exp(-(y * y) / (2 * 260 * 260)),
      ),
    },
    { terrainGrid: buildGrid(51, 250, () => 200, 200) },
  ];

  for (const options of cases) {
    const typescriptJson = classifyNTC2018Topography(options).toJSON();
    const javascriptJson = sourceApi.classifyNTC2018Topography(options).toJSON();
    assert.deepEqual(typescriptJson, javascriptJson);
    assert.equal(JSON.stringify(typescriptJson), JSON.stringify(javascriptJson));
  }
});

void test("unsupported preprocessing errors match exactly", () => {
  const options = {
    terrainGrid: buildGrid(),
    preprocessingMode: "unsupported-ƒ-mode",
  };
  assert.deepEqual(
    errorSignature(() => classifyNTC2018Topography(options)),
    errorSignature(() => sourceApi.classifyNTC2018Topography(options)),
  );
});
