# Specimen table, tier classification, and implementability

Canonical machine-readable data: `catalog.json` and the per-source records under `sources/`. This
document is the human-readable summary.

## Specimen table

| Specimen id                               | Source                         | Type         | Tier | Peak / collapse load    | Key result and failure mode                                                     |
| ----------------------------------------- | ------------------------------ | ------------ | :--: | ----------------------- | ------------------------------------------------------------------------------- |
| `oliveira-2010/US-1`                      | Oliveira et al. 2010           | experimental |  A   | 1.43 kN                 | Four-hinge mechanism; brittle                                                   |
| `oliveira-2010/US-2`                      | Oliveira et al. 2010           | experimental |  A   | 1.92 kN                 | Four-hinge mechanism; brittle                                                   |
| `oliveira-2010/LS-1`                      | Oliveira et al. 2010           | experimental |  B   | 3.18 kN                 | Pre-damaged arch; new hinges beyond 530 mm strips                               |
| `oliveira-2010/LS-2`                      | Oliveira et al. 2010           | experimental |  B   | 2.73 kN                 | Same as LS-1                                                                    |
| `oliveira-2010/CSI-1`                     | Oliveira et al. 2010           | experimental |  B   | 4.26 kN                 | Intrados GFRP 2×50 mm; FRP detachment with brick ripping                        |
| `oliveira-2010/CSI-2`                     | Oliveira et al. 2010           | experimental |  B   | 4.63 kN                 | Same as CSI-1                                                                   |
| `oliveira-2010/CSI-3`                     | Oliveira et al. 2010           | experimental |  B   | 5.41 kN                 | Intrados GFRP + 4 spike anchors/strip                                           |
| `oliveira-2010/CSI-4`                     | Oliveira et al. 2010           | experimental |  B   | 3.81 kN                 | Same as CSI-3                                                                   |
| `oliveira-2010/CSE-1`                     | Oliveira et al. 2010           | experimental |  A   | 2.51 kN                 | Extrados GFRP 2×50 mm; **joint sliding near right support**                     |
| `oliveira-2010/CSE-2`                     | Oliveira et al. 2010           | experimental |  A   | 3.82 kN                 | Same sliding mode                                                               |
| `oliveira-2010/CSE-3`                     | Oliveira et al. 2010           | experimental |  A   | 3.62 kN                 | Extrados GFRP 2×80 mm; sliding                                                  |
| `oliveira-2010/CSE-4`                     | Oliveira et al. 2010           | experimental |  A   | 3.26 kN                 | Same sliding mode                                                               |
| `carozzi-2018/U_A`                        | Carozzi et al. 2018            | experimental |  A   | 2.08 kN                 | Four hinges; 1st hinge extrados under load at ≈1.9 kN; 3rd intrados at α≈98°    |
| `carozzi-2018/SRG_A`                      | Carozzi et al. 2018            | experimental |  B   | 8.83 kN                 | Extrados SRG; **concentrated crushing at loaded section** + abutment detachment |
| `carozzi-2018/U_V`                        | Carozzi et al. 2018            | experimental |  A   | 0.39 kN                 | Unreinforced 60 mm vault; four hinges                                           |
| `carozzi-2018/FRP_V`                      | Carozzi et al. 2018            | experimental |  B   | 1.54 kN                 | Extrados CFRP vault; premature failure below predicted debonding                |
| `carozzi-2018/TRM_V`                      | Carozzi et al. 2018            | experimental |  B   | 2.17 kN                 | Extrados glass-TRM vault; four hinges                                           |
| `bertolesi-2018/U_A-numerical`            | Bertolesi et al. 2018          | numerical    |  A   | 1.725 kN (NTM LB)       | Fit at ft = 0.0077 MPa ⇒ 2.30 kN                                                |
| `bertolesi-2018/U_V-numerical`            | Bertolesi et al. 2018          | numerical    |  A   | 0.261 kN (NTM LB)       | 0.919 kN at ft = 0.1 MPa; fit at ft ≈ 0.02 MPa                                  |
| `bertolesi-2018/SRG_A-numerical`          | Bertolesi et al. 2018          | numerical    |  B   | fit at σreinf = 172 MPa | Sliding activated; friction fit 20–22.5°                                        |
| `bertolesi-2018/FRP_V-numerical`          | Bertolesi et al. 2018          | numerical    |  B   | fit at σr = 187 MPa     | Friction fit 17.5–20° with sliding                                              |
| `bertolesi-2018/TRM_V-numerical`          | Bertolesi et al. 2018          | numerical    |  B   | fit at σr = 386 MPa     | Matches without sliding model                                                   |
| `simoncello-2020/borri-2011-arch-URM`     | Borri 2011 via Simoncello 2020 | experimental |  B   | 0.70 kN (quoted)        | dFmax = 1.50 mm (quoted); calibration fctm 0.03–0.08 MPa                        |
| `simoncello-2020/borri-2011-arch-FRP`     | Borri 2011 via Simoncello 2020 | experimental |  B   | curve-only (digitize)   | Intrados FRP 100 mm + spike anchors; peak via Fig. 6A digitization              |
| `simoncello-2020/prestwood-URM`           | Page 1987 via Simoncello 2020  | experimental |  B   | 228 kN (quoted)         | Full-scale bridge; fill interaction; numerical peak 245 kN                      |
| `simoncello-2020/prestwood-FRP-numerical` | Simoncello 2020                | numerical    |  C   | +43% / +33%             | Crushing-governed peak; FRP at ~60% of debonding capacity                       |

All quantitative values above are recorded in the source records with their exact locations. Quoted
values must be re-verified against the primary sources before acceptance use.

## Pending-access specimens (full text required)

| Source                                                    | Expected benchmark content                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ural-2016`                                               | Tie-rod systems on brick arches (seed tie-rod slot)                     |
| `tie-rod-connection-2022`                                 | Tie-rod connection types on stone arches                                |
| `persian-brick-arches-2023`                               | Steel tie-rods on Persian brick arches                                  |
| `tie-rod-jse-2015`                                        | Tie-rod reinforced arches, scale-model static tests                     |
| `cancelliere-2010`                                        | Reinforced (steel/FRP) masonry arches, tests + modeling                 |
| `alecci-2016`                                             | Extrados PBO-FRCM arches, tests + limit analysis                        |
| `alecci-2017`                                             | Intrados FRCM (PBO, carbon) + CFRP arches                               |
| `dambrisi-2015`                                           | C-FRCM design criteria for a post-war bridge                            |
| `caporale-2006`, `caporale-2012`, `caporale-luciano-2012` | Analytical limit-analysis benchmarks, incl. finite compressive strength |
| `marfia-2008`                                             | Numerical stress analysis of reinforced masonry arches                  |
| `intrados-cfrcm-2023`, `intrados-frcm-bridge-2025`        | CFRCM/FRCM intrados campaign (Padua group), incl. bridge scale          |
| `borri-2011`, `page-1987`                                 | Primary verification of the quoted values in `simoncello-2020`          |

## Implementability

| Group                                                           | Status                                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Oliveira/Basilio 12 arches                                      | **Immediate** — geometry, loads, materials, and exact peak loads all recorded      |
| Carozzi 5 structures                                            | **Immediate** — exact peak loads, stiffness, ductility, hinge sequences            |
| Bertolesi numerical companions                                  | **Immediate** — exact collapse loads and fitted parameters                         |
| Prestwood / Borri via Simoncello                                | **Immediate for peak loads** (Tier B, quoted); curve comparison after digitization |
| Nonlinear curve comparisons                                     | **After digitization** of the figures listed in `datasets/README.md`               |
| Tie-rod slot                                                    | **After full text** of at least two tie-rod papers                                 |
| FRCM intrados/extrados (Alecci) and analytical (Caporale) slots | **After full text**                                                                |
