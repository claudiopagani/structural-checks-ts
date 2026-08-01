> Classification: PUBLIC-SAFE | Status: accepted

# Preserve source-language normative and compatibility strings

## Context

English remains the default language for this repository. The `strutture-js` baseline also contains
Italian public strings that are either tied directly to Italian normative practice or included in
serialized results. Examples include NTC material names and the LC1–LC3 knowledge-level
descriptions.

Translating those values during the initial TypeScript migration would create a compatibility
difference without improving engineering behavior. Maintaining parallel translations would also make
comparison with the Italian source material harder.

## Decision

New repository-authored explanations, identifiers, comments, and test descriptions use English by
default.

Original-language content may be retained when:

- it is an official normative title, canonical identifier, filename, or verbatim excerpt;
- it is terminology, a label, or a description directly associated with an Italian NTC or Circolare
  reference;
- it is public compatibility data mechanically migrated from the pinned `strutture-js` baseline;
- retaining the source language materially improves traceability or ongoing maintenance.

Such content must remain attributable through normative metadata, migration provenance, parity
tests, or an otherwise unambiguous source context. This exception does not authorize unrelated
Italian prose throughout documentation or source comments.

## Consequences

- Existing Italian serialized material names and knowledge-level descriptions may be migrated
  unchanged.
- Their exact values remain covered by JavaScript baseline parity tests.
- Canonical identifiers are never translated.
- Future translations may be added as explicit presentation data, but they must not silently replace
  stable compatibility fields.
