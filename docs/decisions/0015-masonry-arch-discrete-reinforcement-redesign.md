# Decision 0015 — Masonry-arch discrete-reinforcement redesign

- Status: implemented
- Scope: `structural-checks-ts` masonry-arch reinforcement subsystem (STEP 1 and the STEP 1.1
  anchorage simplification of the redesign plan).
- Pre-production breaking change; no compatibility layer is retained.

## Context

The historical masonry-arch reinforcement model conflated several physically distinct concepts:

- terminal anchorage was defined per side through a generic `terminations` record whose default
  (`continuous-external`) was an externally force-controlled tendon without length compatibility;
- `rigid-deviators.count` included the two path-end terminals, making "deviator" ambiguous;
- intrados deviators, terminal connectors, and the distributed anchorage transfer zone shared one
  anchor-force result kind;
- external-system forces were published as `reinforcementBoundaryForces` and were indistinguishable
  from arch-side forces;
- bonded layers applied an automatic `developmentFactor` ramp near their ends and rejected
  simultaneous intrados + extrados layers at one interface;
- multi-layer static recovery split the recovered total force proportionally to capacity share,
  which fabricated a force distribution the limit/static problem does not determine.

## Decision

1. **Topology-first schema.** Every discrete reinforcement carries a discriminated `topology` union:
   - intrados `open` (independent left/right terminations) and intrados `closed-loop`;
   - extrados `open` with `unilateral-contact` interaction (closed loop is not an extrados option).
     Terminations are `arch-anchor` (normalized side-boundary station) or `external-anchor`.
     Intrados external anchors include their real transfer-device station and fixed global point;
     extrados external anchors include only the fixed global point because contact is solved. Left
     and right are independent, so mixed terminations are first-class.
2. **Device taxonomy.** Physical devices are explicitly
   `terminal-arch-anchor | external-anchor | arch-side-terminal | deviator | return-deviator`;
   `arch-side-terminal` is the real intrados external transfer device and, after Decision 0017, is
   never extrados contact. Every device publishes `tensionIn`, `tensionOut`, incoming/outgoing
   directions, and `F = T_out * t_out - T_in * t_in` (frictionless: `T_in === T_out`).
   `deviatorCount` ambiguity is removed: deviators are interior devices only.
3. **Complete-path compatibility.** Every tendon computes its elastic force increment from the
   complete path length — including external-anchor free branches and the closed-loop return segment
   — as `max(0, T0 + EA * (L - L_ref) / L_ref)`. Active and passive reinforcement differ only
   through `initialForce` (`> 0` vs `= 0`). The historical externally-force-controlled mode is
   removed.
4. **Force collections.** Results publish `deviceForces`, `externalAnchorForces`, `contactForces`,
   and the existing arch `reactions`. External-anchor forces are never applied to arch blocks.
   Per-reinforcement equilibrium diagnostics publish the free-body residual (force/moment about the
   origin, normalized) as solver diagnostics, never engineering criteria.
5. **No anchorage design in the library (STEP 1.1).** The library computes only the mechanical
   action each device transmits. It does NOT model or verify the physical anchorage that resists
   that action: the connector-group abstraction (`connectorCount`, `loadShareWeights`,
   `connectorSpacing`, per-connector demand/capacity/utilization), device capacities
   (`normalResistance`, `shearResistance`, `resultantResistance`, `interactionRule`), device
   utilization/status, the `hasAnchorFailure` flag, the `anchor-capacity-reached` event and
   criterion, and the `anchor-capacity` failure mode are all removed. The user verifies anchors,
   resin bars, plates, connector groups, and foundations independently from the reported resultant.
   Device results keep the reaction with its magnitude, direction (`resultantDirection`,
   `resultantAngle`), and the local normal/tangential components as secondary interpretations — none
   of them drives a check. Tendon material limits (yield, tensile, ultimate strain) remain active.
6. **Bonded layers: effective interval only.** `startStation`/`endStation` bound the effective
   layer; inside, the layer is immediately effective at its full assigned capacity; outside, it is
   absent. `developmentFactor`, `developmentLength`, `transferLength`, and the anchored/unanchored
   reduction logic are removed. The deformable membrane-spring model is removed from the path
   analysis: bonded layers keep the `minimum-required-static-admissibility` meaning in every
   analysis. In deformable/path analyses bonded layers are assessed as static-admissibility capacity
   contributions on the converged resultant field; they do not contribute constitutive stiffness or
   force to the deformable equilibrium residual.
7. **Multi-layer bonded domains.** Each layer contributes its own bounded tension vector
   `0 <= T_i <= T_Rd,i` at its side coordinate (`-h/2` intrados, `+h/2` extrados); the reinforced
   N-M domain is the Minkowski sum of the masonry domain and all layer segments. Static recovery
   minimizes the total required layer force through a dedicated linear program. Auxiliary LPs over
   the complete optimal face certify each individual `T_i`, `sum(T_i)`, and `sum(y_i T_i)`
   independently. A per-interface layer force is `null` with state `not-uniquely-determined` when
   its own range is not unique, while exact aggregate actions still recover the masonry-only
   resultant. If either aggregate is non-unique, exact masonry checks are not verifiable. The
   simultaneous intrados + extrados limitation is removed.
8. **Extrados terminal geometry validation (STEP 1.2).** For the simplified-symmetric arch, "left"
   and "right" are geometric sides: the resolved left terminal must lie geometrically left of (or on
   the same x-coordinate as) the right terminal for every open topology, and reversed terminations
   are rejected during reinforcement geometry resolution. An extrados external anchor must lie
   outside the masonry body (the normal-offset band of the reference curve between the springing
   joints, evaluated with the same normalized-profile parameterization the geometry builder uses),
   and its straight free branch to the first resolved contact must not travel through the masonry.
   Penetrations smaller than the polygonal sagitta of the contact discretization are accepted as an
   inherent discretization characteristic; deeper penetrations are rejected. Vertical terminal
   branches and tangent-like free branches remain valid.

## Consequences

- Breaking input/result schema changes; model schema 2.0.0 -> 3.0.0 (STEP 1) -> 4.0.0 (STEP 1.1) ->
  5.0.0, equilibrium result 4.0.0 -> 5.0.0 -> 6.0.0 -> 7.0.0, limit result 5.0.0 -> 6.0.0 -> 7.0.0
  -> 8.0.0, path result 11.0.0 -> 12.0.0 -> 13.0.0 -> 14.0.0, verification result 2.0.0 -> 3.0.0 ->
  4.0.0 -> 5.0.0, model comparison 3.0.0 -> 4.0.0 -> 5.0.0 -> 6.0.0.
- Old fixtures must be migrated to explicit arch-anchor or external-anchor terminations; no
  distributed-anchorage compatibility alias or connector-capacity layer remains.
- Deliberately not modeled: deviator friction, anchorage compliance, bond-slip, bonded-layer
  interface tractions, automatic development-length calculation, dynamic snap-through, and — after
  the STEP 1.1 simplification — any local anchorage/connector design or resistance verification.
- After STEP 1.2, geometrically reversed open-tendon terminals, extrados external anchors inside the
  masonry body, and free branches that travel through the masonry are rejected during reinforcement
  geometry resolution (no schema change: the public input/output contracts are unchanged).
- Decision 0016 subsequently classifies the station/point topology as an experimental advanced route
  and adds the stable side-specific block anchorage API. The advanced mechanics recorded here
  remains available but is not used to represent stable vertical or angle-prescribed anchorage.
