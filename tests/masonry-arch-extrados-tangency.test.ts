import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  externalAnchorPointFromExtradosTangency,
  extradosTangencyStationFromAngle,
  resolveArchReinforcements,
  resolveExtradosTangentAtStation,
  type MasonryArchModel,
  type MasonryArchPrescribedConfigurationInput,
  type SimplifiedSymmetricMasonryArchGeometryInput,
} from "structural-checks-ts/applications/masonry-arches";

const rigid = {
  response: "rigid-plastic",
  normal: { type: "no-tension" },
  tangential: { type: "frictionless" },
} as const;

function geometryModel(
  id: string,
  geometry: SimplifiedSymmetricMasonryArchGeometryInput,
): MasonryArchModel {
  return createMasonryArch({
    id,
    units: { force: "kN", length: "m" },
    geometry,
    interfaceLaw: rigid,
  });
}

const semicircleGeometry = {
  kind: "simplified-symmetric",
  referenceCurve: "centerline",
  profile: { type: "circular" },
  span: 10,
  rise: 5,
  thickness: 1,
  outOfPlaneWidth: 1,
  voussoirCount: 21,
} as const satisfies SimplifiedSymmetricMasonryArchGeometryInput;

function cableModel(
  id: string,
  geometryInput: SimplifiedSymmetricMasonryArchGeometryInput,
  options: {
    readonly leftStation?: number;
    readonly rightStation?: number;
    readonly branchLength?: number;
    readonly segmentCount?: number;
    readonly initialForce?: number;
    readonly area?: number;
  } = {},
): {
  readonly model: MasonryArchModel;
  readonly anchors: readonly [{ x: number; y: number }, { x: number; y: number }];
} {
  const probe = geometryModel(`${id}-geometry`, geometryInput);
  const leftStation = options.leftStation ?? 0.2;
  const rightStation = options.rightStation ?? 0.8;
  const branchLength = options.branchLength ?? 2;
  const left = externalAnchorPointFromExtradosTangency(
    probe.geometry,
    "left",
    leftStation,
    branchLength,
  );
  const right = externalAnchorPointFromExtradosTangency(
    probe.geometry,
    "right",
    rightStation,
    branchLength,
  );
  return {
    anchors: [left, right],
    model: createMasonryArch({
      id,
      units: { force: "kN", length: "m" },
      geometry: geometryInput,
      interfaceLaw: rigid,
      reinforcements: [
        {
          id: "E",
          side: "extrados",
          area: options.area ?? 0.001,
          elasticModulus: 200_000_000,
          initialForce: options.initialForce ?? 80,
          topology: {
            type: "open",
            left: { type: "external-anchor", point: left },
            right: { type: "external-anchor", point: right },
            interaction: { type: "unilateral-contact", segmentCount: options.segmentCount ?? 32 },
          },
        },
      ],
    }),
  };
}

function pointError(
  actual: { readonly x: number; readonly y: number },
  expected: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(actual.x - expected.x, actual.y - expected.y);
}

function unit(vector: { readonly x: number; readonly y: number }) {
  const length = Math.hypot(vector.x, vector.y);
  return { x: vector.x / length, y: vector.y / length };
}

function cross(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return left.x * right.y - left.y * right.x;
}

function uniformVerticalConfiguration(
  model: MasonryArchModel,
  translationY: number,
): MasonryArchPrescribedConfigurationInput {
  return {
    units: { force: "kN", length: "m" },
    blockDisplacements: model.geometry.voussoirs.map((block) => ({
      blockId: block.id,
      translation: { x: 0, y: translationY },
      rotation: 0,
    })),
  };
}

void test("circular extrados tangent and anchor helpers match an independent semicircle oracle", () => {
  const geometry = geometryModel("circle-helper", semicircleGeometry).geometry;
  const radius = 5.5;

  const leftSpringing = resolveExtradosTangentAtStation(geometry, "left", 0);
  assert.ok(pointError(leftSpringing.point, { x: -radius, y: 0 }) <= 1e-12);
  assert.ok(pointError(leftSpringing.chainTangent, { x: 0, y: 1 }) <= 1e-12);
  assert.ok(pointError(leftSpringing.outwardTangent, { x: 0, y: -1 }) <= 1e-12);
  const leftAnchor = externalAnchorPointFromExtradosTangency(geometry, "left", 0, 2);
  assert.ok(pointError(leftAnchor, { x: -radius, y: -2 }) <= 1e-12);

  const crownLeft = resolveExtradosTangentAtStation(geometry, "left", 0.5);
  const crownRight = resolveExtradosTangentAtStation(geometry, "right", 0.5);
  assert.ok(pointError(crownLeft.point, { x: 0, y: radius }) <= 1e-12);
  assert.ok(pointError(crownLeft.outwardTangent, { x: -1, y: 0 }) <= 1e-12);
  assert.ok(pointError(crownRight.outwardTangent, { x: 1, y: 0 }) <= 1e-12);

  const rightSpringing = resolveExtradosTangentAtStation(geometry, "right", 1);
  assert.ok(pointError(rightSpringing.point, { x: radius, y: 0 }) <= 1e-12);
  assert.ok(pointError(rightSpringing.chainTangent, { x: 0, y: -1 }) <= 1e-12);
  assert.ok(pointError(rightSpringing.outwardTangent, { x: 0, y: -1 }) <= 1e-12);

  const station = 0.2;
  const parameter = -Math.PI / 2 + Math.PI * station;
  const expectedPoint = { x: radius * Math.sin(parameter), y: radius * Math.cos(parameter) };
  const expectedChainTangent = { x: Math.cos(parameter), y: -Math.sin(parameter) };
  const expectedOutward = { x: -expectedChainTangent.x, y: -expectedChainTangent.y };
  const intermediate = resolveExtradosTangentAtStation(geometry, "left", station);
  assert.ok(pointError(intermediate.point, expectedPoint) <= 2e-12);
  assert.ok(pointError(intermediate.chainTangent, expectedChainTangent) <= 2e-12);
  assert.ok(pointError(intermediate.outwardTangent, expectedOutward) <= 2e-12);
  const expectedAnchor = {
    x: expectedPoint.x + 3 * expectedOutward.x,
    y: expectedPoint.y + 3 * expectedOutward.y,
  };
  assert.ok(
    pointError(
      externalAnchorPointFromExtradosTangency(geometry, "left", station, 3),
      expectedAnchor,
    ) <= 3e-12,
  );

  for (const [side, value] of [
    ["left", 0.02],
    ["left", 0.2],
    ["right", 0.8],
    ["right", 0.98],
  ] as const) {
    const tangent = resolveExtradosTangentAtStation(geometry, side, value);
    assert.ok(
      Math.abs(
        extradosTangencyStationFromAngle(geometry, side, tangent.outwardTangentAngle) - value,
      ) <= 2e-12,
    );
  }
});

function simpson(
  functionValue: (parameter: number) => number,
  start: number,
  end: number,
  subdivisions = 32_768,
): number {
  const count = subdivisions % 2 === 0 ? subdivisions : subdivisions + 1;
  const step = (end - start) / count;
  let sum = functionValue(start) + functionValue(end);
  for (let index = 1; index < count; index += 1) {
    sum += (index % 2 === 0 ? 2 : 4) * functionValue(start + index * step);
  }
  return (sum * step) / 3;
}

function ellipseParameterAtArcStation(
  semiAxisX: number,
  semiAxisY: number,
  halfParameter: number,
  station: number,
): number {
  const speed = (parameter: number) =>
    Math.hypot(semiAxisX * Math.cos(parameter), semiAxisY * Math.sin(parameter));
  const total = simpson(speed, -halfParameter, halfParameter);
  let lower = -halfParameter;
  let upper = halfParameter;
  for (let iteration = 0; iteration < 56; iteration += 1) {
    const trial = (lower + upper) / 2;
    if (simpson(speed, -halfParameter, trial, 4096) < station * total) lower = trial;
    else upper = trial;
  }
  return (lower + upper) / 2;
}

void test("flat and high ellipse helpers match independent analytical derivatives", () => {
  for (const [id, span, rise, stations] of [
    ["flat", 10, 2, [0.01, 0.27, 0.73, 0.99]],
    ["high", 4, 5, [0.03, 0.31, 0.69, 0.97]],
  ] as const) {
    const geometry = geometryModel(`${id}-ellipse-helper`, {
      kind: "simplified-symmetric",
      referenceCurve: "extrados",
      profile: { type: "elliptical", springingAngle: 90, angleUnits: "deg" },
      span,
      rise,
      thickness: 0.1,
      outOfPlaneWidth: 1,
      voussoirCount: 25,
    }).geometry;
    assert.equal(geometry.profile.type, "elliptical");
    const { semiAxisX: a, semiAxisY: b, halfParameter } = geometry.profile;
    for (const station of stations) {
      const side = station < 0.5 ? "left" : "right";
      const parameter = ellipseParameterAtArcStation(a, b, halfParameter, station);
      const expectedPoint = {
        x: a * Math.sin(parameter),
        y: b * Math.cos(parameter) - b * Math.cos(halfParameter),
      };
      const derivative = unit({ x: a * Math.cos(parameter), y: -b * Math.sin(parameter) });
      const expectedOutward = side === "left" ? { x: -derivative.x, y: -derivative.y } : derivative;
      const actual = resolveExtradosTangentAtStation(geometry, side, station);
      assert.ok(pointError(actual.point, expectedPoint) <= 2e-10, `${id} point at ${station}`);
      assert.ok(
        pointError(actual.outwardTangent, expectedOutward) <= 2e-10,
        `${id} tangent at ${station}`,
      );
      for (const branchLength of [0.2, 10]) {
        const expectedAnchor = {
          x: expectedPoint.x + branchLength * expectedOutward.x,
          y: expectedPoint.y + branchLength * expectedOutward.y,
        };
        assert.ok(
          pointError(
            externalAnchorPointFromExtradosTangency(geometry, side, station, branchLength),
            expectedAnchor,
          ) <= 3e-10,
        );
      }
      assert.ok(
        Math.abs(
          extradosTangencyStationFromAngle(geometry, side, actual.outwardTangentAngle) - station,
        ) <= 3e-11,
      );
    }
  }
});

void test("reference contact recovers the requested tangency and removes the old terminal kink", () => {
  const { model, anchors } = cableModel("reference-tangency", semicircleGeometry, {
    leftStation: 0.2,
    rightStation: 0.8,
    branchLength: 2,
    segmentCount: 24,
  });
  const resolved = resolveArchReinforcements(model);
  const state = resolved.reinforcementState[0]!;
  const interval = state.contactBoundary!.reference!;
  assert.ok(Math.abs(interval.start.normalizedSideArcStation - 0.2) <= 3e-11);
  assert.ok(Math.abs(interval.end.normalizedSideArcStation - 0.8) <= 3e-11);
  assert.equal(interval.start.kind, "smooth-tangency");
  assert.equal(interval.end.kind, "smooth-tangency");
  assert.deepEqual(
    state.devices.map((device) => device.kind),
    ["external-anchor", "external-anchor"],
  );
  assert.equal(state.devices.filter((device) => device.kind === "arch-side-terminal").length, 0);
  assert.equal(
    resolved.deviceForces.filter((device) => device.kind === "arch-side-terminal").length,
    0,
  );

  const firstBranch = state.segments[0]!;
  const lastBranch = state.segments.at(-1)!;
  const firstDirection = unit({
    x: firstBranch.endPoint.x - firstBranch.startPoint.x,
    y: firstBranch.endPoint.y - firstBranch.startPoint.y,
  });
  const lastDirection = unit({
    x: lastBranch.endPoint.x - lastBranch.startPoint.x,
    y: lastBranch.endPoint.y - lastBranch.startPoint.y,
  });
  const leftParameter = -Math.PI / 2 + Math.PI * interval.start.normalizedSideArcStation;
  const rightParameter = -Math.PI / 2 + Math.PI * interval.end.normalizedSideArcStation;
  const leftAnalyticalTangent = { x: Math.cos(leftParameter), y: -Math.sin(leftParameter) };
  const rightAnalyticalTangent = { x: Math.cos(rightParameter), y: -Math.sin(rightParameter) };
  assert.ok(Math.abs(cross(firstDirection, leftAnalyticalTangent)) <= 2e-11);
  assert.ok(Math.abs(cross(lastDirection, rightAnalyticalTangent)) <= 2e-11);
  assert.ok(
    Math.abs(
      cross(
        {
          x: interval.start.referencePoint.x - anchors[0].x,
          y: interval.start.referencePoint.y - anchors[0].y,
        },
        leftAnalyticalTangent,
      ),
    ) <= 4e-11,
  );
  assert.ok(
    Math.abs(
      cross(
        {
          x: interval.end.referencePoint.x - anchors[1].x,
          y: interval.end.referencePoint.y - anchors[1].y,
        },
        rightAnalyticalTangent,
      ),
    ) <= 4e-11,
  );
  assert.equal(state.equilibrium.satisfied, true);
});

void test("a mixed external/arch extrados cable solves contact without a hidden terminal", () => {
  const probe = geometryModel("mixed-extrados-geometry", semicircleGeometry);
  const leftPoint = externalAnchorPointFromExtradosTangency(probe.geometry, "left", 0.2, 2);
  const model = createMasonryArch({
    id: "mixed-extrados",
    units: { force: "kN", length: "m" },
    geometry: semicircleGeometry,
    interfaceLaw: rigid,
    reinforcements: [
      {
        id: "E",
        side: "extrados",
        area: 0.001,
        elasticModulus: 200_000_000,
        initialForce: 80,
        topology: {
          type: "open",
          left: { type: "external-anchor", point: leftPoint },
          right: { type: "arch-anchor", station: 0.8 },
          interaction: { type: "unilateral-contact", segmentCount: 32 },
        },
      },
    ],
  });
  const resolved = resolveArchReinforcements(model);
  const state = resolved.reinforcementState[0]!;
  assert.equal(state.contactBoundary!.reference!.start.kind, "smooth-tangency");
  assert.equal(state.contactBoundary!.reference!.end.kind, "arch-anchor");
  assert.deepEqual(
    state.devices.map((device) => device.kind),
    ["external-anchor", "terminal-arch-anchor"],
  );
  assert.equal(resolved.externalAnchorForces.length, 1);
  assert.equal(
    resolved.deviceForces.some((device) => device.kind === "arch-side-terminal"),
    false,
  );
  assert.equal(state.equilibrium.satisfied, true);
});

void test("elliptical external cables recover near-springing tangency for short and long branches", () => {
  const geometryInput = {
    kind: "simplified-symmetric",
    referenceCurve: "extrados",
    profile: { type: "elliptical", springingAngle: 90, angleUnits: "deg" },
    span: 10,
    rise: 2,
    thickness: 0.1,
    outOfPlaneWidth: 1,
    voussoirCount: 25,
  } as const satisfies SimplifiedSymmetricMasonryArchGeometryInput;
  for (const branchLength of [0.2, 10]) {
    const { model } = cableModel(`ellipse-branch-${branchLength}`, geometryInput, {
      leftStation: 0.03,
      rightStation: 0.97,
      branchLength,
      segmentCount: 32,
    });
    const resolved = resolveArchReinforcements(model);
    const interval = resolved.reinforcementState[0]!.contactBoundary!.reference!;
    assert.ok(Math.abs(interval.start.normalizedSideArcStation - 0.03) <= 5e-10);
    assert.ok(Math.abs(interval.end.normalizedSideArcStation - 0.97) <= 5e-10);
    assert.equal(interval.start.kind, "smooth-tangency");
    assert.equal(interval.end.kind, "smooth-tangency");
    assert.equal(resolved.reinforcementState[0]!.equilibrium.satisfied, true);
  }
});

void test("contact migrates while external anchors remain fixed for active and passive cables", () => {
  let activeGeometry:
    | {
        readonly referenceStart: number;
        readonly referenceEnd: number;
        readonly currentStart: number;
        readonly currentEnd: number;
        readonly referenceLength: number;
        readonly currentLength: number;
      }
    | undefined;
  for (const initialForce of [80, 0]) {
    const { model, anchors } = cableModel(`migration-${initialForce}`, semicircleGeometry, {
      initialForce,
      segmentCount: 32,
    });
    const evaluated = evaluateArchReinforcementConfiguration(
      model,
      uniformVerticalConfiguration(model, 0.1),
    );
    const state = evaluated.reinforcementState[0]!;
    const boundary = state.contactBoundary!;
    assert.ok(boundary.reference !== null && boundary.current !== null);
    assert.ok(
      Math.abs(
        boundary.current.start.normalizedSideArcStation -
          boundary.reference.start.normalizedSideArcStation,
      ) > 0.005,
    );
    assert.ok(
      Math.abs(
        boundary.current.end.normalizedSideArcStation -
          boundary.reference.end.normalizedSideArcStation,
      ) > 0.005,
    );
    const externalDevices = state.devices.filter((device) => device.kind === "external-anchor");
    assert.equal(externalDevices.length, 2);
    assert.ok(pointError(externalDevices[0]!.referencePoint, anchors[0]) <= 1e-14);
    assert.ok(pointError(externalDevices[0]!.point, anchors[0]) <= 1e-14);
    assert.ok(pointError(externalDevices[1]!.referencePoint, anchors[1]) <= 1e-14);
    assert.ok(pointError(externalDevices[1]!.point, anchors[1]) <= 1e-14);
    const expected = Math.max(
      0,
      initialForce +
        (200_000_000 * 0.001 * (state.currentLength - state.referenceLength)) /
          state.referenceLength,
    );
    assert.ok(Math.abs(state.force - expected) <= 1e-9 * Math.max(1, expected));
    assert.equal(state.state, initialForce === 0 ? "active-passive" : "active-post-tensioned");
    assert.equal(state.equilibrium.satisfied, true);
    assert.ok(state.equilibrium.normalizedResidual.force <= 1e-12);
    assert.ok(state.equilibrium.normalizedResidual.moment <= 1e-12);
    const contactGeometry = {
      referenceStart: boundary.reference.start.normalizedSideArcStation,
      referenceEnd: boundary.reference.end.normalizedSideArcStation,
      currentStart: boundary.current.start.normalizedSideArcStation,
      currentEnd: boundary.current.end.normalizedSideArcStation,
      referenceLength: state.referenceLength,
      currentLength: state.currentLength,
    };
    if (activeGeometry === undefined) activeGeometry = contactGeometry;
    else assert.deepEqual(contactGeometry, activeGeometry, "active and passive contact geometry");
  }
});

void test("a taut external cable may detach fully without a false contact failure", () => {
  const { model, anchors } = cableModel("full-detachment", semicircleGeometry, {
    initialForce: 80,
    area: 1e-6,
    segmentCount: 32,
  });
  const evaluated = evaluateArchReinforcementConfiguration(
    model,
    uniformVerticalConfiguration(model, -4),
  );
  const state = evaluated.reinforcementState[0]!;
  const directLength = Math.hypot(anchors[1].x - anchors[0].x, anchors[1].y - anchors[0].y);
  assert.equal(state.contactBoundary!.current, null);
  assert.deepEqual(evaluated.contactForces, []);
  assert.equal(state.path.length, 2);
  assert.ok(Math.abs(state.currentLength - directLength) <= 1e-12);
  assert.ok(state.force > 0, "the detached cable remains taut under the assigned tension-only law");
  assert.equal(evaluated.hasInvalidContact, false);
  assert.equal(state.equilibrium.satisfied, true);
  assert.ok(state.equilibrium.normalizedResidual.force <= 1e-12);
  assert.ok(state.equilibrium.normalizedResidual.moment <= 1e-12);
});

void test("a moved voussoir corner is reported as contact, never as a device", () => {
  const { model } = cableModel("joint-contact", semicircleGeometry, {
    initialForce: 80,
    area: 1e-6,
    segmentCount: 32,
  });
  const movedBlock = model.geometry.voussoirs[3]!;
  const evaluated = evaluateArchReinforcementConfiguration(model, {
    units: { force: "kN", length: "m" },
    blockDisplacements: [{ blockId: movedBlock.id, translation: { x: 0, y: 0.1 }, rotation: 0 }],
  });
  const state = evaluated.reinforcementState[0]!;
  assert.equal(state.contactBoundary!.current!.start.kind, "joint-contact");
  const firstContact = evaluated.contactForces[0]!;
  assert.equal(firstContact.contactKind, "joint-contact");
  assert.equal(firstContact.state, "in-contact");
  assert.ok(Math.hypot(firstContact.resultantForce.x, firstContact.resultantForce.y) > 0);
  assert.equal(
    evaluated.deviceForces.some((device) => device.kind === "arch-side-terminal"),
    false,
  );
  assert.equal(state.equilibrium.satisfied, true);
});

void test("continuous contact boundaries and compatibility converge with contact segment count", () => {
  const flatEllipse = {
    kind: "simplified-symmetric",
    referenceCurve: "extrados",
    profile: { type: "elliptical", springingAngle: 90, angleUnits: "deg" },
    span: 10,
    rise: 2,
    thickness: 0.1,
    outOfPlaneWidth: 1,
    voussoirCount: 25,
  } as const satisfies SimplifiedSymmetricMasonryArchGeometryInput;

  for (const [profile, geometryInput, boundaryTolerance] of [
    ["circle", semicircleGeometry, 3e-11],
    ["ellipse", flatEllipse, 5e-10],
  ] as const) {
    const rows = [16, 32, 64, 128].map((segmentCount) => {
      const { model } = cableModel(`${profile}-convergence-${segmentCount}`, geometryInput, {
        segmentCount,
        initialForce: 80,
        area: 1e-6,
      });
      const evaluated = evaluateArchReinforcementConfiguration(
        model,
        uniformVerticalConfiguration(model, 0.1),
      );
      const state = evaluated.reinforcementState[0]!;
      const contactResultant = evaluated.contactForces.reduce(
        (sum, contact) => ({
          x: sum.x + contact.resultantForce.x,
          y: sum.y + contact.resultantForce.y,
        }),
        { x: 0, y: 0 },
      );
      return {
        segmentCount,
        start: state.contactBoundary!.current!.start.normalizedSideArcStation,
        end: state.contactBoundary!.current!.end.normalizedSideArcStation,
        referenceLength: state.referenceLength,
        currentLength: state.currentLength,
        tension: state.force,
        contactResultant: Math.hypot(contactResultant.x, contactResultant.y),
        maximumTangentialContactRatio: Math.max(
          ...evaluated.contactForces
            .filter((contact) => contact.contactKind === "smooth-contact")
            .map((contact) => Math.abs(contact.tangentialComponent) / Math.max(1, state.force)),
        ),
        residual: Math.max(
          state.equilibrium.normalizedResidual.force,
          state.equilibrium.normalizedResidual.moment,
        ),
      };
    });
    for (const row of rows) {
      assert.ok(Math.abs(row.start - rows.at(-1)!.start) <= boundaryTolerance);
      assert.ok(Math.abs(row.end - rows.at(-1)!.end) <= boundaryTolerance);
      assert.ok(row.residual <= 1e-12);
    }
    assert.ok(
      Math.abs(rows[3]!.referenceLength - rows[2]!.referenceLength) <
        Math.abs(rows[1]!.referenceLength - rows[0]!.referenceLength),
      `${profile} reference length: ${JSON.stringify(rows)}`,
    );
    assert.ok(
      Math.abs(rows[3]!.currentLength - rows[2]!.currentLength) <
        Math.abs(rows[1]!.currentLength - rows[0]!.currentLength),
      `${profile} current length: ${JSON.stringify(rows)}`,
    );
    const isConvergentOrAlreadyStable = (values: readonly number[]) => {
      const scale = Math.max(1, ...values.map(Math.abs));
      const spread = Math.max(...values) - Math.min(...values);
      return (
        Math.abs(values[3]! - values[2]!) < Math.abs(values[1]! - values[0]!) ||
        spread <= 5e-6 * scale
      );
    };
    assert.ok(
      isConvergentOrAlreadyStable(rows.map((row) => row.tension)),
      `${profile} tension: ${JSON.stringify(rows)}`,
    );
    assert.ok(
      isConvergentOrAlreadyStable(rows.map((row) => row.contactResultant)),
      `${profile} contact resultant: ${JSON.stringify(rows)}`,
    );
    assert.ok(rows[3]!.maximumTangentialContactRatio < rows[0]!.maximumTangentialContactRatio);
    assert.ok(
      rows[3]!.maximumTangentialContactRatio <= 1e-4,
      `${profile}: ${JSON.stringify(rows)}`,
    );
  }
});

void test("geometry helper validation rejects invalid stations, lengths, and side angles", () => {
  const geometry = geometryModel("helper-validation", semicircleGeometry).geometry;
  assert.throws(() => resolveExtradosTangentAtStation(geometry, "left", Number.NaN), /finite/);
  assert.throws(() => resolveExtradosTangentAtStation(geometry, "left", -0.01), /0 <= station/);
  assert.throws(
    () => externalAnchorPointFromExtradosTangency(geometry, "right", 0.8, 0),
    /positive/,
  );
  assert.throws(
    () => extradosTangencyStationFromAngle(geometry, "left", 0),
    /outside the admissible left-side range/,
  );
});
