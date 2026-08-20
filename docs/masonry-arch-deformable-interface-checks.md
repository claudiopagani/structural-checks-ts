# Deformable-interface published checks: path criteria become a mapping layer

Status: implemented (superseded in part by
[Decision 0012](decisions/0012-local-plastic-limits-are-not-global-failures.md)) | Scope:
`domain/masonry/rigid-blocks`, `applications/masonry-arches`

Later refinement changed the check contract described below: the `status` field was removed, the
check now publishes `demand` (mobilized), `trialDemand` (constitutive predictor), `capacity`, and
`utilizationRatio` (mobilized), the friction check is criterion-locked but nullable (it is `null`
for the `elastic-unbounded` tangential law, which has no Coulomb surface at all), and the default
design-failure policy follows the assigned constitutive law. This record remains as the historical
report of the Decision 0011 iteration; the current semantics are documented in Decision 0012 and
`docs/masonry-arch-analysis.md`.

Decision 0015 subsequently removed local anchor resistance and its criterion entirely. Current
device results contain mechanical actions only.

This report records the iteration that removed the mechanical-formula duplication from
`pathCriteria.ts` and made the deformable interface law publish its own structural checks. It is the
implementation companion of
[Decision 0011](decisions/0011-domain-published-deformable-interface-checks.md), built on top of
HEAD `1c4702a` (`tolto riferimento a strutture-js`), after the reference commit `2425a39`.

## Problem

`pathCriteria.ts` reconstructed mechanical quantities that the mechanical layer already computes:

- sliding: `capacity = cohesion * area + frictionCoefficient * max(0, normalForce)`,
  `demand = |shearForce|`;
- compression: `capacity = compressiveStrength`, `demand = maxCompression`,
  `utilization = demand / capacity`.

The formulas were numerically right but architecturally wrong: a structural formula must have one
authority, and the flow is

```text
constitutive/interface mechanics -> interface evaluation -> path state
    -> engineering criterion -> consumer
```

`pathCriteria.ts` also labeled the path compression criterion
`finite-compression-uniform-edge-block`, the identifier of the rigid-plastic uniform-edge-block
resultant check, which does not name the actual deformable check; and the failure mode classified
`mixed` whenever more than one mode string was present, so yielding plus rupture of one
reinforcement system was reported as `mixed`.

## Changes

### 1. The deformable interface publishes its checks (`domain`)

`RigidBlockDeformableInterfaceEvaluation2D` gains:

```ts
checks: {
  friction: {
    criterion: "coulomb-friction";
    demand: number;            // |shearForce|
    capacity: number;          // cohesion * area + frictionCoefficient * normalForce
    utilizationRatio: number | null;
    status: "pass" | "fail" | "not-verifiable";
  } | null;
  compression: {
    criterion: "deformable-interface-compression-strength";
    demand: number;            // maximum unclipped trial compression
    capacity: number;          // assigned compressive strength
    utilizationRatio: number | null;
    status: "pass" | "fail" | "not-verifiable";
  } | null;
}
```

and a `maximumTrialCompression` field. The checks are built in `evaluateForces`, exactly where the
law is evaluated, using the same quantities the law uses for its own sliding and crushing tests.

Semantics of the friction check: the demand is the returned `|shearForce|`, the capacity is the
law's `totalFrictionCapacity`; `fail` means the current state sits on the Coulomb limit (sliding
active, utilization exactly one), `not-verifiable` means the capacity is zero, otherwise `pass`.

Semantics of the compression check: the demand is the maximum **unclipped trial** compression that
the crushing-onset test compares with the assigned strength — for the analytic integration the exact
edge maximum of the trial distribution, for the perfectly-plastic integration the maximum over the
returned fiber midpoints, matching the fiber-wise onset test. The capacity is the assigned
compressive strength, and the utilization is the trial/capacity ratio, which can exceed one. The
status uses the law's own onset tolerance (`trial >= strength * (1 - 1e-12)`): reaching the limit in
the current state is a `fail`. Developed perfectly-plastic crushing below the current limit keeps
the check at `pass`; the `crushing` flag remains the developed-plasticity state, so a historical
limit is never re-flagged as a new failure. The check is `null` when no finite compression strength
is assigned.

### 2. `pathCriteria.ts` is a mapping layer (`applications`)

The file now finds the event's entity in the event's own converged step and copies the published
check:

- `plastic-sliding` -> `state.interfaces[].checks.friction`;
- `compression-strength-reached` and `crushing` -> `state.interfaces[].checks.compression`;
- reinforcement and bonded-layer criteria continue to copy their own evaluations' checks.

It contains no mechanical formula. An architecture guard in `scripts/check-architecture.ts` rejects
the forbidden patterns (Coulomb capacity, friction-coefficient products, demand/capacity division,
strength references) in the file. The function signature drops the unused model parameter.

### 3. `checkId` coherence

Equilibrium keeps its identifiers; path criteria copy the criterion literal of the producing domain
check:

- `plastic-sliding` -> `coulomb-friction` (same Coulomb check as equilibrium);
- `compression-strength-reached` / `crushing` -> `deformable-interface-compression-strength` (new
  `MasonryArchEngineeringCheckId` literal).

`finite-compression-uniform-edge-block` stays reserved for the actual rigid-plastic
uniform-edge-block check; the deformable zero-thickness interface compression-strength check does
not reuse it.

### 4. Failure mode by physical mechanism families

`masonryArchFailureModeFromKinds` maps criterion kinds onto mechanism families and resolves one
family to its mode:

- masonry compression (`compression-strength-reached`, `crushing`) -> `masonry-crushing`;
- sliding -> `sliding`;
- reinforcement (`reinforcement-yielded`, `reinforcement-rupture`, `bonded-layer-capacity-reached`)
  -> `reinforcement-failure` when rupture or bonded-layer capacity is present, `reinforcement-yield`
  when only yielding is present;
- instability -> `instability`.

Several distinct families -> `mixed`. `equilibrium-infeasible` and kinds without a physical family
-> `undetermined`. `mixed` now means multiple distinct physical mechanism families, never merely
multiple failed criteria of one family. `bonded-layer-capacity-reached` stays in the reinforcement
family even when it references a distinct reinforcement system: the global mode describes the
governing family, not the number of components. Failed criteria remain complete: yielding plus
tensile and ultimate-strain rupture all stay in `failedCriteria`, with
`failureMode: "reinforcement-failure"`.

### 5. Versioning, exports, docs

- Path result schema `6.0.0 -> 7.0.0`.
- Package root exports `evaluateRigidBlockDeformableInterface2D`,
  `createRigidBlockDeformableInterfaceState2D`, and the new check types.
- The masonry-arches application exports `masonryArchFailureModeFromKinds`.
- New decision [0011](decisions/0011-domain-published-deformable-interface-checks.md) and this
  report; `docs/masonry-arch-analysis.md` updated.

Unchanged guardrails: `equilibrium-infeasible` semantics, event semantics (joint opening, passive
activation, slackening, bonded-layer activation), the single assessment-to-status mapping, the
limit-analysis statuses, and the passive extrados activation regression benchmark.

## Tests

- New `tests/deformable-interface-mechanical-checks.test.ts` (9 tests): friction below the limit, at
  the limit, zero capacity (`not-verifiable`), cohesion term, finite-strength compression,
  stop-at-onset limit reaching, no finite strength (`null` check), perfectly-plastic onset, and
  developed plastic crushing below the current limit.
- New `tests/masonry-arch-failure-mode-families.test.ts` (12 tests): all single-family modes,
  yield + rupture -> `reinforcement-failure`, yield + bonded-layer -> `reinforcement-failure`,
  compression + crushing -> `masonry-crushing`, real mixed combinations, duplicates, and
  `undetermined`.
- Updated `tests/masonry-arch-engineering-assessment.test.ts`: test N now expects
  `reinforcement-failure`; O1 and O2 assert the exact copy of the step's published checks
  (`criterion.checkId === check.criterion`, demand/capacity/utilization equal); path schema
  assertion moved to `7.0.0`.

## Validation

`npm run check` is fully green: build, formatting, lint, typecheck, tests (including the new domain
and failure-mode suites), architecture guard (including the new path-criteria guard), normative
references, provenance, parity inventory, package, packed consumer, worker bundle, and encoding.

## Remaining technical limits

- `pathCriteria.ts` still copies bonded-layer data from its evaluation results, which already
  publish demand/capacity/utilization; no reconstruction happens there.
- The friction check of the deformable law reports the returned force, so its utilization never
  exceeds one: reaching the limit is expressed by the `fail` status, not by a utilization above one,
  matching the law's own sliding test.
