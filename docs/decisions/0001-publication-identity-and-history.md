> Classification: PUBLIC-SAFE | Decision status: open | Guard status: implemented

# Decision 0001 — Publication identity, compatibility, and history remain open

## Context

The successor repository name is approved, but the final npm identity, history-import strategy,
semver transition, compatibility window, bridge-package need, and cutover revision are not yet
approved.

Choosing any of these implicitly during scaffolding could create an irreversible publication or
provenance outcome.

## Current guard

The workspace uses the explicitly non-publishable internal name
`structural-checks-ts-migration-workspace`, version `0.0.0`, with `private: true`.

This is not a proposal for the final npm name. No history rewrite, branch rename, package
publication, compatibility package, deprecation notice, or canonical cutover is authorized by this
guard.

## Decision required before publication

Maintainers must approve:

1. final npm identity and ownership;
2. whether and how Git history is imported or linked while preserving provenance;
3. supported import paths and consumer migration policy;
4. semver mapping from `strutture-js@0.8.0`;
5. compatibility and deprecation windows;
6. the immutable cutover baseline, rollback window, and public cutover record.

Until then, TypeScript parity slices may be implemented and tested, but `strutture-js` remains the
canonical implementation.
