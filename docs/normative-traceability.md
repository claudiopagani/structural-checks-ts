# Normative traceability

This repository implements algorithms; `strutture-normative` stores the external canonical JSON
corpus. The corpus is a development, audit, and CI resource, never a runtime dependency.

## Canonical identity

Normatively relevant formulas, limits, coefficients, choices, and verifications must use canonical
unit URNs and asset identifiers that resolve in the selected schema-compatible current corpus:

```text
urn:structural-codes:it:unit:<corpus>:<numbering>
urn:structural-codes:it:asset:<formula|table|figure>:<key>
```

A title, URL, viewer link, or repository path is not a canonical identity. Runtime results store
structured references in `metadata.normativeReferences`.

## Compatible evolving corpus

The check reads a clean external checkout, validates its expected structure, resolves declared
identifiers, and confirms that corpus content is absent from the runtime package. It reports the
observed revision but does not require rollback to a historical commit.

```bash
npm run check:normative-references
npm run check:normative-references -- --corpus ../strutture-normative
```

`STRUTTURE_NORMATIVE_PATH` may select another compatible checkout path. A release or engineering
validation campaign records the exact revision it actually used and reruns affected tests when a
corpus correction changes a referenced unit or asset. That campaign evidence does not become a
global development pin.

## Editorial status and missing material

An `extracted` corpus record is not thereby approved by normative review. Identifier resolution, a
green test, or a backlink does not establish legal, regulatory, or professional conformity.

When required material is unavailable:

- keep `resolutionStatus: "outside-corpus"`;
- keep `unitId: null`;
- keep `assetIds: []`;
- retain a readable citation or external source if known;
- never reconstruct a canonical identifier from memory.

The software implementation state, corpus editorial state, reference resolution, coverage,
engineering validation, and conformity claims are separate axes.

## Current implementation

The current concrete-first migration resolves the canonical NTC 2018 and Circolare 2019 units used
by the implemented scopes:

- concrete design compression strength, formula [4.1.3];
- reinforcement design yield strength, formula [4.1.5];
- flexure and axial force, formulas [4.1.18a] through [4.1.21].
- conventional first-yield curvature for moment-curvature ductility.
- shear without transverse reinforcement, formulas [4.1.22] through [4.1.24].
- shear with transverse reinforcement, formulas [4.1.25] through [4.1.30].
- torsion and combined concrete shear-torsion interaction, formulas [4.1.34] through [4.1.40].
- beam and column ordinary detailing, formulas [4.1.45] and [4.1.46].
- dissipative beam and column geometry and detailing in NTC 2018 §§ 7.4.6.1.1-7.4.6.2.2.
- column slenderness and nominal stiffness, formulas [4.1.41] through [4.1.44].
- column capacity-design shear in NTC 2018 § 7.4.4.2.1.
- the service modular-ratio statement for `n = 15` in Circolare 2019 § C4.1.2.2.5.
- concrete and reinforcement service-stress limits, formulas [4.1.15] through [4.1.17].
- crack-width classification, formula [4.1.14].
- indirect crack-control bar diameter and spacing tables C4.1.II and C4.1.III.
- the NTC 2018 deflection unit and Circolare 2019 flat-slab slenderness table C4.1.I.
- punching shear in NTC 2018 § 4.1.2.3.5.4.
- structural behavior and primary seismic-wall rules in NTC 2018 §§ 7.4.1, 7.4.4.5.1, and 7.4.4.5.2.
- coupling beams and wall geometry/detailing in NTC 2018 §§ 7.4.4.6, 7.4.6.1.4, and 7.4.6.2.4.

The chapter 11 source for existing-material properties remains explicitly `outside-corpus`. The
Cosenza-Maddaloni-Cuomo circular-section shear research equations are also `outside-corpus`; this
classification distinguishes an empirical publication from canonical normative units. The inherited
EN 1992 bond, anchorage, local-bearing, deflection, shrinkage-curvature, and first- and
second-generation punching references are also `outside-corpus`; no canonical EN identifier is
reconstructed. Machine-readable mappings are recorded in
[`migration/normative-references.json`](../migration/normative-references.json), and every migrated
slice records its source and corpus revisions under [`migration/slices`](../migration/slices).

These mappings support the implemented material, ULS uniaxial resistance, uniaxial and biaxial
interaction-domain, service-stress, moment-curvature, shear, torsion, detailing, local beam- and
column-member, local plate/slab-strip, punching, and seismic-wall scopes only. The corpus remains
`extracted`, `normativeConformityClaimed` remains `false`, and unresolved reinforced-concrete
capabilities remain `not-implemented`.
