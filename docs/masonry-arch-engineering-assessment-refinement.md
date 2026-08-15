# Masonry-arch engineering assessment refinement

Status: implemented | Scope: `applications/masonry-arches`

This document records the refinement of the `engineeringAssessment` contract performed on top of
HEAD `ea2ce0b` (`archi: documentazione modi fail`), auditing everything introduced after the base
commit `61fbfe9` (`Expose masonry interface edge compression`). It is the engineering companion of
[Decision 0010](decisions/0010-engineering-assessment-single-verdict.md).

## Modified and added files

- `src/applications/masonry-arches/types.ts` — criterion taxonomy, `checkId`, question union, schema
  bumps.
- `src/applications/masonry-arches/pathTypes.ts` — `designFailureEvents` restriction, path schema
  bump.
- `src/applications/masonry-arches/engineeringAssessment.ts` — taxonomy predicates, failure-mode
  mapping, the single assessment-to-result-status mapping.
- `src/applications/masonry-arches/pathCriteria.ts` (new) — path criteria built from the event's own
  converged step.
- `src/applications/masonry-arches/pathEvents.ts` — default design failures, failure-mode routing
  through the criterion taxonomy.
- `src/applications/masonry-arches/analyzeMasonryArchEquilibrium.ts` — check-driven simultaneous
  criteria, unified status, removed `successful` gate.
- `src/applications/masonry-arches/analyzeMasonryArchPath.ts` — step-coherent criteria, assessment
  failure mode, unified status.
- `src/applications/masonry-arches/analyzeMasonryArchLimit.ts` — documented capacity status
  semantics.
- `src/applications/masonry-arches/index.ts` — exported question constants and schema versions.
- `tests/masonry-arch-engineering-assessment.test.ts` — updated and extended (23 tests).
- `tests/masonry-arch-path.test.ts`, `tests/masonry-arch-state.test.ts` — status assertions.
- `docs/masonry-arch-analysis.md` — rewritten engineering-assessment section.
- `docs/decisions/0010-engineering-assessment-single-verdict.md` (new) — the decision record.
- `AGENTS.md` — added the pre-production change policy section.

## Breaking changes

1. `MasonryArchEngineeringCriterionKind` is now
   `MasonryArchPhysicalLimitEventKind | "equilibrium-infeasible"` instead of every event kind.
2. `designFailureEvents` is restricted to `MasonryArchDesignFailureEventKind` (= the physical-limit
   event kinds); configuring `convergence-lost`, `joint-opened`, or any other numerical/observable
   kind is a compile-time error.
3. `MasonryArchEngineeringCriterion.checkId` was added (new required field).
4. `question` is now the typed union `MasonryArchEngineeringAssessmentQuestion` with exported
   constants `MASONRY_ARCH_EQUILIBRIUM_ASSESSMENT_QUESTION` and
   `MASONRY_ARCH_PATH_ASSESSMENT_QUESTION`.
5. `CalculationResult.status` is now derived from the assessment with one fixed mapping (see below);
   the equilibrium `successful` gate is removed.
6. `engineeringAssessment.failureMode` is `null` for `PASS` and `INDETERMINATE`; only `FAIL` carries
   a physical mode or `undetermined`.
7. Simultaneous violated reinforcement checks are all preserved instead of being collapsed into the
   terminal one.
8. Path criteria now carry demand, capacity, and utilization from the event's own converged step.
9. Limit-analysis statuses were redefined under a documented capacity reading.
10. Schema bumps: equilibrium `3.0.0 -> 4.0.0`, limit `3.0.0 -> 4.0.0`, path `5.0.0 -> 6.0.0`.

## Final taxonomy

- `MasonryArchEventKind` — everything that can happen along a path (15 kinds, unchanged): observable
  events, warnings, engineering limits, terminal physical events, `convergence-lost`.
- `MasonryArchPhysicalLimitEventKind` — the 8 physical-limit kinds: `plastic-sliding`,
  `compression-strength-reached`, `crushing`, `reinforcement-yielded`, `reinforcement-rupture`,
  `anchor-capacity-reached`, `bonded-layer-capacity-reached`, `extrados-contact-invalid`.
- `MasonryArchEngineeringCriterionKind` =
  `MasonryArchPhysicalLimitEventKind | "equilibrium-infeasible"`. Observable, warning, and numerical
  kinds are not criteria at the type level.
- `MasonryArchDesignFailureEventKind` = `MasonryArchPhysicalLimitEventKind`.
- `MasonryArchEngineeringCheckId` =
  `"coulomb-friction" | "finite-compression-uniform-edge-block" | "reinforcement-yield-stress" | "reinforcement-tensile-strength" | "reinforcement-ultimate-strain"`.

## Final `engineeringAssessment` semantics

```text
question    : typed machine-readable question (two literals)
status      : PASS | FAIL | INDETERMINATE (the single design verdict)
lambda      : lambda at which the assessed state was evaluated; 1 for assigned state
failedCriteria : every violated condition, never a single "worst" one
failureMode : null for PASS/INDETERMINATE; physical mode or "undetermined" for FAIL
```

- `PASS`: the numerical process succeeded and the verification is satisfied; `failedCriteria = []`,
  `failureMode = null`.
- `FAIL`: the numerical process succeeded and determined that the verification is not satisfied; at
  least one criterion; `failureMode` from `masonryArchFailureModeFromKinds` (`mixed` for physically
  distinct simultaneous modes, `undetermined` when no mode is derivable).
- `INDETERMINATE`: the numerical process produced no determinable judgment; `failedCriteria = []`,
  `failureMode = null`. Never a physical criterion, never `FAIL`.

## Final `CalculationResult.status` semantics

- `ok` — the requested result was obtained and the objective satisfied.
- `not-verified` — the analysis completed correctly but the engineering criterion is not satisfied.
- `failed` — numerical or procedural inability to determine the outcome.
- `not-supported` / `not-implemented` — reserved for genuinely unavailable capabilities.

Per analysis:

| Analysis               | `ok`                                                                   | `not-verified`                                                                                        | `failed`                   |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------- |
| Equilibrium            | assessment `PASS`                                                      | assessment `FAIL`                                                                                     | assessment `INDETERMINATE` |
| Path design-state      | assessment `PASS`                                                      | assessment `FAIL`                                                                                     | assessment `INDETERMINATE` |
| Path capacity/advanced | requested target reached and equilibrated                              | physical limit identified before the target                                                           | numerical termination      |
| Limit                  | verified collapse, or unbounded model (determinate no-collapse answer) | static limit only, fixed-load infeasibility, or a reinforcement limit already exceeded at fixed loads | solver iteration limits    |

For design-state analyses the assessment is the only source of the verdict; the two levels can no
longer contradict each other.

## equilibrium-infeasible

Preserved unchanged: optimizer optimal AND `feasible === false` produces `FAIL` with the single
`equilibrium-infeasible` criterion, `entityIds = []`, `lambda = 1`, `failureMode = "undetermined"`.
`hinges[0]`, maximum utilization, first out-of-thickness interface, and relaxed representative
checks are never promoted to certified causes. Tests B, C, and G pin this explicitly.

## Numerical failures

`INDETERMINATE` -> `failed`. Never a physical criterion, never a structural `FAIL`.
`designFailureEvents: ["convergence-lost"]` no longer type-checks (test J).

## Multiple criteria

The equilibrium analysis collects one criterion per actually failing public check, regardless of the
synthetic reinforcement state: `yielding -> reinforcement-yielded`,
`tensileFailure -> reinforcement-rupture` (`checkId: reinforcement-tensile-strength`),
`ultimateStrain -> reinforcement-rupture` (`checkId: reinforcement-ultimate-strain`). A
reinforcement that yields and ruptures reports all three (test N, `failureMode: "mixed"`). On the
path, the same violated condition re-identified at a later step does not duplicate the list; the
earliest identification wins, while distinct simultaneous conditions are all preserved.

## Path criterion numeric data

Each failed path criterion reads its quantities only from the converged state of the event's own
step:

- `plastic-sliding` — interface of the same step: demand = `|shearForce|`, capacity = cohesion·A +
  µ·N, utilization = stored `frictionUtilization`.
- `compression-strength-reached` / `crushing` — demand = `maxCompression`, capacity =
  `compressiveStrength`, utilization = ratio.
- `reinforcement-yielded` / `reinforcement-rupture` — the step's `checks.yielding`,
  `checks.tensileFailure`, `checks.ultimateStrain`.
- `anchor-capacity-reached` — the step's anchor resultant demand/capacity/utilization.
- `bonded-layer-capacity-reached` — the step's layer-interface force/capacity/utilization.
- `extrados-contact-invalid` — no applicable quantities, null.

Nothing is recomputed and nothing is taken from a different step (tests O1-O3).

## Passive reinforcement behavior

Joint opening, passive activation, and tendon slackening remain observable events, never failed
criteria. A regression benchmark was added: an extrados passive tendon activates at λ ≈ 0.475 under
a downward crown load and the design still reaches λ = 1 with `PASS` and no activation criterion
(test L). Known benchmark limitation: in the available symmetric-arch benchmarks an intrados passive
tendon activates only together with plastic sliding at λ ≈ 0.975, so no physical intrados
activation-then-pass case could be constructed without artificial mechanics; this is documented and
not forced.

## Documentation added

- `AGENTS.md`: new "Pre-production change policy" section — the project is not in production;
  correctness, clarity, and API quality outrank backward compatibility; breaking changes are
  acceptable with precise motivation, tests, docs, and schema bumps.
- `docs/decisions/0010-engineering-assessment-single-verdict.md`: the decision record.
- `docs/masonry-arch-analysis.md`: rewritten engineering-assessment section describing the taxonomy
  split, the status mapping, `checkId`, step-coherent path data, and the `equilibrium-infeasible`
  guardrail.

## Tests

Updated `tests/masonry-arch-engineering-assessment.test.ts` (23 tests) covering: equilibrium PASS,
infeasibility without fabricated causes, numerical INDETERMINATE, reinforcement yielding, single and
dual sub-check rupture, simultaneous criteria, anchor capacity, bonded-layer capacity
(`not-verified`, replacing the legacy pin), design-failure-event compile-time rejection, passive
activation with PASS at λ = 1, and step-coherent numeric data for compression, sliding,
reinforcement, anchor, and bonded-layer criteria. `tests/masonry-arch-path.test.ts` and
`tests/masonry-arch-state.test.ts` pin the unified result statuses and the limit status semantics.

## Validation

`npm run check` is fully green: build, `prettier --check`, ESLint, TypeScript typecheck, 280 tests,
architecture check, normative-reference check, package check, packed-consumer check, worker-bundle
check, and encoding check all pass.

## Remaining technical limits and deferred work

- Intrados passive activation followed by PASS at λ = 1 has no physically clean benchmark in this
  model family (see above); the extrados case covers the intended semantics.
- **Done: sever the `strutture-js` live link.** The repository no longer requires a live checkout of
  the previous JavaScript implementation:
  - `scripts/check-provenance.ts` validates the frozen baseline and slice manifests (recorded
    revision consistency and migrated target existence); live revision/status/blob verification is
    removed.
  - `scripts/parity-inventory.ts` is now a frozen-record reader with TypeScript-side surface
    counting; `scripts/check-parity-inventory.ts` validates the frozen record and detects drift of
    the current TypeScript surface against the recorded counts.
  - `scripts/generate-parity-inventory.ts` and the `inventory:generate` npm script are removed.
  - `scripts/check-package.ts` reads the frozen revision from `migration/baseline.json` instead of a
    hardcoded pin and no longer asserts the previous project name.
  - `CONTRIBUTING.md` no longer instructs to confirm a live baseline checkout.
  - `check:provenance` and `check:parity-inventory` are part of `npm run check` again.
  - `migration/*.json`, `docs/parity-inventory.md`, the NOTICE attribution, and the README
    provenance notes remain frozen historical evidence and are not live dependencies.
  - The optional `legacy-parity` test suite still references the historical checkout and remains
    excluded from the canonical suite; it is historical verification material, not a dependency of
    the default workflow.
