# Decision 0012: Local plastic limits are not global design failures

Status: accepted

## Context

Decision 0011 made the deformable interface law publish its checks and turned `pathCriteria.ts` into
a pure mapping layer. The resulting check contract, however, carried a `status` field
(`pass | fail | not-verifiable`) and used the trial predictor as the compression demand. That
language conflates two different levels:

- a constitutive state — the law reached a local plastic surface (Coulomb sliding, compression
  crushing);
- a global engineering verdict — the structure did or did not satisfy its design objective.

Reaching a local plastic surface does not mean the verification failed globally. An interface can
reach the Coulomb limit, slide, redistribute, activate or load a reinforcement, and the system can
still reach `lambda = 1` in a new equilibrium with `PASS`. A `perfectly-plastic` compression law can
reach its strength, develop plastic crushing, redistribute, and continue along a balanced path.
Conversely, `stop-at-onset` declares by its own law that reaching the strength terminates the
response. The default design-failure policy must follow the assigned constitutive semantics instead
of blindly failing on every physical-limit event.

The repository is not in production (see the pre-production change policy in `AGENTS.md`).

## Decision

1. The mechanical checks of `RigidBlockDeformableInterfaceEvaluation2D` publish constitutive
   quantities only and never a verdict:
   - `criterion`: the producing check's identifier, locked by the type to the check it belongs to
     (`friction` is `MechanicalCheck2D<"coulomb-friction">`, `compression` is
     `MechanicalCheck2D<"deformable-interface-compression-strength"> | null`);
   - `demand`: the demand mobilized by the returned response (`|shearForce|` for friction, clipped
     `maxCompression` for compression), never above the capacity;
   - `trialDemand`: the constitutive trial predictor that detects the surface crossing
     (`|shearTrial|`, `maximumTrialCompression`) and may exceed the capacity;
   - `capacity`: the assigned capacity;
   - `utilizationRatio`: `demand / capacity`, always referring to the mobilized demand; `null` when
     the ratio is not definable (zero capacity), never an invented 0/0.

   The `status: "pass" | "fail" | "not-verifiable"` field is removed. The constitutive state is
   carried by the evaluation's own `sliding` and `crushing` flags. The friction check is no longer
   nullable because the deformable law always assigns a Coulomb tangential law; the compression
   check stays nullable because a law may assign no finite strength.

2. Engineering criteria copy the mobilized demand: `pathCriteria.ts` keeps copying `demand`,
   `capacity`, `utilizationRatio`, and `checkId = criterion` from the step's published check.
   `trialDemand` remains a constitutive diagnostic and is never used as the criterion demand.

3. The default design-failure policy follows the assigned constitutive law:
   - `plastic-sliding` is not a default design failure: local plastic slip may redistribute and the
     design can still pass at `lambda = 1`;
   - `compression-strength-reached` and `crushing` are not default failures for `perfectly-plastic`;
     for `stop-at-onset` the `crushing` event is already a `terminal-physical-event` and therefore
     fails automatically;
   - `reinforcement-yielded` (no post-yield law assigned), `reinforcement-rupture`,
     `anchor-capacity-reached`, `bonded-layer-capacity-reached` (no post-capacity behavior
     assigned), and `extrados-contact-invalid` remain default failures;
   - every `terminal-physical-event` always fails the design check, unchanged.

   Callers can opt into a stricter policy with the existing `designFailureEvents` option, for
   example `designFailureEvents: ["plastic-sliding"]`; no new option is introduced.

4. When a step terminates through a physical event, every physical-limit event identified by that
   same converged step is reported as a failed criterion: a `stop-at-onset` step keeps its
   `compression-strength-reached` criterion next to the terminal `crushing` one, and a terminal step
   that also slides reports both families. The `failureMode` family classification of Decision 0011
   is unchanged.

5. The path result schema moves to `8.0.0` because the serialized interface check contract changes
   (no `status`, added `trialDemand`, non-nullable friction).

## Consequences

Consumers must read the constitutive state from the evaluation's `sliding`/`crushing` flags and
treat the check quantities as mechanical data, not as a verdict. Design-state analyses of arches
whose local sliding or perfectly-plastic crushing redistributes now return `PASS` at `lambda = 1` by
default, matching the assigned law; stricter consumers opt in through `designFailureEvents`.
Terminal failures (`stop-at-onset`, reinforcement limits, anchor and bonded-layer capacity, extrados
contact) are unchanged. The equilibrium assessment, the limit analysis, the `equilibrium-infeasible`
guardrail, and the single assessment-to-status mapping are unchanged.

The change does not alter the repository's LGPL-2.1-or-later license, canonical-authority decision,
historical derivation record, normative disclaimer, or solver-neutral boundary.
