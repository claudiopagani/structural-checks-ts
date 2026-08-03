# Phase A1 parity inventory

This is a generated, source-pinned inventory. It is not a claim that matching filenames or exports
establish behavioral parity.

- JavaScript baseline: strutture-js 0.8.0 at `6f33baead8b88166c4b2cf94af41763412e3c751` (clean
  worktree).
- Normative corpus: `41da3faa489600173106935bbcf726119300e48d` (clean worktree, development-only
  reference).
- Drift check: `npm run check:parity-inventory`.
- Machine-readable inventory: [migration/parity-inventory.json](../migration/parity-inventory.json).

## Surface counts

| Surface                           | Pinned JavaScript | Current TypeScript |
| --------------------------------- | ----------------: | -----------------: |
| Root exports                      |               841 |                718 |
| Applications exports              |               309 |                205 |
| Package entry points              |                14 |                  4 |
| ApplicationRegistry entries       |                30 |                  0 |
| Application catalog entries       |                30 |                 30 |
| Serialized schema/version symbols |                49 |                 43 |
| Source files                      |               480 |                381 |
| Tests                             |               131 |                250 |
| Validation campaigns              |                17 |                  0 |
| Validation files                  |                27 |                  0 |
| Examples                          |                32 |                  0 |
| Benchmarks                        |                 4 |                  0 |
| Browser gates                     |                 1 |                  1 |
| Web Worker gates                  |                 1 |                  1 |

## Dependency-ordered remaining backlog

The JSON inventory contains the exact item IDs for every non-exact item. The groups below are the
implementation order required by the repository architecture.

- **domain** — partial: 16.
- **norms** — partial: 4, missing: 13.
- **applications** — partial: 16, missing: 334.
- **packageValidation** — partial: 4, missing: 119.

## Status semantics

- `exact-parity`: the target item exists and an existing migration slice/oracle or target test
  provides recorded evidence.
- `partial`: a target exists but the inventory has not established complete source behavior.
- `missing`: no target item was found at the planned TypeScript path.
- `intentionally-excluded`: the source item is outside the target library boundary and has a
  recorded reason.
- `decision-required`: a maintainer decision is needed before mapping can be finalized.

## Auditable ambiguities

- The source package exposes ./applications/\* as a wildcard; the inventory resolves it to
  src/applications/index.js and does not expand private application files into package entrypoints.
- The source browser gate is implemented by the Web Worker bundle script; no separate browser-only
  smoke script is present in the pinned source.
- An existing TypeScript target file is classified as partial unless a recorded migration slice also
  supplies source-oracle or target-test evidence; matching filenames are never treated as proof of
  parity.
