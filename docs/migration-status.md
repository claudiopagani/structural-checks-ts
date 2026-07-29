# Migration status

Observed on 2026-07-29.

## Baseline safety

- Target repository: no commits; only the pre-existing untracked `AGENTS.md` was present.
- Source repository: clean `master`, aligned with `origin/master`, at
  `6f33baead8b88166c4b2cf94af41763412e3c751`.
- The completed normative audit, structured reference catalog, resolver check, and audit tests are
  committed in that source `HEAD`.
- `strutture-js npm run check`: passed.
- Normative corpus: clean `master` at `41da3faa489600173106935bbcf726119300e48d`.
- `strutture-normative npm run check:ci`: passed.
- `strutture-js npm run check:normative-references`: passed with 44 resolved references, 13
  explicitly `outside-corpus`, 401 canonical units, and 320 assets.

The corpus's proposed `integration/structural-checks-ts/manifest.json` records an older source
commit and a dirty observed worktree. It is not used as the migration baseline. The committed pin in
the clean source implementation and its passing resolver check are used instead.

## Implemented slice 0001

Implementation state: **implemented** for the declared foundation scope.

- strict TypeScript result DTOs, status constants, and generic check utilities;
- strict TypeScript force/length unit resolver;
- root ESM package export and declaration output;
- reconstructed source tests and live compatibility comparisons;
- provenance, architecture, package, browser bundle, Web Worker, and external corpus checks.

No engineering formula or verifier is included in this slice. Its implementation state does not
extend validation or conformity claims.

## Remaining migration

The package as a whole is **partial**. Remaining work includes:

1. complete export, symbol, formula, fixture, validation-campaign, performance, and bundle
   inventory;
2. remaining low-level domain primitives and their tests;
3. normative catalogs and structured reference utilities;
4. reinforced-concrete and other normative checks in bounded slices;
5. complete application, FEM, browser, and Web Worker parity;
6. complete numerical campaigns and tolerance comparison;
7. package identity, history, compatibility, freeze, cutover, and rollback decisions.
