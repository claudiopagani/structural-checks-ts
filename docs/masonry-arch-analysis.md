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
laws require explicit normal and shear stiffness data. The tangential component is either
`elastic-coulomb` (finite shear stiffness plus a Coulomb sliding surface) or `elastic-unbounded`
(finite shear stiffness with no sliding surface at all: `tau = Kt * delta_t`, no tangential
capacity, no plastic slip). Omitting `compressiveStrength` from the normal component means unbounded
compression strength; together with `elastic-unbounded` this selects the regularized Heyman-type
model described in
[masonry-arch-heyman-regularized-interface.md](masonry-arch-heyman-regularized-interface.md).
`stop-at-onset` makes compression-strength onset terminal; `perfectly-plastic` permits continued
path following.

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
produce a `FAIL` verdict. The default set follows the constitutive law: local plastic limits do not
automatically fail the design state. `plastic-sliding` and the perfectly-plastic
`compression-strength-reached`/`crushing` events continue the path by default, so the system may
redistribute and still reach `lambda = 1` with `PASS`. Terminal limits without an assigned
post-limit law remain default failures (`reinforcement-yielded` because no post-yield law is
assigned, `reinforcement-rupture`, `anchor-capacity-reached`, `bonded-layer-capacity-reached`,
`extrados-contact-invalid`), and every `terminal-physical-event` always fails the design check. A
caller can opt into a stricter policy, for example `designFailureEvents: ["plastic-sliding"]` to
treat the first plastic sliding as a design failure. The configured kinds are added to the default
set: `designFailureEvents` can only make the policy stricter and can never be used to remove a
default failure.

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
and `finite-compression-uniform-edge-block`; the path interface criteria carry `coulomb-friction`
and `deformable-interface-compression-strength`. The two compression identifiers are deliberately
different: the rigid-plastic equilibrium check is the uniform-edge-block resultant check, while the
deformable path check is the zero-thickness interface compression-strength check of the actual
implemented law. Unknown quantities are `null` and are never inferred from unrelated results.

Mechanics produces checks; assessment identifies which check failed. A mechanical check is not an
engineering verdict: the deformable interface law publishes constitutive quantities only, and
reaching a local plastic surface (`sliding`, `crushing`) is a constitutive state, never a global
`PASS`/`FAIL` judgment. The checks published in the evaluation result are

```ts
interface RigidBlockDeformableInterfaceMechanicalCheck2D<TCriterion> {
  criterion: TCriterion;
  demand: number; // demand mobilized by the returned response (never above the capacity)
  trialDemand: number; // constitutive trial predictor; may exceed the capacity
  capacity: number;
  utilizationRatio: number | null; // mobilized demand / capacity; null when not definable
}

interface RigidBlockDeformableInterfaceChecks2D {
  friction: RigidBlockDeformableInterfaceMechanicalCheck2D<"coulomb-friction"> | null;
  compression: RigidBlockDeformableInterfaceMechanicalCheck2D<"deformable-interface-compression-strength"> | null;
}
```

The friction check exists for the `elastic-coulomb` tangential law: `demand = |shearForce|`,
`trialDemand = |shearTrial|`, `capacity = cohesion * area + frictionCoefficient * normalForce`. With
zero capacity the mobilized demand is zero and the utilization stays `null` (no invented 0/0) while
the evaluation's `sliding` flag keeps the constitutive state. For the `elastic-unbounded` tangential
law the friction check is `null`: no tangential capacity exists, and no friction or sliding
utilization is defined (never `0`, `1`, or an invented pseudo-capacity). The compression check is
`null` when no finite compression strength is assigned; otherwise `demand` is the clipped published
compression stress (`maxCompression`), `trialDemand` is the maximum unclipped trial compression the
crushing-onset test compares with the strength, and `capacity` is the assigned strength.
`utilizationRatio` always refers to the mobilized demand, so a correctly returned elastoplastic
response stays at or below one; how far the predictor crossed the surface is reported by
`trialDemand`, never by the main utilization.

The equilibrium analysis fills demand, capacity, and utilization from its public interface,
reinforcement, anchor, and bonded-layer checks, and reports one criterion per actually failing
sub-check regardless of the synthetic reinforcement state. The path analysis maps its design-failure
events onto the same criterion taxonomy and copies each criterion's demand, capacity, utilization,
and `checkId` from the mechanical check published by the converged state of the event's own step:
`plastic-sliding` copies the step's friction check, `compression-strength-reached` and `crushing`
copy the step's compression check, and the reinforcement, anchor, and bonded-layer criteria copy
their own evaluations' checks. The copied demand is the mobilized demand; `trialDemand` stays a
constitutive diagnostic and is never used as the criterion demand. When a step terminates through a
physical event, every physical-limit event identified by that same converged step is reported as a
failed criterion, so a `stop-at-onset` step keeps its `compression-strength-reached` criterion next
to the terminal `crushing` one. Path criteria never recompute a mechanical formula; quantities the
step does not carry stay `null`, and the same violated condition re-identified at a later step does
not duplicate the criterion list.

`failureMode` classifies physical mechanism families, not the number of failed criteria. All
criteria of one family resolve to the family's mode: within the reinforcement family, rupture or
bonded-layer capacity prevails over bare yielding (`reinforcement-yielded` alone gives
`reinforcement-yield`; `reinforcement-rupture` or `bonded-layer-capacity-reached` present gives
`reinforcement-failure`), and `compression-strength-reached` together with `crushing` gives
`masonry-crushing`. `mixed` means several distinct mechanism families were violated simultaneously
(for example sliding plus crushing, or reinforcement failure plus masonry crushing).

`equilibrium-infeasible` means: no statically admissible equilibrium was found inside the defined
mechanical domain. It is a global verdict. It does not identify a single causal interface, and the
library never promotes `outputs.hinges[0]`, the first out-of-thickness interface, or the maximum
relaxed representative utilization into such a cause. The same rule protects sliding and compression
checks: interface checks computed on an infeasible representative state are reported as states, not
as certified failure causes. When the solver converges and finds the domain globally infeasible, the
assessment is `FAIL` with the single `equilibrium-infeasible` criterion, empty `entityIds`, and
`failureMode: "undetermined"`.

Joint opening, hinge formation, passive tendon activation, tendon slackening, sliding onset, and
bonded-layer force development are states or events; none of them is a failed criterion by itself.
Local plastic sliding and perfectly-plastic crushing may redistribute the response and the design
can still pass at `lambda = 1` (regression benchmarks cover both). A passive tendon may activate and
redistribute load while the assessment stays `PASS` at `lambda = 1`; an extrados passive tendon
activating under downward crown load is a regression-test case. Only the physical-limit kinds fail a
design check by default.

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

## Standard verification

Status: implemented | Design: Decision 0013, hardened by Decision 0014 | Scope:
`applications/masonry-arches`

The standard design verification is the façade `analyzeMasonryArchVerification`. It is the single
authority on the fixed-state result, the `PASS`/`FAIL`/`INDETERMINATE` verdict, the exact
`lambda = 1` design state, the verification limit, the failure mode, the failed criteria, the
significant states, and the numerical diagnostics. The low-level primitives
(`analyzeMasonryArchEquilibrium`, `analyzeMasonryArchLimit`, `analyzeMasonryArchPath`) remain
available for expert and capacity analyses.

### Route selection

- `rigid-plastic-static`: models whose interface response is `rigid-plastic`. The fixed state is
  verified by assigned equilibrium, then the assigned `lambda = 1` state; when `lambda = 1` is not
  statically admissible while the fixed state passed, direct limit analysis of the scalable pattern
  supplies the verification limit.
- `arc-length-continuation`: models whose interface response is `deformable` (including all
  reinforced and bonded-layer models). The verification follows the primary equilibrium branch with
  adaptive arc length.

### Logical phase A: the fixed state

`F_fixed` at `lambda = 0` is verified before any scalable load is applied. This is not a
construction stage and is not exposed as one: it is only the necessary check of the fixed state.

- `PASS`: the scalable phase starts;
- `FAIL`: the verification stops; zero scalable-loading steps are produced even when the blocking
  event is identified exactly on the step that completes the fixed load (`fixedLoadFactor = 1`); no
  scalable lambda is defined; the failed criteria and failure mode explain the problem when
  available;
- `INDETERMINATE`: the verification stops without inventing a failure; zero scalable-loading steps;
  numerical diagnostics are preserved.

Consumers can therefore report "not verified under permanent loads alone" or "the permanent-load
state could not be determined numerically", and never a percentage of the permanent loads.

### Arc-length design check

The design-state path follows the primary branch of equilibrium from the verified fixed state. The
continuation terminates on:

1. crossing of `lambda = 1` — the exact design state is certified by a fixed-lambda corrector;
2. a physical terminal event;
3. a certified global limit point of the primary branch;
4. numerical failure — `INDETERMINATE` with diagnostics, never a capacity and never a physical
   failure;
5. an explicit expert termination (maximum steps, path length cap).

Adaptive load control remains available on the primitive as an explicit expert choice; the standard
verification never selects it.

### Exact `lambda = 1` corrector

An arc step that merely overshoots (`lambda = 1.03`) is never accepted as the design state. When two
consecutive states bracket the crossing, the analysis builds an interpolated seed (falling back to a
tangent-based predictor), runs a Newton corrector with `lambda` fixed at exactly one, and verifies
convergence and the equilibrium residual. Only that state can certify `PASS` at `lambda = 1`. The
corrector is exception-safe: when the tangent load-correction solve throws, the fallback seed cannot
be constructed and the failure is recorded as a numerical diagnostic. A failed corrector is retried
with smaller arc radii; if it remains uncertifiable the result is `INDETERMINATE` with the
diagnostic termination `design-state-not-certified` — never a throw and never a physical `FAIL`.

### Certified global limit point

A turning point of the primary branch (the locus where `d(lambda)/ds = 0`) is certified **only**
through positive branch-turning evidence:

- two consecutive **converged** states whose arc-length load increments have tangent load components
  of opposite sign above the numerical noise threshold (`1e-6`), so the turn lies between the
  rising-side state and the descending-side state in arc-length coordinate;
- the rising side is then refined with halved arc increments (at most six refinement steps,
  approaching the turning point from below), so the certified `lambda` is the maximum lambda
  verified on the primary branch and always satisfies `lambda <= lambda_turning`.

The published `verifiedLimitPoint` carries the two side steps and lambdas
(`detection: "branch-turning"`, `risingSideStep`, `descendingSideStep`, `risingSideLambda`,
`descendingSideLambda`, `refinementSteps`, `certified: true`). No zero-width "certified bracket" and
no lambda-interval bracket is published for a turning point: the two converged sides bracket the
turn in arc-length coordinate, not a lambda interval.

A singular or nearly vertical continuation tangent at the last converged state is only a
`suspected-critical-point` diagnostic, and a tangent-solve exception is only a numerical `warning`:
neither one can certify a limit point, and a run that stalls on them stays `INDETERMINATE`. A
discrete local plastic event is never a certified limit point, and `max(steps.lambda)` is never
capacity by itself.

A certified limit point below one is reported as an `equilibrium-limit-point` event, the criterion
`equilibrium-limit-point` (`checkId: "equilibrium-limit-point"`, demand `1`, capacity
`lambda_limit`, utilization `1 / lambda_limit`), and `failureMode: "instability"`.

### Verdict, failure mode, and the two lambda meanings

`engineeringAssessment.lambda` is always the lambda of the load state the verdict refers to: `1` on
`PASS` and for the assigned-state question, the state where the verdict was decided on `FAIL` (`0`
when the fixed state itself fails, `1` when the assigned design state fails, the first blocking
state on the path route), and the last verified state when available on `INDETERMINATE`; `null` when
no such state exists. It is never a capacity.

`lambdaVerificationLimit` is a capacity of the scalable pattern: the lambda of the first event that
makes satisfying the design verification at `lambda = 1` impossible (certified limit point below
one, terminal crushing, reinforcement/anchor/bonded-layer failure, …). It is `null` on `PASS`, on
fixed-state failure, and when no blocking event could be certified. On the static route, a design
`FAIL` reports `assessment.lambda = 1` together with `lambdaVerificationLimit` from direct limit
analysis (for example `0.72`): the two meanings never overload each other.

`MasonryArchVerificationOutputs.failureMode` is always identical to
`engineeringAssessment.failureMode`: `null` on `PASS` and `INDETERMINATE`, a physical mode or
`"undetermined"` on `FAIL`. The path primitive's own termination classification (for example
`no-collapse-within-model`) stays semantically named inside `subAnalyses.path.outputs.failureMode`
and is never copied into the façade's `failureMode`.

### New public fields

`MasonryArchCapacityLandmarks` adds `lambdaVerificationLimit` (and `steps.verificationLimit`): the
lambda of the first event that makes satisfying the design verification at `lambda = 1` impossible
on the primary branch. It is deliberately distinct from `lambdaFirstLimit`: a first plastic sliding
that redistributes never moves it. It is `null` on `PASS`, on fixed-state failure (no scalable
lambda is defined), and when no blocking event could be certified.

Path outputs add:

- `fixedState`: status, step, lambda (always 0), failed criteria, failure mode of phase A;
- `convergenceInfo.terminationReason`, `lastConvergedLambda`, `maximumObservedLambda`,
  `lastConvergedStep`, `designStateCorrectorAttempts`, `tangentLambdaComponentAtTermination` (null
  when the tangent solve threw), `verifiedLimitPoint` (two-sided branch-turning contract), and the
  raw load-control `lambdaBracket` (never certified);
- `significantSteps.fixedState`, `verificationLimit`, and `termination` next to the existing
  entries.

Diagnostics are observables, never capacity, never failure, never the engineering verdict. Schema
versions: masonry-arch path `10.0.0`, standard verification `2.0.0` (Decision 0014).

### Active and passive reinforcement

Active reinforcement keeps its assigned `T0` as part of the fixed state; passive reinforcement has
`T0 = 0`. The same code path reports both the improving and the worsening outcomes: an assigned `T0`
may improve or worsen the fixed state or the capacity, and no special-case code exists. When the
system with permanent loads plus `T0` is not verifiable, the verification stops at the fixed state
and the scalable loads are never applied.

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
