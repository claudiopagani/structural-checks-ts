> Classification: PUBLIC-SAFE | Decision status: accepted | Implementation status: partial

# Decision 0004 - TypeScript canonical authority and evolving normative corpus

## Decision

Effective 2026-08-10, `structural-checks-ts` is the sole canonical implementation for this library.
All new functions, formulas, corrections, tests, and engineering validation are developed and
maintained here.

The previous JavaScript repository is no longer an implementation authority or development target.
Existing source revisions, blob hashes, migrated-slice manifests, and compatibility results are
retained only as historical provenance. They must not be rewritten or presented as unrelated new
work, but a live sibling checkout is not an acceptable mandatory dependency for new development or
the eventual default verification workflow.

The `strutture-normative` repository remains the external canonical JSON corpus for normative
identity and audit. It is intentionally evolving: corrections, richer extraction, and editorial
refinement do not require this repository to roll the corpus back to an earlier commit, provided the
checkout remains structurally compatible and referenced canonical identifiers still resolve.

## Normative compatibility policy

The active normative-reference check must validate the selected current checkout rather than an old
global commit pin. At minimum it must verify:

- the expected corpus unit and asset structure is present and parseable;
- canonical unit URNs and asset identifiers referenced by this library resolve uniquely;
- each referenced asset belongs to its declared canonical unit;
- `outside-corpus` references do not claim invented canonical identifiers;
- corpus content is not copied into runtime packages or serialized calculation results.

Editorial status may legitimately improve over time and therefore is not required to equal the
historical status recorded when a slice was migrated. The checker reports the observed corpus
revision. A clean checkout remains required by the default audit check so the result is
reproducible; a release or validation campaign may additionally record the exact observed revision
in its versioned evidence. Such a campaign record is evidence for that run, not a repository-wide
rollback constraint.

Historical `corpus.revision` and `corpus.status` fields in migration manifests retain their original
provenance meaning. They are not the active compatibility contract.

## Publication decisions that remain open

Canonical engineering authority is distinct from npm publication. The final package identity,
history-import strategy, semver transition, supported compatibility window, and publication plan
remain governed by Decision 0001. The workspace may remain private and non-publishable while those
choices are open.

## Transition state

Migration-era live-parity tests and provenance scripts remain available as explicit historical
tools, but they have been retired from the default test and verification workflow. `npm run check`
uses the TypeScript-canonical suite and the compatible current normative corpus without requiring a
live checkout of the former implementation.

Useful historical numerical comparisons should be converted progressively to self-contained
TypeScript fixtures without deleting their provenance value. Until converted, they remain optional
archive evidence and do not define canonical behavior.

This transition is mechanical governance cleanup. It must remain separate from changes to
engineering formulas and from implementation of the masonry-arch solver.
