import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  PUNCHING_ACTION_SCHEMA_VERSION,
  PUNCHING_CONNECTION_SCHEMA_VERSION,
  PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION,
  PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION,
  PunchingActionState,
  PunchingConnectionModel,
  PunchingControlPerimeter,
  RC_PUNCHING_DESIGN_CODE_IDS,
  RC_PUNCHING_PARAMETER_PROFILES,
  ReinforcedConcretePunchingApplication,
  resolvePunchingTransferFromJointActions,
  verifyPunching,
  type PunchingConnectionModelOptions,
  type PunchingVerificationRequestOptions,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const expectedRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const baselinePath = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(import.meta.dirname, "..", "..", "strutture-js");
const units = { force: "N", length: "mm" } as const;

const { stdout: revisionOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "rev-parse",
  "HEAD",
]);
const { stdout: statusOutput } = await execFileAsync("git", [
  "-C",
  baselinePath,
  "status",
  "--porcelain",
]);
assert.equal(revisionOutput.trim(), expectedRevision);
assert.equal(statusOutput.trim(), "", "Compatibility test requires a clean source worktree.");

const JavaScriptApi = (await import(
  pathToFileURL(path.join(baselinePath, "src", "index.js")).href
)) as Record<string, unknown>;

function baselineExport<TExport>(name: string): TExport {
  const value = JavaScriptApi[name];
  assert.notEqual(value, undefined, `The baseline is missing ${name}.`);
  return value as TExport;
}

type BaselineConstructor = new (options: unknown) => {
  toJSON(): unknown;
};
type BaselineVerify = (input: unknown) => unknown;

const BaselineConnection = baselineExport<BaselineConstructor>("PunchingConnectionModel");
const BaselineAction = baselineExport<BaselineConstructor>("PunchingActionState");
const BaselinePerimeter = baselineExport<BaselineConstructor>("PunchingControlPerimeter");
const baselineResolveTransfer = baselineExport<BaselineVerify>(
  "resolvePunchingTransferFromJointActions",
);
const baselineVerifyPunching = baselineExport<BaselineVerify>("verifyPunching");

function jsonValue(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function numeric(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  assert.equal(typeof value, "number", `${key} must be numeric.`);
  return value as number;
}

function connectionOptions({
  id,
  columnSize,
  thickness,
  effectiveDepthX,
  effectiveDepthY,
  ratioX,
  ratioY,
  fck,
  lowerAggregateSize = null,
  reinforcedEdition = null,
}: {
  id: string;
  columnSize: number;
  thickness: number;
  effectiveDepthX: number;
  effectiveDepthY: number;
  ratioX: number;
  ratioY: number;
  fck: number;
  lowerAggregateSize?: number | null;
  reinforcedEdition?: "2004" | "2023" | null;
}): PunchingConnectionModelOptions {
  return {
    id,
    units,
    slab: {
      thickness,
      boundary: [
        { x: -4000, y: -4000 },
        { x: 4000, y: -4000 },
        { x: 4000, y: 4000 },
        { x: -4000, y: 4000 },
      ],
      openings: [],
      beams: [],
    },
    support: {
      id: `${id}:column`,
      kind: "column",
      position: "interior",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: columnSize,
        sizeY: columnSize,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck },
      concreteAggregate: lowerAggregateSize == null ? null : { lowerSize: lowerAggregateSize },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: effectiveDepthX, ratio: ratioX },
        y: { effectiveDepth: effectiveDepthY, ratio: ratioY },
        source: { method: "worked-example-effective-ratios" },
      },
      punching:
        reinforcedEdition == null
          ? { present: false }
          : {
              present: true,
              system: "studs",
              steel: { fywd: 435 },
              layout: {
                legDiameter: 12,
                legArea: 113,
                areaPerPerimeter: reinforcedEdition === "2004" ? 1500 : 1800,
                radialSpacing: 150,
                tangentialSpacing: reinforcedEdition === "2004" ? 300 : 150,
                firstPerimeterOffset: reinforcedEdition === "2004" ? 125 : 140,
                perimeterCount: 6,
              },
            },
    },
  };
}

function verificationOptions({
  edition,
  reinforced = false,
}: {
  edition: "2004" | "2023";
  reinforced?: boolean;
}): PunchingVerificationRequestOptions {
  const firstGeneration = edition === "2004";
  const connection = connectionOptions({
    id: `punching-${edition}-${reinforced ? "reinforced" : "plain"}`,
    columnSize: firstGeneration ? 400 : 500,
    thickness: firstGeneration ? 300 : 320,
    effectiveDepthX: firstGeneration ? 260 : 280,
    effectiveDepthY: firstGeneration ? 240 : 280,
    ratioX: firstGeneration ? 0.0085 : 0.0091,
    ratioY: firstGeneration ? 0.0048 : 0.0091,
    fck: firstGeneration ? 30 : 42.8,
    lowerAggregateSize: firstGeneration ? null : 32,
    reinforcedEdition: reinforced ? edition : null,
  });
  const connectionId = connection.id as string;
  return {
    id: `${connectionId}:request`,
    connection,
    actionStates: [
      {
        id: "ULS-01",
        connectionId,
        localFrameId: `${connectionId}:local-frame`,
        combinationType: "ULS",
        units,
        components: {
          fz: firstGeneration ? 1_204_800 : 1_167_000,
          mx: 0,
          my: 0,
        },
        source: {
          method: "manual",
          reference: "published-worked-example",
        },
      },
    ],
    code: firstGeneration
      ? {
          id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
          parameterProfile: RC_PUNCHING_PARAMETER_PROFILES.EN_RECOMMENDED,
        }
      : {
          id: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2023,
          parameters: { gammaV: 1.4, betaE: 1.15 },
        },
  };
}

void test("punching DTO contracts preserve source normalization and serialization", () => {
  const connectionInput: PunchingConnectionModelOptions = {
    id: "contract",
    units: { force: "kN", length: "m" } as const,
    localFrame: { origin: { x: 1, y: 2, z: 3 } },
    slab: {
      thickness: 0.25,
      boundary: [
        { x: -3, y: -2 },
        { x: 3, y: -2 },
        { x: 3, y: 2 },
        { x: -3, y: 2 },
      ],
    },
    support: {
      kind: "column",
      position: "edge",
      footprint: {
        shape: "rectangle",
        center: { x: 0, y: 0 },
        sizeX: 0.4,
        sizeY: 0.5,
        rotation: 0,
      },
    },
    materials: {
      concrete: { fck: 30_000 },
      concreteAggregate: { lowerSize: 0.016 },
    },
    reinforcement: {
      flexuralTension: {
        x: { effectiveDepth: 0.21, ratio: 0.008 },
        y: { effectiveDepth: 0.2, ratio: 0.007 },
      },
    },
  };
  const actionInput = {
    id: "ULS-contract",
    connectionId: "contract",
    localFrameId: "contract:local-frame",
    combinationType: "uls fundamental",
    units: { force: "kN", length: "m" } as const,
    referencePoint: { x: 0.1, y: -0.2, z: 0 },
    components: { fz: 850, mx: 120, my: -40 },
    source: { method: "manual" as const },
  };
  const perimeterInput = {
    id: "u-open",
    codeId: RC_PUNCHING_DESIGN_CODE_IDS.EN_1992_1_1_2004,
    role: "basic-control",
    position: "edge",
    offset: 0.5,
    units: { force: "kN", length: "m" } as const,
    components: [
      {
        closed: false,
        segments: [
          {
            type: "line" as const,
            start: { x: 0, y: 0 },
            end: { x: 1, y: 0 },
          },
          {
            type: "arc" as const,
            center: { x: 1, y: 0.5 },
            radius: 0.5,
            startAngle: -Math.PI / 2,
            sweepAngle: Math.PI,
          },
          {
            type: "line" as const,
            start: { x: 1, y: 1 },
            end: { x: 0, y: 1 },
          },
        ],
      },
    ],
  };

  const targetConnection = new PunchingConnectionModel(connectionInput);
  const targetAction = new PunchingActionState(actionInput);
  const targetPerimeter = new PunchingControlPerimeter(perimeterInput);
  assert.equal(targetConnection.schemaVersion, PUNCHING_CONNECTION_SCHEMA_VERSION);
  assert.equal(targetAction.schemaVersion, PUNCHING_ACTION_SCHEMA_VERSION);
  assert.equal(targetPerimeter.schemaVersion, PUNCHING_CONTROL_PERIMETER_SCHEMA_VERSION);
  assert.deepEqual(
    jsonValue(targetConnection.toJSON()),
    jsonValue(new BaselineConnection(connectionInput).toJSON()),
  );
  assert.deepEqual(
    jsonValue(targetAction.toJSON()),
    jsonValue(new BaselineAction(actionInput).toJSON()),
  );
  assert.deepEqual(
    jsonValue(targetPerimeter.toJSON()),
    jsonValue(new BaselinePerimeter(perimeterInput).toJSON()),
  );
});

void test("joint-action transfer reduction matches the pinned JavaScript baseline", () => {
  const input = {
    id: "ULS-resolved",
    connectionId: "contract",
    localFrameId: "contract:local-frame",
    combinationType: "ULS",
    units: { force: "kN", length: "m" } as const,
    referencePoint: { x: 0, y: 0, z: 0 },
    contributors: [
      {
        id: "column-below",
        kind: "column-end",
        side: "below",
        components: { fz: 1000, mx: 10, my: 20 },
      },
      {
        id: "column-above",
        kind: "column-end",
        side: "above",
        referencePoint: { x: 0.2, y: -0.1, z: 0 },
        components: { fz: -700, mx: -5, my: -8 },
      },
    ],
  };
  assert.deepEqual(
    jsonValue(resolvePunchingTransferFromJointActions(input).toJSON()),
    jsonValue(baselineResolveTransfer(input)),
  );
});

for (const edition of ["2004", "2023"] as const) {
  for (const reinforced of [false, true]) {
    void test(`EC2 ${edition} ${reinforced ? "reinforced" : "unreinforced"} punching matches the pinned JavaScript baseline`, () => {
      const input = verificationOptions({ edition, reinforced });
      assert.deepEqual(jsonValue(verifyPunching(input)), jsonValue(baselineVerifyPunching(input)));
    });
  }
}

void test("published unreinforced worked-example values remain fixed migration oracles", () => {
  const first = verifyPunching(verificationOptions({ edition: "2004" }));
  const firstState = (first.outputs.stateResults as unknown[])[0] as Record<string, unknown>;
  const firstPerimeters = firstState.perimeters as Record<string, unknown>;
  const firstDemands = firstState.demands as Record<string, unknown>;
  const firstResistance = first.outputs.resistance as Record<string, unknown>;
  assert.equal(first.status, "not-verified");
  assert.equal(numeric(firstPerimeters, "u0"), 1600);
  assert.ok(Math.abs(numeric(firstPerimeters, "u1") - 4741.593) < 0.001);
  assert.ok(Math.abs(numeric(firstDemands, "supportFace") - 3.464) < 0.001);
  assert.ok(Math.abs(numeric(firstDemands, "basicControlPerimeter") - 1.169) < 0.001);
  assert.ok(Math.abs(numeric(firstResistance, "vRdMax") - 5.28) < 0.001);
  assert.ok(Math.abs(numeric(firstResistance, "vRdc") - 0.61) < 0.005);

  const second = verifyPunching(verificationOptions({ edition: "2023" }));
  const secondState = (second.outputs.stateResults as unknown[])[0] as Record<string, unknown>;
  const secondPerimeters = secondState.perimeters as Record<string, unknown>;
  const secondDemands = secondState.demands as Record<string, unknown>;
  const secondResistance = second.outputs.resistance as Record<string, unknown>;
  assert.equal(second.status, "not-verified");
  assert.equal(numeric(secondPerimeters, "b0"), 2000);
  assert.ok(Math.abs(numeric(secondPerimeters, "b05") - 2879.646) < 0.001);
  assert.ok(Math.abs(numeric(secondDemands, "controlPerimeter") - 1.664) < 0.005);
  assert.equal(numeric(secondResistance, "dDg"), 40);
  assert.ok(Math.abs(numeric(secondResistance, "kpb") - 1.99) < 0.005);
  assert.ok(Math.abs(numeric(secondResistance, "tauRdc") - 1.51) < 0.01);
});

void test("application routing and request schema remain usable through the public API", () => {
  const input = verificationOptions({ edition: "2004" });
  const result = new ReinforcedConcretePunchingApplication().run({
    model: input,
  });
  assert.equal(PUNCHING_VERIFICATION_REQUEST_SCHEMA_VERSION, "rc-punching-verification-request/v0");
  assert.equal(result.applicationId, "reinforced-concrete-punching");
  assert.ok(result.checks.length > 0);
  assert.doesNotThrow(() => JSON.stringify(result.toJSON()));
});
