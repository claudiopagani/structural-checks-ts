# Decision 0011: Domain-published mechanical checks for deformable interfaces

Status: accepted

## Context

Decision 0010 established the masonry-arch `engineeringAssessment` as the single design verdict and
made path criteria read demand, capacity, and utilization from the converged state of the event's
own step. The implementation, however, still reconstructed mechanical formulas inside
`pathCriteria.ts`: the Coulomb capacity (`cohesion * area + frictionCoefficient * normalForce`) and
the compression utilization (`maxCompression / compressiveStrength`) were recomputed by the
application layer, duplicating knowledge that `evaluateDeformableInterface2D` already owns.
Duplicating a structural formula in a second layer risks divergence between the check that decides
and the check that is reported, and it contradicts the layering

```text
constitutive/interface mechanics -> interface evaluation -> path state -> engineering criterion
```

where the mechanical layer is the only authority on demand, capacity, utilization, and state.

Two further semantic problems were identified while auditing the layer:

- The path used `finite-compression-uniform-edge-block` as the compression `checkId`. That
  identifier names the rigid-plastic uniform-edge-block resultant check of the equilibrium analysis.
  The deformable law is a zero-thickness elastic-no-tension interface whose compression is derived
  from joint closures and integrated analytically or per fiber with optional plastic crushing
  integration; naming its check with the rigid-plastic identifier would misrepresent the actual
  implemented check.
- `masonryArchFailureModeFromKinds` classified `mixed` whenever more than one distinct mode string
  was present. A reinforcement that yields and then ruptures produced both `reinforcement-yielded`
  and `reinforcement-rupture` and was therefore classified `mixed`, even though yielding and tensile
  rupture are stages of the same physical mechanism family.

The repository is not in production (see the pre-production change policy in `AGENTS.md`);
correctness, clarity, and API coherence outrank backward compatibility.

## Decision

1. The deformable interface evaluation result publishes its own mechanical checks.
   `RigidBlockDeformableInterfaceEvaluation2D` gains a `checks` field produced exactly where the law
   is evaluated:
   - `checks.friction`: criterion `coulomb-friction`; demand `|shearForce|`; capacity
     `cohesion * area + frictionCoefficient * normalForce`; utilization from the stored
     `frictionUtilization`; status `fail` when sliding is active at the Coulomb limit,
     `not-verifiable` when the friction capacity is zero, otherwise `pass`.
   - `checks.compression`: criterion `deformable-interface-compression-strength`; demand is the
     maximum unclipped trial compression that the crushing-onset test compares with the assigned
     strength; capacity is the assigned compressive strength; utilization is the trial/capacity
     ratio; status `fail` when the current trial reaches the strength limit using the law's own
     `1e-12` relative tolerance, otherwise `pass`. The check is `null` when no finite compression
     strength is assigned. Reaching the limit is a current-state failure; developed
     perfectly-plastic crushing below the current limit keeps the check at `pass`, while the
     `crushing` flag continues to record the developed-plasticity state.

2. `pathCriteria.ts` is a pure mapping layer. It finds the event's entity in the event's own
   converged step, reads the check the step already published, and copies `checkId`, demand,
   capacity, and utilization into the criterion. It contains no mechanical formula: no Coulomb
   capacity reconstruction, no compression utilization reconstruction, no constitutive-law
   reinterpretation. When the step does not carry a check, the criterion quantities stay `null`. An
   architecture guard rejects the forbidden formula patterns in `pathCriteria.ts`.

3. The compression `checkId` for path criteria is `deformable-interface-compression-strength`, a new
   `MasonryArchEngineeringCheckId` literal. `coulomb-friction` stays shared because the tangential
   law is the same Coulomb check in both analyses. The rigid-plastic equilibrium identifier
   `finite-compression-uniform-edge-block` remains reserved for the actual uniform-edge-block check.
   The difference between the rigid-plastic and deformable compression checks is documented.

4. `masonryArchFailureModeFromKinds` classifies by physical mechanism family, not by the number of
   failed criteria. Criterion kinds map to families: masonry compression
   (`compression-strength-reached`, `crushing`), sliding (`plastic-sliding`), reinforcement
   (`reinforcement-yielded`, `reinforcement-rupture`, `bonded-layer-capacity-reached`), anchor
   (`anchor-capacity-reached`), and instability (`extrados-contact-invalid`). One family resolves to
   the family's mode; within the reinforcement family, rupture or bonded-layer capacity prevails
   over bare yielding. Several distinct families resolve to `mixed`. `equilibrium-infeasible` and
   kinds without a physical family remain `undetermined`.

5. `bonded-layer-capacity-reached` stays in the reinforcement family even when it references a
   reinforcement system distinct from a simultaneously yielded or ruptured one: the global failure
   mode describes the governing physical family, not the number of components involved.

6. The path result schema moves to `7.0.0` because `steps[].state.interfaces[].checks` extends the
   serialized deformable interface evaluation contract.

## Consequences

Consumers of path results now receive interface checks whose quantities are authoritative: the
criterion data is the exact copy of the check that the mechanical law produced, and `checkId`
identifies the actual producing check. Consumers that classified `mixed` from the raw criterion
count must move to the family semantics. The equilibrium assessment, the limit analysis, the
`equilibrium-infeasible` guardrail, event semantics, and the passive-activation regression behavior
are unchanged.

The refactoring does not change the repository's LGPL-2.1-or-later license, canonical-authority
decision, historical derivation record, normative disclaimer, or solver-neutral boundary.
