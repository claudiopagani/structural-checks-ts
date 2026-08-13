# Masonry arch analysis

Status: implemented software model; no normative conformity is claimed.

This module models a two-dimensional chain of rigid voussoirs. Its API deliberately separates:

1. the mechanical model;
2. the engineering objective;
3. the numerical continuation strategy.

There are no compatibility routers or mode flags. Use exactly one analysis function:

- `analyzeMasonryArchEquilibrium` for an assigned rigid-plastic equilibrium;
- `analyzeMasonryArchLimit` for direct rigid-plastic limit analysis;
- `analyzeMasonryArchPath` for a deformable-interface equilibrium path.

## Mechanical model

`createMasonryArch` requires a solver-neutral `interfaceLaw`. Interface laws live in the general
masonry domain because the same zero-thickness laws can be assembled by wall micromodels or other
masonry applications.

```ts
import { createMasonryArch } from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const arch = createMasonryArch({
  id: "arch",
  units: { force: "kN", length: "m" },
  geometry: {
    kind: "simplified-symmetric",
    referenceCurve: "centerline",
    profile: { type: "circular" },
    span: 10,
    rise: 5,
    thickness: 1,
    outOfPlaneWidth: 1,
    voussoirCount: 21,
  },
  masonry: { unitWeight: 20 },
  interfaceLaw: {
    response: "deformable",
    normal: {
      type: "elastic-no-tension",
      elasticModulus: 1_000_000,
      characteristicLength: 0.5,
      compressiveStrength: 1_000,
      postCrushingBehavior: "perfectly-plastic",
    },
    tangential: {
      type: "elastic-coulomb",
      shearModulus: 400_000,
      characteristicLength: 0.5,
      frictionCoefficient: 0.5,
      flowRule: { type: "non-associated", dilationAngle: 0 },
    },
  },
  loads: [
    { id: "SW", type: "self-weight", loadCaseId: "G1" },
    {
      id: "Q",
      type: "point",
      loadCaseId: "Q1",
      station: 0.5,
      force: { x: 0, y: -10 },
    },
  ],
});
```

Rigid-plastic laws use `response: "rigid-plastic"`, a no-tension normal component with optional
finite compression strength, and either a frictionless or Coulomb tangential component. Deformable
laws require explicit normal and shear stiffness data. `stop-at-onset` makes compression-strength
onset terminal; `perfectly-plastic` permits continued path following.

Support interfaces may override the interior law through `supports.left.interfaceLaw` and
`supports.right.interfaceLaw`.

## Engineering objectives

Path analyses require one explicit objective:

```ts
type MasonryArchAnalysisObjective = "design-state-check" | "capacity" | "advanced-path";
```

The objective does not select the constitutive law or redefine the numerical control.

### Design-state check

The engineering question is: can the system reach `lambda = 1` along an admissible converged
equilibrium path while satisfying the prescribed criteria?

- `PASS`: the converged design state was reached and the criteria are satisfied;
- `FAIL`: a physical or mechanical criterion was identified as not satisfied;
- `INDETERMINATE`: the numerical process could not establish either answer.

Loss of convergence is never interpreted as failure or collapse. The default strategy is adaptive
load control with `targetLambda: 1`.

### Capacity and advanced path

`capacity` defaults to spherical arc length. `advanced-path` requires the caller to choose an
explicit control. The result uses four distinct landmarks:

- `lambdaFirstLimit`: first event classified as an engineering or terminal physical limit;
- `lambdaPeak`: maximum lambda on the actually followed branch;
- `lambdaTermination`: lambda of the last converged state;
- `lambdaCollapse`: present only when the model and algorithm identify collapse using the reported
  `collapseDefinition`.

The associated step numbers are in `capacity.steps`. Numerical failure never populates
`lambdaCollapse`.

## Load proportionality

For every limit or path analysis, combination factors are applied first. The analysis then creates
its own fixed/scalable partition:

```text
F(lambda) = F_fixed + lambda * F_scalable
```

The load model does not retain a scalable role. This supports `G + lambda Q`, `lambda (G + Q)`,
`G1 + lambda (G2 + Q1)`, and any explicit set of simultaneous scalable load cases.

`lambda = 1` means the complete base factored combination. Lambda is a load coordinate, not a safety
factor. It never automatically scales initial tendon force, passive-tendon compatibility force,
reactions, contacts, deviator actions, or other solved response quantities.

Every result stores the fixed and scalable case IDs, base and effective factors, current lambda, the
meaning of lambda one, the engineering objective, mechanical response, and numerical method.

## Continuation controls

The continuation contracts and `NonlinearEquilibriumContinuationSolver` live in
`domain/solvers/continuation`. The solver is mechanics-independent: callers provide the residual
`R(q, lambda)`, tangent, scalable-load derivative, and explicit coordinate/residual scales. The arch
application supplies those quantities and binds generic degrees of freedom to
`{ blockId, component }`; it retains only arch assembly, event classification, and engineering
termination policy.

```ts
const displacementControl = {
  type: "displacement" as const,
  dof: { blockId: "V-010", component: "y" as const },
  increment: -0.0001,
  target: -0.003,
};
```

Displacement control always requires a real caller-selected degree of freedom. The crown vertical
translation is never assumed. Spherical arc length uses

```text
sqrt(mean((Delta u_i / uScale_i)^2) + (loadScale Delta lambda)^2) = radius
```

so `loadScale` weights the dimensionless load coordinate relative to normalized displacement
coordinates. No automatic load-to-arc-length switching occurs within one analysis.

## Events and termination

Events are classified as `observable-event`, `warning`, `engineering-limit`,
`terminal-physical-event`, or `numerical-failure`. Joint opening/closure, passive tendon activation,
and ordinary extrados contact active-set changes are observable, not collapse. Sliding, compression
strength, reinforcement and anchor limits retain their explicit physical classification. A normal
active-set change does not terminate the path.

## Step-coherent states

Every converged `MasonryArchPathStep` owns one complete `state` containing lambda, effective load
factors, block translations and rotations, interface resultants and openings, thrust line,
reinforcement and bonded-layer states, updated tendon/contact geometry, reactions, and equilibrium
residuals. No duplicated top-level final configuration exists.

Use `getMasonryArchPathStep`, `getMasonryArchPathState`, or
`getMasonryArchSignificantStep(..., "design-state" | "first-limit" | "peak" | "last-converged")`.

## Deformation and mechanism

A `deformedConfiguration` exists only in a converged deformable-path step and has physical units. A
`collapseMechanism` exists only in direct rigid-plastic limit analysis when coherent kinematics are
verified; it is normalized and has arbitrary amplitude. Assigned static equilibrium never returns a
synthetic deformation. Finite-compression onset without verified velocity kinematics reports
critical interfaces and compression zones but no mechanism.

## Scope and traceability

The implementation is two-dimensional and solver-neutral. It does not claim legal or normative
conformity. Historical derivation and source revision remain recorded in Decision 0003 and migration
evidence; the current architecture is governed by Decision 0009.
