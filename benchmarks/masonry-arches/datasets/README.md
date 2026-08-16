# Datasets

Digitized curve datasets live here. A dataset is a pair of files:

- `<dataset-id>.csv` — plain CSV with a header row; column names match the sidecar `axes`.
- `<dataset-id>.json` — sidecar with provenance, estimated tolerance, axis units, and the exact
  figure the points were read from. The sidecar conforms to `schema/dataset-sidecar.schema.json`;
  `_template-sidecar.json` in this folder is a fill-in template.

## Digitization policy

1. Only published figures are digitized. No page scans or figures are copied into this repository.
2. Every dataset is marked `approximate-digitized`; an estimated tolerance is mandatory and must be
   conservative (for example `+/-3% of the axis span`). Tolerance is never assumed to be zero.
3. The sidecar records the exact figure reference, the reading method, the source access used, and
   the specimen the curve belongs to.
4. Points read from a curve whose axes are logarithmic, distorted, or poorly resolved are rejected
   rather than approximated.
5. A dataset is never used as an acceptance criterion without its sidecar.

## Status in this step

No curve has been digitized yet. The curves scheduled for digitization are listed in the source
records under `specimens[].curves` with their exact figure references, for example:

| Specimen                              | Figure                            |
| ------------------------------------- | --------------------------------- |
| `carozzi-2018/U_A`                    | Carozzi et al. 2018, Figure 11    |
| `carozzi-2018/SRG_A`                  | Carozzi et al. 2018, Figure 12    |
| `oliveira-2010/US-1`, `US-2`          | Oliveira et al. 2010, Figure 6a   |
| `oliveira-2010/CSI-1..4`              | Oliveira et al. 2010, Figure 10   |
| `oliveira-2010/CSE-1..4`              | Oliveira et al. 2010, Figure 12   |
| `simoncello-2020/borri-2011-arch-FRP` | Simoncello et al. 2020, Figure 6A |
| `simoncello-2020/prestwood-URM`       | Simoncello et al. 2020, Figure 9  |

Digitization of the priority-set curves is the enabling work for the nonlinear load-displacement
benchmark slot and must precede any solver change.

**Access verification (2026-08-16, iteration step 3):** the Simoncello et al. 2020 figures are
verified openly accessible under the article's CC BY 4.0 license (Frontiers image store, article
504332): Figure 5 (Borri URM calibration curves with the experimental peak marker), Figure 6 (Borri
FRP experimental discrete approximation plus numerical curves), and Figure 9 (Prestwood
load-displacement with the experimental maximum marker). No pixel-reading tooling is available in
the validation environment, so no points were read and no curve was fabricated. The digitization
slot remains `PENDING_DIGITIZATION`; the figure URLs are recorded in the validation report.
