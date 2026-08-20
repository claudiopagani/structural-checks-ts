import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  externalAnchorPointFromDirectionAndLength,
  resolveArchReinforcements,
  type ArchReinforcementInput,
  type BondedLayerReinforcementInput,
  type MasonryArchModel,
  type MasonryInterfaceLawInput,
} from "structural-checks-ts/applications/masonry-arches";

const rigid: MasonryInterfaceLawInput = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
};

function model(
  id: string,
  voussoirCount: number,
  reinforcement?: ArchReinforcementInput,
  bondedLayer?: BondedLayerReinforcementInput,
): MasonryArchModel {
  return createMasonryArch({
    id,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "centerline",
      profile: { type: "circular" },
      span: 10,
      rise: 5,
      thickness: 1,
      outOfPlaneWidth: 1,
      voussoirCount,
    },
    interfaceLaw: rigid,
    reinforcements: reinforcement === undefined ? [] : [reinforcement],
    bondedLayers: bondedLayer === undefined ? [] : [bondedLayer],
  });
}

function activeOpenArchTendon(): ArchReinforcementInput {
  return {
    id: "T",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 100,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0.13 },
      right: { type: "arch-anchor", station: 0.87 },
      deviators: { type: "stations", deviators: [{ station: 0.5 }] },
    },
  };
}

function assertPointNear(
  actual: { readonly x: number; readonly y: number },
  expected: { readonly x: number; readonly y: number },
  tolerance = 1e-10,
): void {
  assert.ok(Math.abs(actual.x - expected.x) <= tolerance, `${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) <= tolerance, `${actual.y} != ${expected.y}`);
}

void test("external-anchor helper returns a physical point and validates its inputs", () => {
  assert.deepEqual(externalAnchorPointFromDirectionAndLength({ x: 1, y: 2 }, { x: 3, y: 4 }, 10), {
    x: 7,
    y: 10,
  });
  assert.throws(() => externalAnchorPointFromDirectionAndLength({ x: 0, y: 0 }, { x: 0, y: 0 }, 1));
  assert.throws(() => externalAnchorPointFromDirectionAndLength({ x: 0, y: 0 }, { x: 1, y: 0 }, 0));
  assert.throws(() =>
    externalAnchorPointFromDirectionAndLength({ x: Number.NaN, y: 0 }, { x: 1, y: 0 }, 1),
  );
});

void test("arch-anchor stations preserve physical points for 21, 41, and 81 voussoirs", () => {
  const states = [21, 41, 81].map(
    (count) =>
      resolveArchReinforcements(model(`arch-${count}`, count, activeOpenArchTendon()))
        .reinforcementState[0]!,
  );
  const baseline = states[0]!.devices;
  for (const state of states) {
    const stations = state.devices.map((device) => device.station!);
    assert.ok(Math.abs(stations[0]! - 0.13) <= 1e-14);
    assert.ok(Math.abs(stations[1]! - 0.5) <= 1e-14);
    assert.ok(Math.abs(stations[2]! - 0.87) <= 1e-14);
    state.devices.forEach((device, index) =>
      assertPointNear(device.referencePoint, baseline[index]!.referencePoint),
    );
  }
});

void test("external stations and fixed points preserve both free branches across meshes", () => {
  const reinforcement: ArchReinforcementInput = {
    id: "T",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 100,
    topology: {
      type: "open",
      left: { type: "external-anchor", station: 0.17, point: { x: -5.5, y: -2 } },
      right: { type: "external-anchor", station: 0.83, point: { x: 5.8, y: -1.5 } },
      deviators: { type: "stations", deviators: [{ station: 0.5 }] },
    },
  };
  const states = [21, 41, 81].map(
    (count) =>
      resolveArchReinforcements(model(`external-${count}`, count, reinforcement))
        .reinforcementState[0]!,
  );
  const baselineBranches = states[0]!.segments.filter(
    (segment) => segment.role === "free-terminal-branch",
  );
  for (const state of states) {
    const branches = state.segments.filter((segment) => segment.role === "free-terminal-branch");
    assert.equal(branches.length, 2);
    branches.forEach((branch, index) => {
      assertPointNear(branch.referenceStartPoint, baselineBranches[index]!.referenceStartPoint);
      assertPointNear(branch.referenceEndPoint, baselineBranches[index]!.referenceEndPoint);
    });
    assert.deepEqual(
      state.devices
        .filter((device) => device.kind === "arch-side-terminal")
        .map((device) => device.station),
      [0.17, 0.83],
    );
  }
});

void test("closed-loop return stations and straight return branch are mesh independent", () => {
  const reinforcement: ArchReinforcementInput = {
    id: "L",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 100,
    topology: {
      type: "closed-loop",
      leftReturnDeviator: { station: 0.18 },
      rightReturnDeviator: { station: 0.82 },
      deviators: { type: "stations", deviators: [{ station: 0.5 }] },
    },
  };
  const states = [21, 41, 81].map(
    (count) =>
      resolveArchReinforcements(model(`loop-${count}`, count, reinforcement))
        .reinforcementState[0]!,
  );
  const baselineReturn = states[0]!.segments.find((segment) => segment.role === "return-branch")!;
  for (const state of states) {
    const returnBranch = state.segments.find((segment) => segment.role === "return-branch")!;
    assertPointNear(returnBranch.referenceStartPoint, baselineReturn.referenceStartPoint);
    assertPointNear(returnBranch.referenceEndPoint, baselineReturn.referenceEndPoint);
    assert.deepEqual(
      state.devices
        .filter((device) => device.kind === "return-deviator")
        .map((device) => device.station),
      [0.18, 0.82],
    );
  }
});

void test("bonded effective interval is unchanged for 21, 41, and 81 voussoirs", () => {
  const layer: BondedLayerReinforcementInput = {
    id: "FRCM",
    family: "frcm",
    side: "intrados",
    area: 0.001,
    elasticModulus: 100_000_000,
    tensileStrength: 1000,
    startStation: 0.23,
    endStation: 0.74,
  };
  for (const count of [21, 41, 81]) {
    const normalized = model(`bonded-${count}`, count, undefined, layer).bondedLayers[0]!;
    assert.equal(normalized.startStation, 0.23);
    assert.equal(normalized.endStation, 0.74);
    assert.equal("extent" in normalized, false);
  }
});

function externalCompatibilityModel(branchLength: number, initialForce: number): MasonryArchModel {
  const probe = model("compatibility-probe", 21, {
    id: "P",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 0,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0.2 },
      right: { type: "arch-anchor", station: 0.8 },
      deviators: { type: "stations", deviators: [{ station: 0.5 }] },
    },
  });
  const probeDevices = resolveArchReinforcements(probe).reinforcementState[0]!.devices;
  const left = probeDevices[0]!.referencePoint;
  const right = probeDevices.at(-1)!.referencePoint;
  return model(`compatibility-${branchLength}-${initialForce}`, 21, {
    id: "T",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce,
    topology: {
      type: "open",
      left: {
        type: "external-anchor",
        station: 0.2,
        point: externalAnchorPointFromDirectionAndLength(left, { x: 0, y: -1 }, branchLength),
      },
      right: {
        type: "external-anchor",
        station: 0.8,
        point: externalAnchorPointFromDirectionAndLength(right, { x: 0, y: -1 }, branchLength),
      },
      deviators: { type: "stations", deviators: [{ station: 0.5 }] },
    },
  });
}

void test("longer external branches reduce active and passive incremental tendon stiffness", () => {
  for (const initialForce of [0, 100]) {
    const short = externalCompatibilityModel(1, initialForce);
    const long = externalCompatibilityModel(5, initialForce);
    const configuration = (arch: MasonryArchModel) => ({
      units: { force: "kN" as const, length: "m" as const },
      blockDisplacements: arch.geometry.voussoirs.map((block) => ({
        blockId: block.id,
        translation: { x: 0, y: 0.001 },
        rotation: 0,
      })),
    });
    const shortState = evaluateArchReinforcementConfiguration(short, configuration(short))
      .reinforcementState[0]!;
    const longState = evaluateArchReinforcementConfiguration(long, configuration(long))
      .reinforcementState[0]!;
    assert.ok(Math.abs(shortState.elongation - 0.002) <= 1e-10);
    assert.ok(Math.abs(longState.elongation - 0.002) <= 1e-10);
    assert.ok(longState.referenceLength > shortState.referenceLength);
    assert.ok(longState.elasticForceIncrement < shortState.elasticForceIncrement);
    assert.ok(
      Math.abs(
        shortState.elasticForceIncrement -
          (200_000_000 * 0.001 * 0.002) / shortState.referenceLength,
      ) <= 1e-8,
    );
    assert.ok(
      Math.abs(
        longState.elasticForceIncrement - (200_000_000 * 0.001 * 0.002) / longState.referenceLength,
      ) <= 1e-8,
    );
  }
});
