# Passive intrados tendon validation: activation + redistribution + design PASS at lambda 1

Status: validated benchmark found | Scope: `applications/masonry-arches` path analysis

This report records an isolated validation campaign for the masonry-arch passive intrados tendon
model. It answers one question: does the current mechanical model contain a physically sensible case
in which a passive intrados tendon follows the sequence

```text
T0 = 0  ->  arch initially equilibrated  ->  deformation/opening  ->  intrados-path elongation
        ->  passive activation  ->  T > 0  ->  redistribution  ->  continuation  ->  lambda = 1  ->  PASS
```

The campaign did **not** modify the solver, the tendon formulas, the compatibility, or the
design-policy code. Only new files were added. The conclusion is the strongest success case:

> **PASSIVE INTRADOS ACTIVATION + PASS BENCHMARK FOUND**

## 1. Baseline used

- Repository: `structural-checks-ts`
- HEAD at campaign start: `e7c6ebe9ac886907295b6d3a939e8340619f4ec0` (`archi: modifiche ulteriori`)
- The working tree additionally carries the uncommitted "local plastic limits are not global
  failures" iteration (decision record
  `docs/decisions/0012-local-plastic-limits-are-not-global-failures.md`, path schema version
  `8.0.0`). That iteration changes the **default design-failure policy**: `plastic-sliding`,
  `compression-strength-reached`, and `crushing` are no longer default design-failure events; local
  plastic sliding and perfectly-plastic crushing continue the path by default, while the caller can
  opt into a stricter policy with `designFailureEvents`.
- The benchmark depends on that default policy: under the previous strict default it stops at the
  first plastic sliding (lambda = 0.475) before activation. The mechanical sequence itself
  (activation at lambda = 0.975) is policy-independent.

## 2. Files added / modified

Added only (no source, no test-suite modifications):

- `tests/masonry-arch-passive-intrados-benchmark.test.ts` — deterministic regression test (6 tests).
- `docs/masonry-arch-passive-intrados-validation.md` — this report.
- `migration/parity-inventory.json` + `docs/parity-inventory.md` — deliberate frozen-record update
  for the new test file (TypeScript-side tests count 425 -> 426, JavaScript side untouched), as
  required by `npm run check:parity-inventory`.

Temporary exploration scripts were used locally and removed before delivery.

## 3. Exact passive intrados tendon model (audit)

All in `src/applications/masonry-arches/resolveArchReinforcements.ts`:

1. **Reference path** — `createSideArcStationing` integrates the intrados arc length between
   interface stations; path nodes are placed at equally spaced side-arc stations (rigid deviators,
   count odd >= 3, one at the crown) plus terminal-connector stations. The node reference points are
   the intrados curve points of the undeformed arch.
2. **Reference length** — `referencePathLength` is the polyline length through the node reference
   points (two chords of 6.364 m each for 3 deviators, total 12.728 m).
3. **Deformed path** — every node is rigidly attached to its voussoir(s) (`transformPointByBlock`;
   interface nodes share 0.5/0.5 between the two adjacent blocks). The current path is the polyline
   through the moved points.
4. **Delta-L** — `elongation = currentPathLength - referencePathLength`; values below
   `elongationTolerance = 64 * EPS * max(1, Lref, Lcur)` are treated as zero.
5. **Compatibility mode** — `anchored-length-compatible` only when both terminations are
   `distributed-anchorage`; then
   `effectiveElasticLength = sum(referenceSegmentLengths[i] * segmentTensionRatios[i])` (equal to
   the full reference length for `connectorCount: 1`). Any other termination combination is
   `externally-force-controlled`, with zero elastic increment (a passive tendon can therefore only
   activate with distributed anchorage on both ends).
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
L_effective = sum(L_reference_i * ratio_i)          (ratio_i = 1 for connectorCount 1)
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
- **Tendon**: deviator counts 3, 5, 7; area 1e-3 m2; E = 200 GPa; both terminations
  distributed-anchorage; initialForce 0.
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
- Reinforcement: id `passive-intrados`, side `intrados`, rigid deviators count 3, area 0.001 m2, E =
  200 GPa, **initialForce 0**, yield 450 MPa, tensile 550 MPa, terminations distributed-anchorage
  connectorCount 1 on both sides.
- Analysis: `design-state-check`, scalable ["Q"], equilibrium tolerance 1e-7, maxIterations 50,
  maxSteps 200 (default load control to targetLambda 1, default design-failure events).

## 7. Activation lambda

- Activation event at **step 11, lambda = 0.975** (0 < lambda < 1 as required).

## 8. Tendon force before / after activation

| step | lambda | state          | force (kN) | elongation (m) |
| ---- | ------ | -------------- | ---------- | -------------- |
| 8    | 0.725  | slack          | 0          | -5.73e-4       |
| 11   | 0.975  | active-passive | **8.84**   | +5.63e-4       |
| 12   | 1.000  | active-passive | **11.29**  | +7.19e-4       |

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
- **lambda 0.975: joint J-004 closes; `passive-tendon-activated` (observable event).**
- lambda 1.000: J-007 re-opens; analysis terminates `target-reached`.

## 11. Converged steps after activation

- One full converged scalable step after activation (step 12, lambda = 1.0, 5 Newton iterations)
  plus the activation step itself; 12 completed steps, 0 cutbacks. The equilibrium path continues
  with positive evolving tendon force.

## 12. Reaching lambda = 1

- Yes: `convergenceInfo.termination = "target-reached"`, `lambda = 1`, converged residuals within
  tolerance, `engineeringAssessment.status = "PASS"`, `result.status = "ok"`.

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
- Without tendon: **INDETERMINATE**, `minimum-step` at **lambda = 0.9578** (peak 0.9578, 19
  completed steps, 7 cutbacks); the load-controlled path cannot reach the design state.

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

- A passive intrados tendon can only activate with `distributed-anchorage` on both ends
  (`anchored-length-compatible` mode); with a `continuous-external` termination the elastic
  increment is zero by design.
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

## 19. Validation executed

On the working-tree baseline described in section 1:

- `npm run build` — clean.
- New test file in isolation — 6/6 pass (~3 s).
- Full canonical test suite — 313 tests, 313 pass, 0 fail (includes the 6 new tests and every
  masonry-arch test).
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npx prettier --check` on the new files — clean.
- `npm run check` — exit code 0: architecture (532 source files), normative references, provenance,
  parity inventory (426 tests, record updated deliberately), package, packed consumer, browser
  bundle and web worker checks all pass.

## 20. Conclusion

> **PASSIVE INTRADOS ACTIVATION + PASS BENCHMARK FOUND**

The current mechanical model contains a physically sensible case of a passive intrados tendon (zero
initial force) that activates by path-elongation compatibility at lambda = 0.975, develops positive
force, redistributes actions, continues the equilibrium path, and reaches lambda = 1 with `PASS`.
The same arch without the tendon does not reach lambda = 1, so the benchmark also demonstrates the
tendon's stabilizing role. The design PASS uses the default local-plasticity policy introduced by
the parallel iteration; the strict opt-in policy boundary is documented and tested.
