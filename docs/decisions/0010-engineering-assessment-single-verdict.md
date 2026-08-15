# Decision 0010: Engineering assessment is the single design verdict

Status: accepted

## Context

The masonry-arch `engineeringAssessment` contract published a structured `PASS` / `FAIL` /
`INDETERMINATE` verdict next to a separately computed `CalculationResult.status`. The two could
contradict each other (for example `result.status = "ok"` with
`engineeringAssessment.status = "FAIL"`), the failed-criterion taxonomy was a superset of the event
taxonomy (allowing numerically nonsensical configurations such as
`designFailureEvents: ["convergence-lost"]`), a `PASS` assessment could carry a `failureMode` of
`no-collapse-within-model`, simultaneous violated reinforcement checks were collapsed into a single
criterion, and path criteria did not carry demand, capacity, and utilization even when the event's
own converged step held them.

The repository is not in production and is still under active design. Correctness, clarity, and API
coherence take priority over backward compatibility during this phase (see the pre-production change
policy in `AGENTS.md`). Breaking changes are acceptable when they replace a semantically wrong
contract with a better one.

## Decision

1. `engineeringAssessment` is the only source of the design verdict. For design-state analyses
   `CalculationResult.status` is derived from it with one fixed mapping: `PASS -> ok`,
   `FAIL -> not-verified`, `INDETERMINATE -> failed`. The separate `successful` gate in the
   equilibrium analysis is removed.

2. Failed criteria and path events use distinct taxonomies. `MasonryArchEngineeringCriterionKind` is
   `MasonryArchPhysicalLimitEventKind | "equilibrium-infeasible"`; observable, warning, and
   numerical event kinds can never be criteria. `designFailureEvents` is restricted to
   `MasonryArchDesignFailureEventKind` (= `MasonryArchPhysicalLimitEventKind`), so a
   numerical-failure event can never be configured as a structural failure at the type level.

3. `engineeringAssessment.failureMode` describes only a `FAIL` verdict: `null` for `PASS` and
   `INDETERMINATE`, a physical mode or `undetermined` for `FAIL`. The general path
   `outputs.failureMode` keeps its broader semantics including `no-collapse-within-model`.

4. Every actually failing check produces its own criterion. A reinforcement that yields and ruptures
   reports `reinforcement-yielded` and one `reinforcement-rupture` per failing tensile or
   ultimate-strain sub-check. `MasonryArchEngineeringCriterion.checkId` identifies the producing
   named check (`reinforcement-yield-stress`, `reinforcement-tensile-strength`,
   `reinforcement-ultimate-strain`, `coulomb-friction`, `finite-compression-uniform-edge-block`), so
   consumers never deduce the sub-criterion from demand/capacity values.

5. Path criteria read demand, capacity, and utilization exclusively from the converged state of the
   event's own step; quantities the step does not carry stay `null`. The same violated condition
   re-identified at a later step does not duplicate the criterion list; the earliest identification
   wins.

6. `equilibrium-infeasible` remains the global assigned-state verdict with empty `entityIds` and no
   fabricated causal interface. A numerical process failure is always `INDETERMINATE`.

7. Limit-analysis statuses are documented under a capacity reading: `ok` for a determinate capacity
   answer (verified collapse, or an unbounded model), `not-verified` when the process completed but
   no fully verified collapse criterion was satisfied, and `failed` only for numerical or procedural
   inability to determine an answer.

8. Schema bumps record the contract changes: equilibrium and limit results move to schema `4.0.0`,
   path results to `6.0.0`. The `question` strings become a typed union
   `MasonryArchEngineeringAssessmentQuestion` with exported constants.

## Consequences

Consumers must read `outputs.engineeringAssessment` for the design verdict instead of reinterpreting
eccentricities, hinges, events, warnings, or other numerical output. OCFEM and other consumers that
relied on the previous `result.status` values for design checks see the new unified mapping.

The refactoring does not change the repository's LGPL-2.1-or-later license, canonical-authority
decision, historical derivation record, normative disclaimer, or solver-neutral boundary.
