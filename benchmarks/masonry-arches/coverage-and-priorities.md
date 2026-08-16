# Solver coverage and priority benchmark set

This document answers two questions: which phenomena of the masonry-arch module are exercised by
this corpus (and which are not), and which benchmarks should be implemented first in step 2. The
canonical machine-readable versions live in `catalog.json` (`coverage` and `priorityBenchmarkSet`).
The solver capabilities referenced here are the current public behavior documented in
`docs/masonry-arch-analysis.md`; this step does not change them.

## Solver coverage

| Corpus phenomenon                                  | Solver capability                                                                                                                                                | State                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Four-hinge mechanism, rocking collapse             | Limit analysis and path analysis publish joint opening and hinge events; equilibrium analysis reports hinge positions                                            | covered                          |
| Joint sliding (Coulomb)                            | Friction coefficient and cohesion per interface; `plastic-sliding` events; friction checks                                                                       | covered                          |
| Finite compressive strength, crushing              | Finite `compressiveStrength`; uniform-edge-block check (equilibrium) and deformable-interface compression check (path); optional perfectly-plastic post-crushing | covered                          |
| FRP bonded layers, intrados/extrados               | `bondedLayers` family `frp` with area, modulus, tensile strength, `debondingStrain`, `ultimateStrain`, anchored/unanchored terminations                          | covered                          |
| FRCM / SRG / TRM composites                        | `bondedLayers` families `frcm` and `sfrm` (SFRM via equivalent membrane); no matrix cracking or tension-stiffening branch                                        | partial                          |
| Passive tie-rods, initial prestress                | Intrados/extrados reinforcement (tendon) with rigid deviators or unilateral contact, `initialForce`, yield/rupture limits, distributed anchorage                 | representable with approximation |
| Spike anchors / distributed anchorage              | `anchored` terminations and `distributed-anchorage` terminations with connector capacities                                                                       | representable with approximation |
| Backfill interaction (passive pressure, haunching) | Fill available only as load (`fill` load type); no passive interaction                                                                                           | not covered                      |
| Deformable piers / abutment flexibility            | `rigid-contact` supports; no pier deformability                                                                                                                  | not covered                      |
| Post-peak softening branch                         | Path analysis is load-controlled; loss of convergence is `INDETERMINATE`, never a physical failure                                                               | not covered                      |
| Displacement-controlled tests                      | Load control only; pre-peak comparison meaningful, post-peak not                                                                                                 | partial                          |
| Bond-slip law (slip, fracture energy)              | Threshold `debondingStrain`; no slip-based bond law                                                                                                              | partial                          |

Consequences for the corpus:

- Tier A/B peak-load, hinge, sliding, and crushing comparisons can start immediately.
- The Prestwood bridge test (Tier B) can only be compared with the fill treated as load; the known
  passive-fill contribution must be reported as a modeling difference, never absorbed into a
  calibrated coefficient without an explicit decision.
- Curve comparisons use the pre-peak branch only until displacement control or a softening model is
  implemented; digitized post-peak branches are retained in `datasets/` as reference material, not
  as pass/fail criteria.
- SRG/TRM quantitative comparisons carry the known absence of tension stiffening; the Bertolesi
  fitted equivalent strengths (172/187/386 MPa) are recorded precisely so the later comparison is
  against the same conventional quantity.

## Priority benchmark set

The iteration requires at least: 3 URM, 2 tie-rod, 2 intrados bonded, 2 extrados bonded, 2
compressive/sliding governed, and 2 nonlinear-curve cases. The proposal below satisfies every slot
with the data currently in the corpus, with the tie-rod slot explicitly gated on full-text access
(because no open-access tie-rod dataset could be retrieved in this step).

### 1. URM (requirement: ≥ 3 — proposed: 4)

| Priority | Specimen                        | Tier | Peak              |
| -------- | ------------------------------- | :--: | ----------------- |
| 1        | `oliveira-2010/US-1` + `US-2`   |  A   | 1.43 / 1.92 kN    |
| 2        | `carozzi-2018/U_A`              |  A   | 2.08 kN           |
| 3        | `simoncello-2020/prestwood-URM` |  B   | 228 kN            |
| 4        | `bertolesi-2018/U_A-numerical`  |  A   | 1.725 kN (NTM LB) |

Rationale: two independent half-scale geometries exercise the four-hinge mechanism with exact loads
and documented hinge sequences; Prestwood adds scale and fill interaction; the numerical companion
gives a lower-bound reference for the rigid-plastic solver path.

### 2. Tie-rod (requirement: ≥ 2 — gated on access)

Candidates: `ural-2016`, `tie-rod-connection-2022`, `persian-brick-arches-2023`, `tie-rod-jse-2015`.

No tie-rod campaign has an accessible full text as of 2026-08-16. The slot is therefore **pending
access**: two records must be promoted to `data-extracted` (geometry, tie position and steel
section, masonry data, measured capacities, failure mode) before the slot is exercised. The solver
side is already capable (tendon reinforcement with deviators, `initialForce`, distributed
anchorage); nothing in this step calibrates or blocks that capability.

### 3. Intrados bonded (requirement: ≥ 2 — proposed: 3)

| Priority | Specimen                              | Tier | Peak             |
| -------- | ------------------------------------- | :--: | ---------------- |
| 1        | `oliveira-2010/CSI-1` + `CSI-2`       |  B   | 4.26 / 4.63 kN   |
| 2        | `oliveira-2010/CSI-3` + `CSI-4`       |  B   | 5.41 / 3.81 kN   |
| 3        | `simoncello-2020/borri-2011-arch-FRP` |  B   | curve (digitize) |

Prerequisite: bond parameters from `basilio-2007-thesis` Chapter 3 to set `debondingStrain` /
`ultimateStrain`; spike-anchor cases compare against `anchored` terminations with the difference
documented.

### 4. Extrados bonded (requirement: ≥ 2 — proposed: 2 + 1 pending)

| Priority | Specimen                          |      Tier      | Peak           |
| -------- | --------------------------------- | :------------: | -------------- |
| 1        | `oliveira-2010/CSE-1` + `CSE-2`   |       A        | 2.51 / 3.82 kN |
| 2        | `carozzi-2018/SRG_A`              |       B        | 8.83 kN        |
| 3        | `alecci-2016` (extrados PBO-FRCM) | pending access | —              |

### 5. Compression / sliding governed (requirement: ≥ 2 — proposed: 3)

| Priority | Specimen                                             |      Tier      | Governed by                                |
| -------- | ---------------------------------------------------- | :------------: | ------------------------------------------ |
| 1        | `oliveira-2010/CSE-1` + `CSE-2` (+ `CSE-3`, `CSE-4`) |       A        | sliding along a joint near the support     |
| 2        | `carozzi-2018/SRG_A`                                 |       B        | masonry crushing at the loaded section     |
| 3        | `bertolesi-2018/SRG_A-numerical`                     |       B        | sliding activation, friction fit 20–22.5°  |
| 4        | `caporale-luciano-2012`                              | pending access | finite compressive strength limit analysis |

### 6. Nonlinear load-displacement (requirement: ≥ 2 — proposed: 4)

| Priority | Specimen                                 | Figure to digitize                      |
| -------- | ---------------------------------------- | --------------------------------------- |
| 1        | `carozzi-2018/U_A` + `SRG_A`             | Carozzi et al. 2018, Figs 11 and 12     |
| 2        | `oliveira-2010/US-1` / `CSI-1` / `CSE-1` | Oliveira et al. 2010, Figs 6a, 10a, 12a |
| 3        | `simoncello-2020/borri-2011-arch-FRP`    | Simoncello et al. 2020, Fig. 6A         |
| 4        | `simoncello-2020/prestwood-URM`          | Simoncello et al. 2020, Fig. 9          |

Digitization rules: see `datasets/README.md` and `schema/dataset-sidecar.schema.json` (marking,
tolerance, provenance).

## Ordering recommendation for step 2

1. Digitize the priority curves (nonlinear slot enablement).
2. Implement the four Tier A URM benchmarks and the CSE sliding set against the current solver;
   record outcomes as versioned validation evidence without changing the solver.
3. Obtain full texts for the tie-rod slot and the Alecci FRCM papers; promote the pending records.
4. Only after the corpus is stable, consider solver changes measured against it.
