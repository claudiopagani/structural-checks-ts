# Source records

One JSON file per literature source. Files conform to `../schema/source-record.schema.json` and are
indexed by `../catalog.json`.

## Record statuses

- `data-extracted` — full text was accessed; quantitative data is recorded with per-value
  provenance.
- `requires-full-text` — only metadata (and possibly the abstract) is available; no quantitative
  data is recorded by policy. These records say exactly what must be extracted once the full text is
  obtained.
- `metadata-only` — reserved for sources that will never carry quantitative data (not used in the
  current corpus).

## Reading kinds

Every quantitative value carries a `kind`: `exact`, `digitized`, `approximate-digitized`, `derived`,
`quoted`, `stated-range`, or `unknown`. Missing data is `value: null` with an explanatory note.
Quoted values record both the primary source and the quoting location and are flagged for
re-verification before acceptance use.

## Files

| File                             | Source                                                                   | Status             |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| `oliveira-2010.json`             | Oliveira, Basilio, Lourenco 2010 (12 half-scale GFRP arches)             | data-extracted     |
| `basilio-2007-thesis.json`       | Basilio 2007 PhD thesis (primary dataset of the same campaign)           | data-extracted     |
| `carozzi-2018.json`              | Carozzi, Poggi, Bertolesi, Milani 2018 (2 arches, 3 vaults; SRG/TRM/FRP) | data-extracted     |
| `bertolesi-2018.json`            | Bertolesi, Milani, Carozzi, Poggi 2018 (numerical companion)             | data-extracted     |
| `simoncello-2020.json`           | Simoncello et al. 2020 (Borri 2011 arch tests quoted; Prestwood bridge)  | data-extracted     |
| `borri-2011.json`                | Borri, Castori, Corradi 2011                                             | requires-full-text |
| `page-1987.json`                 | Page 1987, TRRL report (Prestwood primary)                               | requires-full-text |
| `cancelliere-2010.json`          | Cancelliere, Imbimbo, Sacco 2010                                         | requires-full-text |
| `ural-2016.json`                 | Ural et al. 2016 (tie-rods)                                              | requires-full-text |
| `tie-rod-connection-2022.json`   | Firat, Sancar Kayabasi 2022 (tie-rod connections)                        | requires-full-text |
| `persian-brick-arches-2023.json` | Fazeli et al. 2023 (Persian arches, tie-rods)                            | requires-full-text |
| `tie-rod-jse-2015.json`          | J. Struct. Eng. 2015 (tie-rod scale-model static tests)                  | requires-full-text |
| `alecci-2016.json`               | Alecci et al. 2016 (extrados PBO-FRCM)                                   | requires-full-text |
| `alecci-2017.json`               | Alecci et al. 2017 (intrados FRCM)                                       | requires-full-text |
| `dambrisi-2015.json`             | D'Ambrisi et al. 2015 (C-FRCM bridge design)                             | requires-full-text |
| `caporale-2006.json`             | Caporale, Luciano, Rosati 2006                                           | requires-full-text |
| `caporale-2012.json`             | Caporale, Feo, Luciano 2012                                              | requires-full-text |
| `caporale-luciano-2012.json`     | Caporale, Luciano 2012                                                   | requires-full-text |
| `marfia-2008.json`               | Marfia, Ricamato, Sacco 2008                                             | requires-full-text |
| `intrados-cfrcm-2023.json`       | Zampieri et al. 2023, Procedia Struct. Integr. 44                        | requires-full-text |
| `intrados-frcm-bridge-2025.json` | Zampieri et al. 2025, Eng. Struct. 323                                   | requires-full-text |
