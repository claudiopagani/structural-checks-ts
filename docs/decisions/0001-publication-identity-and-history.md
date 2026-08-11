> Classification: PUBLIC-SAFE | Decision status: open | Guard status: implemented |
> Canonical-authority clause: superseded by Decision 0004

# Decision 0001 — Publication identity, compatibility, and history remain open

## Context

The repository name and its canonical engineering authority are approved. The final npm identity,
history-import strategy, semver transition, compatibility window, and bridge-package need are not
yet approved.

Choosing any of these implicitly during scaffolding could create an irreversible publication or
provenance outcome.

## Current guard

The workspace uses the explicitly non-publishable internal name
`structural-checks-ts-migration-workspace`, version `0.0.0`, with `private: true`.

This is not a proposal for the final npm name. No history rewrite, branch rename, package
publication, compatibility package, or deprecation notice is authorized by this guard. Canonical
engineering authority is separately resolved by Decision 0004.

## Decision required before publication

Maintainers must approve:

1. final npm identity and ownership;
2. whether and how Git history is imported or linked while preserving provenance;
3. supported import paths and consumer migration policy;
4. semver mapping from the historical JavaScript package, if any;
5. compatibility and deprecation windows;
6. the release and rollback policy for the first published TypeScript package.

Until then, this repository remains non-publishable, but it is the canonical implementation.
