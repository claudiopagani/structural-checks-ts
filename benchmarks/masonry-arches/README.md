# Masonry-arches scientific benchmark corpus

Status: draft | Classification: PUBLIC-SAFE | Iteration step 1 of 4

This folder is the scientific benchmark corpus for masonry arches of `structural-checks-ts`. It
exists to validate the masonry-arch module later; it does **not** modify the solver. The corpus is
built before any method change: no value here was produced to match a model result, and no solver
parameter was calibrated on this data in this step.

## Contents

| Path                         | Purpose                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `catalog.json`               | Machine-readable index: sources, specimens, tiers, priority benchmark set, coverage matrix |
| `schema/`                    | JSON Schemas for the catalog, the source records, and the digitized dataset sidecars       |
| `sources/`                   | One provenance-bearing record per literature source                                        |
| `datasets/`                  | Digitized curves (none yet) with mandatory provenance sidecars and tolerance               |
| `specimens.md`               | Specimen table, tiers, implementability, full-text requirements                            |
| `coverage-and-priorities.md` | Solver coverage matrix and the proposed priority benchmark set                             |

## Hard rules (non-negotiable)

1. **No invented data.** A value is recorded only if it was read from an accessed full text (kind
   `exact`) or a figure (kind `digitized` / `approximate-digitized`), derived from such values with
   a stated formula (`derived`), or quoted from a secondary source with both provenances recorded
   (`quoted`). Missing data is `null` with kind `unknown` and a note.
2. **Provenance per value.** Every quantitative value carries: source, exact location
   (table/figure/section), reading kind, and unit.
3. **Digitized data is marked.** Approximate digitization is allowed only with a stated estimated
   tolerance in a dataset sidecar (`schema/dataset-sidecar.schema.json`).
4. **No copyrighted material.** No figure images, page scans, or paper copies are stored here; only
   numerical data, metadata, bibliographic references, and our own elaborations.
5. **No secondary numbers without provenance.** Numbers taken from papers that quote other papers
   are recorded with both locations and must be re-verified against the primary source before they
   are used as acceptance criteria.
6. **The solver is not calibrated here.** This step produces the benchmark only. Any later solver
   change must be measured against this corpus, never the corpus adapted to the solver.

## Classification

Each specimen is assigned a tier (see `catalog.json` for the canonical definitions):

- **Tier A — direct quantitative.** Geometry, loading, materials, and reinforcement are directly
  representable.
- **Tier B — partial quantitative.** Quantitative comparison is possible with known differences
  (backfill interaction, anchorage details, bond-law complexity, pre-damage, quoted data).
- **Tier C — qualitative / mechanism.** Useful for mechanism, hinge positions, reinforcement
  activation, and failure-mode comparisons only.

## Sources

The seed set of 17 papers requested by the iteration was processed first, then extended with related
campaigns (Basilio 2007 PhD thesis; Borri et al. 2011; Page 1987 TRRL report; an additional tie-rod
campaign from J. Struct. Eng. 2015). See `sources/README.md` for the complete list and each record
for its access status.

Accessibility summary as of 2026-08-16:

- **Full text retrieved and extracted:** `simoncello-2020` (gold OA), `carozzi-2018` and
  `bertolesi-2018` (author manuscripts on Riunet), `oliveira-2010` and `basilio-2007-thesis`
  (University of Minho repository).
- **Full text exists but retrieval blocked / restricted:** `alecci-2016`, `intrados-cfrcm-2023`,
  `intrados-frcm-bridge-2025` (publisher pages block automated retrieval), `alecci-2017`,
  `dambrisi-2015` (restricted repository copies).
- **No open copy found:** `cancelliere-2010`, `ural-2016`, `caporale-2006`, `caporale-2012`,
  `caporale-luciano-2012`, `marfia-2008`, `tie-rod-connection-2022`, `persian-brick-arches-2023`,
  `borri-2011`, `tie-rod-jse-2015`, `page-1987`.

## What is immediately implementable

- All 12 arches of the Oliveira/Basilio campaign (Tier A/B, exact peak loads, sliding- and
  debonding-governed failures).
- All 5 structures of the Carozzi campaign (Tier A/B, exact peak loads, crushing-governed SRG case,
  hinge sequences).
- The Bertolesi lower-bound numerical companions (exact collapse loads and fitted parameters).
- The Prestwood bridge URM test (Tier B) and the Borri et al. 2011 arch tests (Tier B, quoted) from
  Simoncello et al. 2020.

Curve-level (nonlinear load-displacement) validation additionally requires digitizing the referenced
figures into `datasets/` with tolerance sidecars. Full-text acquisition is required before the
tie-rod slot and the FRCM/analytical slots can be populated; see `coverage-and-priorities.md`.
