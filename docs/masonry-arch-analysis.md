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

## Engineering assessment

Both the assigned equilibrium analysis and the design-state path analysis publish a structured
`engineeringAssessment` so that consumers render the engineering verdict instead of deducing it from
eccentricities, hinge lists, or utilization numbers:

```ts
interface MasonryArchEngineeringAssessment {
  question: MasonryArchEngineeringAssessmentQuestion;
  status: "PASS" | "FAIL" | "INDETERMINATE";
  lambda: number | null; // lambda at which the assessed state was evaluated; 1 for assigned state
  failedCriteria: readonly MasonryArchEngineeringCriterion[];
  failureMode: MasonryArchFailureMode | null;
}
```

- `status` is the engineering verdict. A numerical process failure is `INDETERMINATE`, never `FAIL`
  and never a physical failure.
- `failedCriteria` lists every violated structural condition; a `FAIL` state never selects a single
  "worst" criterion and never drops simultaneous ones.
- `failureMode` describes only a `FAIL`: it is `null` for `PASS` and `INDETERMINATE`, and a physical
  mode or `undetermined` for `FAIL`. The general path `outputs.failureMode` keeps its own broader
  semantics (`no-collapse-within-model` and friends) and is not part of the design assessment.
- The solver convergence and the equilibrium feasibility remain separate process-level data in
  `outputs.convergence` and `outputs.equilibrium`.
- The `question` values are machine-readable string literals typed as
  `MasonryArchEngineeringAssessmentQuestion`:

  ```ts
  type MasonryArchEngineeringAssessmentQuestion =
    | "does-the-assigned-load-state-admit-a-verified-statically-admissible-equilibrium"
    | "can-reach-lambda-one-with-admissible-equilibrium-and-prescribed-criteria";
  ```

The assessment is the single source of the design verdict. `CalculationResult.status` is derived
from it with one fixed mapping:

```text
assessment PASS          -> result.status "ok"
assessment FAIL          -> result.status "not-verified"
assessment INDETERMINATE -> result.status "failed"
```

`ok` means the numerical process succeeded and the verification is satisfied; `not-verified` means
the process succeeded and determined that the verification is not satisfied; `failed` means the
process produced no determinable engineering judgment. `failed` is never used for a structure that
is simply not verified.

### Event kinds and criterion kinds

Event kinds and failed-criterion kinds are deliberately not the same taxonomy:

- `MasonryArchEventKind` covers everything that can happen along a path: observable events
  (`joint-opened`, `joint-closed`, `sliding-started`, `passive-tendon-activated`,
  `extrados-contact-active-set-changed`), warnings (`tendon-slackened`), engineering limits
  (`plastic-sliding`, `compression-strength-reached`, ...), terminal physical events, and the
  numerical failure `convergence-lost`.
- `MasonryArchEngineeringCriterionKind` contains only conditions that can genuinely make a
  verification FAIL: the physical-limit event kinds plus the global assigned-state
  `equilibrium-infeasible` verdict. Observable, warning, and numerical kinds can never be criteria,
  at the type level.

The path option `designFailureEvents` is restricted to `MasonryArchDesignFailureEventKind`, which is
exactly the physical-limit event taxonomy. Configuring `convergence-lost` (or any other
numerical/observable kind) as a design failure is a compile-time error; numerical failure can never
produce a `FAIL` verdict.

Every criterion carries only quantities the producing analysis actually knows:

```ts
interface MasonryArchEngineeringCriterion {
  kind: MasonryArchEngineeringCriterionKind;
  checkId: MasonryArchEngineeringCheckId | null;
  entityIds: readonly string[];
  lambda: number | null;
  demand: number | null;
  capacity: number | null;
  utilizationRatio: number | null;
}
```

`checkId` identifies the specific underlying public check that failed when a kind aggregates several
checks: `reinforcement-rupture` is reported once per actually failing sub-check with
`reinforcement-tensile-strength` or `reinforcement-ultimate-strain`, and `reinforcement-yielded`
carries `reinforcement-yield-stress`. The equilibrium interface criteria carry `coulomb-friction`
and `finite-compression-uniform-edge-block`. Unknown quantities are `null` and are never inferred
from unrelated results.

The equilibrium analysis fills demand, capacity, and utilization from its public interface,
reinforcement, anchor, and bonded-layer checks, and reports one criterion per actually failing
sub-check regardless of the synthetic reinforcement state. The path analysis maps its design-failure
events onto the same criterion taxonomy and reads demand, capacity, and utilization from the
converged state of the event's own step; quantities the step does not carry stay `null`, and the
same violated condition re-identified at a later step does not duplicate the criterion list.

`equilibrium-infeasible` means: no statically admissible equilibrium was found inside the defined
mechanical domain. It is a global verdict. It does not identify a single causal interface, and the
library never promotes `outputs.hinges[0]`, the first out-of-thickness interface, or the maximum
relaxed representative utilization into such a cause. The same rule protects sliding and compression
checks: interface checks computed on an infeasible representative state are reported as states, not
as certified failure causes. When the solver converges and finds the domain globally infeasible, the
assessment is `FAIL` with the single `equilibrium-infeasible` criterion, empty `entityIds`, and
`failureMode: "undetermined"`.

Joint opening, hinge formation, passive tendon activation, tendon slackening, sliding onset, and
bonded-layer force development are states or events; none of them is a failed criterion by itself. A
passive tendon may activate and redistribute load while the assessment stays `PASS` at `lambda = 1`;
an extrados passive tendon activating under downward crown load is a regression-test case. Only the
physical-limit kinds fail a design check by default.

For the path analysis, `engineeringAssessment` adds the path-specific `requiredLambda: 1` field;
`outputs.events` keeps the complete event log with categories, steps, and messages.

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
