# Normative traceability

This repository implements algorithms; `strutture-normative` stores the external canonical JSON
corpus. The corpus is a development, audit, and CI resource, never a runtime dependency.

## Canonical identity

Normatively relevant formulas, limits, coefficients, choices, and verifications must use canonical
unit URNs and asset identifiers from the pinned corpus revision:

```text
urn:structural-codes:it:unit:<corpus>:<numbering>
urn:structural-codes:it:asset:<formula|table|figure>:<key>
```

A title, URL, viewer link, or repository path is not a canonical identity. Runtime results store
structured references in `metadata.normativeReferences`.

## Pinned corpus

The current development pin is `41da3faa489600173106935bbcf726119300e48d`. The check reads a clean
external checkout, validates the revision, resolves declared identifiers, and confirms that corpus
content is absent from the runtime package.

```bash
npm run check:normative-references
npm run check:normative-references -- --corpus ../strutture-normative
```

`STRUTTURE_NORMATIVE_PATH` may select another checkout path, but the revision must still match.
Changing the pin requires impact analysis and rerunning every affected parity and validation
campaign.

## Editorial status and missing material

The pinned corpus is `extracted`; this does not mean that a normative review is approved. Identifier
resolution, a green test, or a backlink does not establish legal, regulatory, or professional
conformity.

When required material is unavailable:

- keep `resolutionStatus: "outside-corpus"`;
- keep `unitId: null`;
- keep `assetIds: []`;
- retain a readable citation or external source if known;
- never reconstruct a canonical identifier from memory.

The software implementation state, corpus editorial state, reference resolution, coverage,
engineering validation, and conformity claims are separate axes.

## Current implementation

The validation foundation is implemented, but no normative formula has been migrated. Therefore
`migration/normative-references.json` intentionally contains no formula mappings yet. Normative and
reinforced-concrete slices remain `not-implemented`.
