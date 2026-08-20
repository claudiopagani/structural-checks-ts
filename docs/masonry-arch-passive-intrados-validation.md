# Passive intrados tendon validation: activation + redistribution + design PASS at lambda 1

Status: validated regression | Scope: current `applications/masonry-arches` path analysis

This report records an isolated validation campaign for the masonry-arch passive intrados tendon
model. It answers one question: does the current mechanical model contain a physically sensible case
in which a passive intrados tendon follows the sequence

```text
T0 = 0  ->  arch initially equilibrated  ->  deformation/opening  ->  intrados-path elongation
        ->  passive activation  ->  T > 0  ->  redistribution  ->  continuation  ->  lambda = 1  ->  PASS
```

The original campaign did not calibrate the solver or tendon formulas. The maintained test now
tracks the canonical topology and verification contracts. The conclusion remains the strongest
success case:

> **PASSIVE INTRADOS ACTIVATION + PASS BENCHMARK FOUND**

## 1. Current baseline

This report follows the canonical TypeScript implementation and the reinforcement contract in
Decision 0015. The pinned test uses the current arch-anchor topology and standard arc-length design
verification. Local plastic sliding and perfectly-plastic compression may redistribute under the
default policy; callers can add stricter physical-limit kinds through `designFailureEvents`.

## 2. Maintained evidence

- `tests/masonry-arch-passive-intrados-benchmark.test.ts` is the executable regression oracle.
- This report explains its mechanical interpretation. Historical migration/parity records are
  provenance only and do not define the current implementation.

## 3. Exact passive intrados tendon model (audit)

All in `src/applications/masonry-arches/resolveArchReinforcements.ts`:

1. **Reference path** — `createSideArcStationing` integrates the intrados arc length between
   interface stations; path nodes are placed at equally spaced side-arc stations (rigid deviators,
   with one at the crown) plus the two terminal arch anchors. The node reference points are the
   intrados curve points of the undeformed arch.
2. **Reference length** — `referencePathLength` is the polyline length through the node reference
   points (two chords of 6.364 m each for the one-crown-deviator path, total 12.728 m).
3. **Deformed path** — every node is rigidly attached to its voussoir(s) (`transformPointByBlock`;
   interface nodes share 0.5/0.5 between the two adjacent blocks). The current path is the polyline
   through the moved points.
4. **Delta-L** — `elongation = currentPathLength - referencePathLength`; values below
   `elongationTolerance = 64 * EPS * max(1, Lref, Lcur)` are treated as zero.
5. **Compatibility** — every supported tendon topology uses its complete resolved reference and
   current path lengths. Arch anchors move with their voussoirs; external anchors remain fixed in
   the global frame. There is no distributed-anchorage or connector-capacity mechanics.
6. **Force** —
   `trialForce = initialForce + E * A * constitutiveElongation / effectiveElasticLength`;
   `force = max(0, trialForce)`; tangent stiffness `E * A / effectiveElasticLength` when the trial
   force is positive, zero otherwise (tension-only slack law).
7. **State** — `slack` when `force === 0`; `active-passive` when `force > 0` and
   `initialForce === 0`; `active-post-tensioned` when `force > 0` and `initialForce > 0`.
8. **Event** — `passive-tendon-activated` is emitted (`pathEvents.ts`) exactly on the step
   transition `slack -> active-passive`. Force, elongation, and lengths are published on every step
   in `ArchReinforcementStateResult`.

## 4. Compatibility equation identified in code

```text
F = max(0, F0 + E * A * (L_current - L_reference) / L_effective)
L_effective = L_reference
state = slack if F = 0; active-passive if F > 0 and F0 = 0
```

`F0 = initialForce = 0` for a passive tendon; activation is therefore a pure compatibility event
driven by the kinematic lengthening of the intrados path.

## 5. Configurations explored

Guided, deterministic sweeps (temporary scripts, ~200 runs):

- **Friction** mu = 0.35, 0.4, 0.45, 0.5, 0.6, 0.8, 1.0.
- **Loads**: downward point loads at stations 0.05–0.5 (10–150 kN), asymmetric patch loads (5–60
  kN/m over the left quarter/half), paired symmetric loads, uniform loads, fill-style loads; upward
  crown load (reproduction of the previously documented activation case).
- **Geometry**: circular semicircular and elliptical basket arches (springing angles 65–80 deg),
  rise 3–5, thickness 0.8–2.0, voussoir count 5, 7, 9, 13.
- **Tendon**: deviator counts 1, 3, 5, 7; area 1e-3 m2; E = 200 GPa; terminal arch anchors;
  initialForce 0.
- **Interface stiffness**: normal E 1e6–1e8 kPa (closure-dominated shortening hypothesis).

Key empirical findings along the way:

- With 9+ voussoirs, elastic joint closure (~1e-3 m) dominates the intrados-path shortening for
  every downward load; activation occurs only together with well-developed plastic sliding near the
  limit point (previously documented limitation, confirmed).
- With 7 voussoirs (fewer joints, less cumulative closure) the sliding-driven asymmetric mechanism
  makes the net intrados elongation positive at lambda = 0.975 while the arch still converges at
  lambda = 1. With 5 voussoirs both reinforced and unreinforced arches pass (weaker comparison).

## 6. Best benchmark found (pinned)

- Units: kN, m. Simplified-symmetric circular arch: span 10, rise 5, thickness 1, out-of-plane width
  1, **7 voussoirs**, centerline reference curve.
- Masonry unit weight 20 kN/m3 (self-weight, fixed load case G).
- Deformable interface law everywhere (including supports): normal elastic-no-tension, E = 1e6 kPa,
  characteristic length 0.5 m, 8 integration points; tangential elastic-Coulomb, G = 4e5 kPa,
  **friction coefficient 0.4**, zero cohesion, non-associated flow rule, zero dilation. **No
  compressive strength assigned: compression failure suppressed to isolate passive-tendon
  kinematics** — this is not a complete design benchmark.
- Scalable load Q: patch `components (0, -20)` kN/m over reference stations [0.05, 0.45] (left ~40%
  of the arch).
- Reinforcement: id `passive-intrados`, side `intrados`, rigid deviators count 1, area 0.001 m2, E =
  200 GPa, **initialForce 0**, yield 450 MPa, tensile 550 MPa, arch anchors at stations 0 and 1, and
  one crown deviator.
- Analysis: `design-state-check`, scalable ["Q"], equilibrium tolerance 1e-7, maxIterations 50,
  maxSteps 200 (standard adaptive arc length with an exact fixed-lambda corrector at lambda 1).

## 7. Activation lambda

- The current regression pins activation at **step 14, lambda = 0.9536693** and asserts
  `0 < lambda < 1`; the activation lambda is an observed path quantity rather than a public capacity
  landmark.

## 8. Tendon force before / after activation

| step | lambda   | state          | force (kN) | elongation (m) |
| ---- | -------- | -------------- | ---------- | -------------- |
| 13   | 0.753674 | slack          | 0          | -4.98e-4       |
| 14   | 0.953669 | active-passive | **6.91**   | +4.40e-4       |
| 15   | 1.000000 | active-passive | **11.29**  | +7.19e-4       |

`initialForce` is exactly 0 throughout. The force before activation is exactly 0; after activation
it is positive and grows monotonically to 11.29 kN at lambda = 1. No slack/active oscillation:
exactly one `passive-tendon-activated` event and no `tendon-slackened` event.

## 9. Length and elongation

- Reference path length: 12.728 m; effective elastic length equals the reference length (tension
  ratios all 1).
- Final elongation: **+7.19e-4 m**, ~4e9 times the numerical zero tolerance (1.8e-13 m); the
  activation is not a tolerance artifact.
- Final check of the constitutive relation: F = E _ A _ dL / L = 2e8 _ 1e-3 _ 7.19e-4 / 12.728 =
  11.3 kN, matching the reported force.

## 10. Main events before / after activation

- lambda 0.00 (preload): joints J-001, J-003, J-004, J-006 open.
- lambda 0.10: J-005, J-007 open.
- **lambda 0.475: sliding-started + plastic-sliding at the right springing joint J-007.** Under the
  new default policy the design path continues (local plasticity is not a global failure; no failed
  criterion is produced).
- lambda 0.725: J-007 closes again.
- **lambda 0.953669: `passive-tendon-activated` (observable event).**
- lambda 1.000: J-007 re-opens; analysis terminates `target-reached`.

## 11. Converged steps after activation

- One full converged scalable step after activation (step 15, lambda = 1.0) plus the activation step
  itself; 15 completed steps and 1 cutback. The equilibrium path continues with positive evolving
  tendon force.

## 12. Reaching lambda = 1

- Yes: `convergenceInfo.termination = "design-state-reached"`, `lambda = 1`, converged residuals
  within tolerance, `engineeringAssessment.status = "PASS"`, `result.status = "ok"`.

## 13. Verdict

- **PASS** with zero failed criteria, `failureMode = null`.

## 14. Criteria that could prevent PASS

- None under the default policy. Boundary documentation: with the strict opt-in
  `designFailureEvents: ["plastic-sliding"]` the design path FAILs at lambda = 0.475 (criterion
  `plastic-sliding` at J-007, checkId `coulomb-friction`, utilization exactly 1) before the tendon
  activates. The PASS therefore relies on the decision-0012 default (local sliding continues); the
  mechanical activation sequence does not.

## 15. Comparison with the arch without the tendon

Same arch, loads, and interfaces, no reinforcement:

- With tendon: PASS, lambda = 1.
- Without tendon: **INDETERMINATE**, `minimum-step` with a non-null `maximumObservedLambda`;
  `capacity.lambdaPeak` remains null because no two-sided branch turn was certified.

This is the strongest outcome (CASO 1): the passive tendon is necessary for the design state to be
reached. No parameter was tuned to manufacture the contrast — the same configuration is used with
and without the reinforcement.

## 16. Kinematic interpretation

At lambda = 1 with the tendon:

- Joint **J-003** (left quarter point) opens **8.6 mm at the intrados**; J-001, J-005, J-006 open at
  the extrados (4.3, 0.6, 2.0 mm); the right springing joint **J-007 slides**.
- The crown deviator moves from (0, 4.5) to (0.022, 4.486) m and the right springing deviator from
  (4.5, 0) to (4.529, 0) m: the asymmetric patch pushes the left half down, the arch sways right and
  the right spring slips outward.
- Tendon segment left-spring -> crown lengthens by +5.84e-3 m (dominated by the J-003 intrados hinge
  opening), segment crown -> right-spring shortens by -5.12e-3 m (extrados openings J-005/J-006);
  the net is +7.19e-4 m.
- Because the path lengthens, compatibility stretches the tendon, which develops 11.3 kN and
  redistributes the internal actions through the three rigid deviators. The tied arch
  re-equilibrates and reaches lambda = 1, while the untied arch loses equilibrium at lambda ~ 0.958.

## 17. Suspected bugs

None. The elongation, strain, force, slack/active-passive state, and activation event behave
consistently with the documented compatibility model in every explored configuration. Two behavioral
notes, not bugs:

- A passive tendon activates when its complete resolved path lengthens enough to make
  `T0 + E A DeltaL / Lref` positive. Arch and external anchors affect that path through their
  declared kinematics; neither carries an anchorage-capacity model.
- With many voussoirs the cumulative elastic joint closure shortens the intrados path at design
  loads, so activation is confined to mechanisms close to the limit point; this is the physical
  behavior of the current model family, not a defect.

## 18. Tests added

`tests/masonry-arch-passive-intrados-benchmark.test.ts`:

- A. activation: event present with 0 < lambda < 1, force exactly 0 before, positive after, positive
  elongation far above the numerical tolerance, no slack/active oscillation.
- B. continuation: converged scalable steps after activation with positive evolving force.
- C. design PASS: lambda = 1, assessment PASS, result ok, zero failed criteria.
- D. activation is an observable event and never a failed criterion (sliding continues under the
  default policy while no criterion fails).
- E. comparison: the same arch without the tendon cannot reach lambda = 1 (INDETERMINATE).
- F. strict opt-in policy boundary: `designFailureEvents: ["plastic-sliding"]` fails at lambda =
  0.475 before activation.

## 19. Validation contract

The executable regression participates in `npm run test:run`. Repository delivery additionally
requires `npm run check` and the non-mutating `npm run benchmark:masonry-arches`; current validation
counts belong in the delivery report rather than being frozen into this mechanical case note.

## 20. Conclusion

> **PASSIVE INTRADOS ACTIVATION + PASS BENCHMARK FOUND**

The current mechanical model contains a physically sensible case of a passive intrados tendon (zero
initial force) that activates by path-elongation compatibility at lambda = 0.9536693, develops
positive force, redistributes actions, continues the equilibrium path, and reaches lambda = 1 with
`PASS`. The same arch without the tendon does not reach lambda = 1, so the benchmark also
demonstrates the tendon's stabilizing role. The design PASS uses the default local-plasticity policy
introduced by the parallel iteration; the strict opt-in policy boundary is documented and tested.
