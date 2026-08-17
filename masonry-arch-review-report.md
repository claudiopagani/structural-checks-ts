# Critical technical review: masonry-arch test & validation assets

**Repository:** structural-checks-ts | **Scope:** tests/masonry-arch-\*.test.ts (11 files, ~110
tests), benchmarks/masonry-arches/, 4 docs | **HEAD reviewed:**
74a58c8863c5d1edae7bda1fee275782ec63bfa2

---

## 1. What is actually validated — and what is not

There are two separate evidence layers with very different strength.

### 1.1 The literature benchmark campaign (benchmarks/masonry-arches/)

Validated quantities (report tables, benchmarks/masonry-arches/results/validation-report.md:26-48):

- **NTM collapse loads / kinematic multipliers** of the limit analysis against four sources
  (bertolesi-2018, carozzi-2018, oliveira-2010, simoncello-2020): 19 specimens, 23 comparison rows,
  16 quantitative.
- **One software-correctness anchor** (report:27): the library limit multiplier vs an independent
  four-hinge virtual-work enumeration over the same library-published wrenches — the **only**
  "within-tolerance" row (0.0% error, 0.1% tolerance).
- **Mechanism agreement** as a single boolean per row (mechanismAgreement: pass|fail|not-assessed),
  hinge lists printed in notes (report:31, :37-40), sliding/crushing interface counts.
- **Convergence study** on voussoir count (report:63-68), **integration-point study**
  (report:72-76), **arc-length robustness study** (report:80-85).
- Tolerances are explicit per row (5% for numerical references, 20-25% for experiments;
  benchmarkRunner.ts:117-127, case declarations in scripts/benchmark-masonry-arches.ts).

Validated **quantities with quantitative acceptance**: essentially **none pass**. Of 16 quantitative
comparisons, 15 are outside tolerance (-14.4% to -98.9%); the single within-tolerance row is the
internal arithmetic anchor, explicitly not a literature value. The report's verdict "SATISFACTORY
WITH DOCUMENTED MODEL LIMITATIONS" rests on (a) the arithmetic anchor, (b) discretization
convergence, (c) plausible model-form explanations. That is an honest but **weak external validation
outcome**: no engineering quantity is reproduced within a pre-declared tolerance against any
independent reference.

**Not validated by the campaign:**

- **Tie-rod slot** — requirement >= 2, **0 exercised** (report:139-141, catalog priority set: empty
  specimenIds).
- **Nonlinear load-displacement curves** — requirement >= 2, **0 exercised**; digitization pending
  (report:142).
- **Intrados bonded (CSI)** — 4 rows, all deliberately **qualitative-only upper bounds**
  (report:41-44), no bond-slip law.
- **Post-peak softening, backfill passive interaction, deformable piers/abutments** — declared not
  covered in the coverage matrix (catalog.json coverage entries;
  coverage-and-priorities.md:21-22,26).
- The **Heyman-type elastic-unbounded response** (added after the campaign, commit 74a58c8):
  validated **only by self-consistency and equivalence tests**, no external benchmark
  (docs/masonry-arch-heyman-regularized-interface.md:110-129 explicitly claims no normative
  conformity).
- The **passive-tendon benchmark** validates internal constitutive consistency (F = EA\*dL/L
  computed by hand in docs/masonry-arch-passive-intrados-validation.md:151), not an external value.

### 1.2 The unit/regression suite (tests/)

The only quantitative literature pin in the entire test tree is the D'Ambrisi 2015 rectangular
no-tension-compression section domain (tests/masonry-arch-literature-benchmarks.test.ts:14-27;
normalCapacity 7821, momentCapacity 261.6417337936325, eccentricityLimit 0.2616... — this matches
the analytic plastic-block formula e = h/2 - N/(2*b*fc) = 0.3 - 1000/(2*2.75*4740) = 0.261642 m,
i.e. it pins an implemented closed form, not a measured quantity). Everything else is
regression/behavior pinning: status mappings, lambda landmarks, event taxonomies, step-coherent
criteria, control-type equivalence, corrector exactness. Those are valuable **software** tests but
they validate the solver against itself.

**Summary of what is NOT validated anywhere:** elliptical/pointed/segmental geometry (implemented in
src/applications/masonry-arches/geometry.ts, zero tests), keystone behavior (22 source references,
zero tests), the fill load type (implemented in types.ts/resolveMasonryArchLoads.ts, zero tests),
intrados/extrados reference curves (zero tests), frp/sfrm bonded families in unit tests (only frcm
appears), continuous-external terminations, hinge _positions_ against published sequences, and any
external anchor for the deformable path analysis (tendon forces, displacements, limit lambdas).

---

## 2. Quality of the validation evidence

**Strengths.** Tolerances are pre-declared and carried machine-readably (benchmarkRunner.ts:63,
acceptanceTolerance); the discrepancy taxonomy is fixed and enforced (benchmarkRunner.ts:18-26);
failures are documented rather than hidden — 15/16 outside-tolerance rows stay in the table with
notes, calibration rows (FRP_V, TRM_V, SRG-fitted) are explicitly marked non-independent
(report:46-48,126-128), and negative model-form results (Oliveira US-1 at -98.5%) are kept
(report:33). The independent-mechanism anchor, convergence study, and arc-length robustness study
are genuinely good methodological infrastructure, and the report refuses to aggregate a misleading
single accuracy score (report:19-20).

**Weaknesses.**

1. **Evidence is stale and not machine-verified.** The committed report/results record "Solver
   revision: 56568c78..." (report:3; validation-results.json carries the same), but HEAD is 74a58c8
   — two commits later, and commit 1bb64bc **changed the runner itself** (git log 56568c7..HEAD for
   scripts/benchmark-masonry-arches.ts and cases/) while the committed results still carry the older
   revision. npm run check does not run the benchmark, and CI runs only npm run check
   (.github/workflows/ci.yml:39). The evidence is a point-in-time snapshot that can silently diverge
   from the solver it claims to validate; nothing fails when results/ goes stale.
2. **Tolerance setting is not uncertainty-derived.** URM tolerance is 20-25% "because replicate
   scatter is large" (report:92-94) yet the two nominally identical Oliveira specimens scatter by
   ~29% (1.43/1.92 kN) — the declared 20% tolerance is _tighter_ than the observed inter-specimen
   scatter of the very specimens used. Tolerances are flat percentages with no error model.
3. **Single-annotator discrepancy classification.** Classification is assigned in the case code by
   the author (scripts/benchmark-masonry-arches.ts:79-81,381 etc.) with no independent review. Two
   borderline/concerning cases: bertolesi U_V at -14.4% vs a 5% "numerical" tolerance is classified
   MODEL_FORM_DIFFERENCE (report:28) — a near-miss that could as plausibly be an input/unit-weight
   gap; and the CSE sliding cases are classified UNAVAILABLE_INPUT (friction unpublished) although
   the reported sensitivity (report:102: mu 0.3->1.65 kN at mu 0.7) shows that **even the most
   favorable friction cannot reach the experimental 2.51-3.82 kN** — the dominant gap is a
   model-form difference, and the classification understates it.
4. **"Mechanism pass" is self-referential.** mechanismAgreement: run.slidingCount > 0 ? "pass" :
   "fail" (scripts/benchmark-masonry-arches.ts:380) derives the verdict from the solver's own
   output, not from the paper's documented joints; the hinge check for carozzi U_A requires only ">=
   4 hinges and >= 1 extrados hinge" (lines 201-218), not the published hinge locations.
5. **Doc/test drift.** The validation doc pins activation at step 11
   (docs/masonry-arch-passive-intrados-validation.md:131) while the committed test asserts
   activation.step === 14 (tests/masonry-arch-passive-intrados-benchmark.test.ts:128); the doc says
   "12 completed steps" (doc:167) vs the test's different partitioning; the assessment-refinement
   doc claims "23 tests" (doc:39,178) while the file now contains 30. The doc is marked historical,
   but the drift shows the committed tests and the committed evidence were not regenerated together.
6. **The "certified" verification limit is continuation-parameter-dependent.** The arc-length study
   (report:80-85) shows the same case certifying lambdaVerif = 0.9054 under radius 0.05 but
   degrading to INDETERMINATE (max lambda ~ 0.9054-0.9055) under radii 0.02/0.1/0.2. Documented
   honestly, but it means reported lambdaVerificationLimit values are meaningful only with the
   continuation settings attached — and the unit tests only assert "< 1", so nothing pins the
   benchmark numbers.
7. **Corpus still draft.** catalog.json:5 is status draft, and the campaign ran against it; sources
   access notes are self-reported.

---

## 3. Test quality: mechanics vs plumbing, tautologies, coverage gaps

### 3.1 Genuinely strong tests (test mechanics)

- **Step-coherent criterion data** — O1/O2a/O2b/O3 verify that failed criteria copy
  demand/capacity/utilization from the event's own converged step, with analytic identities (demand
  = |shearForce|, capacity = 0.5\*N; tests/masonry-arch-engineering-assessment.test.ts:1020-1213).
- **Analytic demand recomputation** — D3 pins stress = F/A = 250 000 kPa vs capacity 150 000 (lines
  893-898).
- **Control-type equivalence** — load vs arc-length controls recover the same pre-peak state within
  2e-7 (tests/masonry-arch-path.test.ts:218-248).
- **Certified limit-point internal coherence** — lambda, q, committed states, curves, events,
  criteria all agree on one certified state
  (tests/masonry-arch-arc-length-design-check.test.ts:320-421).
- **Elastic-unbounded vs unmobilized elastic-Coulomb equivalence** — a real constitutive cross-check
  (tests/masonry-arch-heyman-regularized.test.ts:585-646).
- **No-fabricated-causality guardrails** (equilibrium-infeasible never promoted to interface
  criteria; tests B/C/G in the assessment file) and the exact-lambda-1 corrector assertions.

### 3.2 Weak, tautological, or plumbing-only assertions

- **A claimed validation result is never asserted.** In
  tests/masonry-arch-verification-facade.test.ts:434-452 ("active T0 improves or worsens the
  outcome"), the bare arch run is computed and then void bare; (line 452) — the test's own comment
  claims the bare arch "stalls numerically", but no assertion checks it. The "improves" half of the
  test name is untested.
- **Finiteness-only reinforcement test.** tests/masonry-arch-reinforcement.test.ts:63-82 reduces the
  tendon block wrenches to a resultant and asserts only Number.isFinite + length > 0 (lines 78-81).
  It would pass if the tendon force were wrong, doubled, or applied at the wrong intrados location;
  the known T0 = 100 kN action is never checked.
- **Step-count heuristic as a mechanical claim.**
  tests/masonry-arch-passive-intrados-benchmark.test.ts:219-224 asserts the unreinforced arch
  completes _more steps_ than the reinforced one — an implementation artifact of step-size
  adaptation, not a mechanical property, and brittle to any solver change.
- **Near-vacuous permissive ORs.** failureMode === "sliding" || failureMode === "mixed"
  (tests/masonry-arch-state.test.ts:191) and — strongest example — status === "PASS" || status ===
  "FAIL" (tests/masonry-arch-engineering-assessment.test.ts:973-976), which is vacuous at runtime
  (the real check there is the compile-time @ts-expect-error, which is good, but the runtime
  assertion adds nothing).
- **Plumbing-only bonded-domain test.** tests/masonry-arch-literature-benchmarks.test.ts:59-61
  asserts facets.length > 4 and capacity > 0.
- **Taxonomy-only failure-mode tests** (13 tests in
  tests/masonry-arch-failure-mode-families.test.ts) — legitimate for a classification function, but
  they never touch mechanics.
- **Absence-assertions used as semantics** ("deformedConfiguration" in outputs === false) are fine,
  but repeated across files they pin API shape rather than behavior.

### 3.3 Coverage gaps in the suite

- **Geometry:** all 11 files use profile circular, referenceCurve centerline, span 10, rise 5 (e.g.
  tests/masonry-arch-state.test.ts:22-33, tests/masonry-arch-path.test.ts:47-55). Zero tests for
  elliptical/pointed/segmental profiles, intrados/extrados reference curves, or the keystone (all
  implemented in source).
- **Load types:** patch/point/uniform are covered; the **fill load type is implemented but has zero
  tests** anywhere in the suite or the benchmark cases (grep "fill" in tests -> none).
- **Bonded layers:** only family frcm in unit tests; **frp and sfrm families are exercised only
  inside the benchmark runner**, never in the unit suite. continuous-external termination behavior
  (documented as "zero elastic increment" in
  docs/masonry-arch-passive-intrados-validation.md:222-224) is untested.
- **Mechanism extraction:** collapseMechanism.kinematicallyVerified === true and residual < 1e-10
  (tests/masonry-arch-state.test.ts:125-126) but **no test pins hinge locations** of a known
  mechanism; the benchmark's hinge check is the weak boolean noted in section 2.4.
- **Numerical-method coverage:** no unit-level mesh-convergence test (only the benchmark study); no
  test pins lambdaVerificationLimit values, only "< 1".
- **Determinism fragility:** step-index pins (activation.step === 14, test:128) and step-count
  comparisons make the suite sensitive to step partitioning rather than mechanics.
- **Internal-seam imports:** tests/masonry-arch-arc-length-design-check.test.ts:15-20 imports
  ../dist/... (a build artifact, outside package exports) — acceptable for a safety-seam test but a
  strict-suite dependency on build output.

---

## 4. Concrete improvement proposals, ranked by engineering value

1. **Make the benchmark evidence current and CI-enforced (highest value).** Re-run npm run
   benchmark:masonry-arches at HEAD, commit the fresh results/, and add a CI job (or extend npm run
   check) that re-runs the suite and fails on any diff of results/validation-results.json. This
   converts the currently stale, point-in-time snapshot (recorded revision 56568c7 vs HEAD 74a58c8,
   runner changed in 1bb64bc without a fresh run) into continuously verified evidence.
2. **Fix the unasserted claim in tests/masonry-arch-verification-facade.test.ts:434-452:** assert
   the bare arch's engineeringAssessment.status === "INDETERMINATE" (and, if desired, its last
   converged lambda ~ 0.958 per doc section 15) instead of void bare;.
3. **Pin mechanical quantities, not heuristics, in the passive-tendon benchmark:** assert the final
   tendon force equals E*A*dL/L_eff computed from the published state (doc section 9 computes 11.3
   vs 11.29 kN — make that a test assertion), and assert the no-tendon INDETERMINATE lambda value
   rather than the completed-steps heuristic
   (tests/masonry-arch-passive-intrados-benchmark.test.ts:219-224).
4. **Close the implemented-but-unvalidated surface with analytic anchors:** unit tests for
   elliptical geometry, keystone, and fill loads (all implemented, zero tests); analytic checks such
   as the thrust-line/kern of an elliptical arch and fill-induced horizontal thrust. These are cheap
   because they do not require new experiments.
5. **Strengthen the mechanism comparisons to hinge positions:** replace the ">=4 hinges + >=1
   extrados" boolean (scripts/benchmark-masonry-arches.ts:201-226) and the self-derived
   slidingCount > 0 pass (line 380) with assertions against the published hinge sequence from the
   Oliveira/Carozzi tables (they are in the source records).
6. **Add unit coverage for the untested reinforcement surface:** frp/sfrm bonded families,
   continuous-external terminations (assert the documented non-activation), and a wrench-level check
   that the tendon resultant equals the known T0 action (magnitude and location) instead of
   finiteness-only (tests/masonry-arch-reinforcement.test.ts:78-81).
7. **Purge vacuous and permissive assertions:** PASS || FAIL
   (tests/masonry-arch-engineering-assessment.test.ts:973-976) and sliding || mixed
   (tests/masonry-arch-state.test.ts:191) — replace with the deterministic expected mode.
8. **Rationalize tolerances and pin benchmark numbers in tests:** derive tolerance choices from
   documented scatter (the 20% URM tolerance is _below_ the 29% replicate scatter it claims to
   cover); add test assertions pinning lambdaVerificationLimit values for the arc-length benchmark
   cases so the continuation-parameter sensitivity (report:80-85) cannot silently drift; record
   continuation settings alongside every reported lambdaVerificationLimit.
9. **Independent review of borderline discrepancy classifications:** at minimum, revisit U_V (-14.4%
   vs 5%) and the CSE "UNAVAILABLE_INPUT" labeling — the reported mu sensitivity (0.5 -> 0.676 kN,
   max 1.65 kN at mu 0.7 vs 2.51-3.82 kN experimental) shows friction cannot close the gap, so the
   classification likely should be MODEL_FORM_DIFFERENCE with a documented sliding/bonding mechanism
   study.
10. **Reconcile doc vs test evidence:** align docs/masonry-arch-passive-intrados-validation.md step
    numbers (doc:131 "step 11" vs test:128 "step 14", doc:167 "12 steps") and the "23 tests" claim
    (doc:39,178 vs 30 today); keep the superseded-section status lines consistent (several docs
    already do this well).
