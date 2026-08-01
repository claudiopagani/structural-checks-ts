import {
  assertExplicitUnitSystem,
  createUnitResolver,
  type UnitResolver,
  type UnitSystemInput,
} from "../../units/UnitSystem.js";
import { PunchingActionState } from "./PunchingActionState.js";
import type {
  PunchingActionComponents,
  PunchingActionComponentsInput,
  PunchingJointContributor,
  PunchingPoint3D,
  ResolvePunchingTransferOptions,
} from "./types.js";

const INTERNAL_UNITS = Object.freeze({
  force: "N",
  length: "mm",
}) satisfies UnitSystemInput;

function finite(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value as number;
}

function normalizeReferencePoint(
  input: Partial<PunchingPoint3D> | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingPoint3D {
  return {
    x: resolver.length(finite(Number(input?.x ?? 0), `${label}.x`)),
    y: resolver.length(finite(Number(input?.y ?? 0), `${label}.y`)),
    z: resolver.length(finite(Number(input?.z ?? 0), `${label}.z`)),
  };
}

function normalizeComponents(
  input: PunchingActionComponentsInput | undefined,
  resolver: UnitResolver,
  label: string,
): PunchingActionComponents {
  for (const key of ["fx", "fy", "mz"] as const) {
    if (input?.[key] == null) {
      continue;
    }
    const value = finite(Number(input[key]), `${label}.${key}`);
    if (Math.abs(value) > 0) {
      throw new Error(`${label}.${key} is outside the punching transfer contract.`);
    }
  }

  return {
    fz: resolver.force(finite(Number(input?.fz ?? 0), `${label}.fz`)),
    mx: resolver.moment(finite(Number(input?.mx ?? 0), `${label}.mx`)),
    my: resolver.moment(finite(Number(input?.my ?? 0), `${label}.my`)),
  };
}

function reduceToReference(
  components: PunchingActionComponents,
  from: PunchingPoint3D,
  to: PunchingPoint3D,
): PunchingActionComponents {
  const deltaX = from.x - to.x;
  const deltaY = from.y - to.y;
  return {
    fz: components.fz,
    mx: components.mx + deltaY * components.fz,
    my: components.my - deltaX * components.fz,
  };
}

function sumComponents(items: readonly PunchingJointContributor[]): PunchingActionComponents {
  return items.reduce(
    (sum, item) => ({
      fz: sum.fz + item.reducedComponents.fz,
      mx: sum.mx + item.reducedComponents.mx,
      my: sum.my + item.reducedComponents.my,
    }),
    { fz: 0, mx: 0, my: 0 },
  );
}

export function resolvePunchingTransferFromJointActions({
  id,
  connectionId,
  localFrameId = null,
  combinationType = null,
  units = null,
  referencePoint = {},
  contributors = [],
  metadata = {},
}: ResolvePunchingTransferOptions = {}): PunchingActionState {
  if (!id) {
    throw new Error("A resolved punching action state id is required.");
  }
  if (!connectionId) {
    throw new Error("Joint equilibrium requires a connectionId.");
  }
  if (!Array.isArray(contributors) || contributors.length === 0) {
    throw new Error("Joint equilibrium requires at least one non-slab action contributor.");
  }

  assertExplicitUnitSystem(units, "resolvePunchingTransferFromJointActions");
  const resolver = createUnitResolver(units, INTERNAL_UNITS);
  const target = normalizeReferencePoint(referencePoint, resolver, "referencePoint");
  const normalizedContributors: PunchingJointContributor[] = contributors.map(
    (contributor, index) => {
      if (!contributor?.id) {
        throw new Error(`contributors[${index}].id is required.`);
      }
      const sourcePoint = normalizeReferencePoint(
        contributor.referencePoint,
        resolver,
        `contributors[${index}].referencePoint`,
      );
      const components = normalizeComponents(
        contributor.components,
        resolver,
        `contributors[${index}].components`,
      );
      return {
        id: contributor.id,
        kind: contributor.kind ?? "non-slab-action",
        side: contributor.side ?? null,
        referencePoint: sourcePoint,
        components,
        reducedComponents: reduceToReference(components, sourcePoint, target),
        metadata: { ...(contributor.metadata ?? {}) },
      };
    },
  );
  const transfer = sumComponents(normalizedContributors);
  const slabActionOnJoint = {
    fz: -transfer.fz,
    mx: -transfer.mx,
    my: -transfer.my,
  };

  return new PunchingActionState({
    id,
    connectionId,
    localFrameId,
    combinationType,
    units: INTERNAL_UNITS,
    referencePoint: target,
    components: transfer,
    source: {
      method: "joint-equilibrium",
      inputConvention: "each contributor is the action exerted on the joint by a non-slab entity",
      outputConvention: "the resolved state is the equal action exerted by the joint on the slab",
      contributors: normalizedContributors,
      balance: {
        nonSlabActionsOnJoint: { ...transfer },
        slabActionOnJoint,
        residual: { fz: 0, mx: 0, my: 0 },
      },
    },
    metadata,
  });
}
