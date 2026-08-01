# structural-checks-ts

`structural-checks-ts` is the planned TypeScript successor to
[`strutture-js`](https://github.com/claudiopagani/strutture-js), a public, solver-neutral structural
calculation and verification library.

## Current status

Implementation status: **partial**. Canonical cutover status: **planned**.

`strutture-js` remains the canonical implementation until the complete migration gates pass and
maintainers publish an explicit cutover record. This repository currently contains twenty-four
usable parity slices:

- result status constants and serializable `CalculationResult` and `VerificationResult` DTOs;
- generic result-check utilities;
- the generic force/length unit-system resolver;
- rectangular, circular, T, and polygon section geometry;
- reinforcing bars and generated top/bottom longitudinal layouts;
- generic composite sections and transformed reinforced-concrete sections;
- base, concrete, and steel material DTOs;
- NTC 2018 concrete and reinforcing-steel catalogs and factories, including existing-material
  confidence handling and structured normative references;
- NTC 2018 ULS uniaxial reinforced-concrete section resistance at an assigned axial force, with
  strain compatibility, fiber integration, and an Illinois axial-equilibrium solver;
- NTC 2018 ULS uniaxial reinforced-concrete N-M interaction domains at assigned or automatically
  sampled axial-force levels and for either or both curvature signs.
- NTC 2018 ULS reinforced-concrete N-Mx-My interaction domains at an assigned axial force, sampled
  by neutral-axis orientation.
- radial demand-capacity classification for sampled two-dimensional domains, plus the source public
  dense and banded linear-algebra boundary needed by subsequent concrete analyses.
- reinforced-concrete service-stress equilibrium under axial force and biaxial bending, using
  no-tension concrete, elastic steel, and an explicit modular ratio.
- reinforced-concrete moment-curvature response at assigned axial force, including first yield,
  material ultimate, balanced failure, post-ultimate termination, and curvature ductility.
- reinforced-concrete shear verification with and without vertical transverse reinforcement,
  including the NTC 2018 variable-angle truss model.
- reinforced-concrete torsion verification for concrete struts, closed transverse reinforcement,
  assigned longitudinal reinforcement, and combined concrete shear-torsion interaction.
- reinforced-concrete beam and column detailing for ordinary and dissipative reinforcement,
  anchorage, and column confinement.
- reinforced-concrete column member verification with slenderness screening, nominal-stiffness
  second-order moments, biaxial resistance, shear, and detailing aggregation.
- reinforced-concrete local beam member verification for sampled solver-neutral actions, including
  uniaxial or biaxial flexure, service stress and indirect crack control, optional shear-torsion
  interaction, detailing, and explicit station selection.
- reinforced-concrete local plate and slab-strip verification using rotated Wood-Armer demands for
  ULS bending and shear, SLS stress and indirect crack control, and simplified flat-slab
  slenderness.
- reinforced-concrete punching verification for interior, edge, and corner columns using first- or
  second-generation EN 1992 methods, with generated or explicit perimeters and optional vertical
  punching reinforcement.
- reinforced-concrete seismic-wall checks for biaxial resistance, critical zones, capacity shear,
  confinement, ductility, wall detailing, coupling beams, and wall-height aggregation.
- reinforced-concrete isolated-footing checks for compression-only rigid-base contact, assigned
  bearing and sliding resistance, strip bending, one-way shear, punching, local bearing, and
  anchorage.
- static axial capacity of one vertical constant-section pile in a layered one-dimensional ground
  profile, with explicit shaft/base methods, groundwater, resistance conversion, and a
  solver-neutral structural-coupling result.
- a solver-neutral linear-elastic 2D Euler-Bernoulli frame kernel with generic nodes, supports,
  nodal and uniform element loads, springs, prescribed and equal-DOF constraints, reactions, and
  internal-force sampling.
- straight beam-line preprocessing at supports and load discontinuities, plus a closed-form
  Timoshenko element for linear bending and shear deformation.
- a generic single-beam analysis pipeline with explicit section providers, inclined geometry,
  section-rotation projection, load cases, combinations, selectable result stations, sampled
  actions, reactions, envelopes, and solver-neutral section-action verification.
- generic foundation-beam analysis with bilateral or compression-only lumped Winkler springs,
  imposed soil settlements, active-set contact iteration, optional element stiffness iteration,
  pressure/reaction envelopes, and explicit solver-neutral result metadata.
- reinforced-concrete foundation-beam analysis for assigned horizontal prismatic beam and Winkler
  inputs, including cracked-stiffness iteration from service moment-curvature curves and local RC
  beam section verification.

The section, reinforcement, and material models are usable engineering data models. The ULS uniaxial
section-resistance and uniaxial/biaxial interaction-domain applications are usable within their
stated inputs and assumptions and match the pinned JavaScript numerical oracles. The public
`rayPolygonCapacity` operation can classify a demand against one of those sampled domains using the
source-compatible `utilizationRatio <= 1` rule. The service-stress workflow solves section stresses,
and the local beam verifier applies the inherited NTC stress limits and indirect crack-control
tables. The moment-curvature workflow preserves the source event and post-ultimate behavior.
Section-level shear and torsion verification are available, while the inherited circular-section
shear research method remains explicitly empirical and outside the normative corpus. Beam and column
detailing checks and local beam and column member verification are also available. Local plate
verification is available on conventional 1000 mm strips, punching is available through its separate
connection/perimeter contract, and local seismic-wall checks are available for explicit
solver-neutral demands. Centered rectangular isolated footings can also be checked locally when
design bearing and sliding resistances are supplied; geotechnical capacity and settlement are not
calculated by that structural application. The generic frame, single-beam, and foundation-beam
pipelines can perform bounded linear 2D analysis for their explicit solver-neutral inputs. The RC
foundation-beam application adds local section verification and source-compatible cracked-stiffness
iteration for its declared horizontal prismatic beam boundary. Full cracked-section beam deflection
redistribution, building-level global analysis, and solver adapters are not implemented in this
TypeScript migration yet. The repository does not claim normative, legal, regulatory, or
professional conformity.

The axial pile slice calculates single-pile geotechnical compression or tension capacity only. It
does not implement pile groups, pile-cap load sharing, settlement or transfer curves, lateral
response, or structural pile-section verification.

## Recorded baselines

- `strutture-js@0.8.0`:
  [`6f33baead8b88166c4b2cf94af41763412e3c751`](https://github.com/claudiopagani/strutture-js/commit/6f33baead8b88166c4b2cf94af41763412e3c751)
- `strutture-normative`:
  [`41da3faa489600173106935bbcf726119300e48d`](https://github.com/claudiopagani/strutture-normative/commit/41da3faa489600173106935bbcf726119300e48d)

The source baseline and its completed normative audit were clean and committed when migration began.
The source's complete `npm run check` gate and the corpus's `npm run check:ci` gate passed. See
[migration status](docs/migration-status.md) and the machine-readable
[baseline record](migration/baseline.json).

## Install and verify

This workspace intentionally has no publishable npm identity. `package.json#private` remains `true`
until package identity, history import, and compatibility policy are approved.

```bash
npm ci
npm run check
```

The complete check expects clean sibling checkouts at `../strutture-js` and
`../strutture-normative`, at the revisions recorded above. Override their locations with
`STRUTTURE_JS_BASELINE_PATH` and `STRUTTURE_NORMATIVE_PATH`.

The build emits portable ESM JavaScript and TypeScript declarations under `dist/`.

## Boundaries

The library contains reusable structural domain primitives, normative checks, deterministic
applications, and serializable technical results as they are migrated. It does not contain UI,
storage, authentication, analytics, network orchestration, product logic, or solver-specific
adapters. Concrete NextFEM and OOFEM integrations belong outside this repository.

Internally, dependencies follow `applications -> norms -> domain`. The normative corpus is an
external development and CI input only; it is never shipped at runtime.

See [project boundaries](docs/project-boundaries.md),
[public API policy](docs/public-api-policy.md), and
[normative traceability](docs/normative-traceability.md).

## License and provenance

This project is licensed under `LGPL-2.1-or-later`. Migrated implementation derives from
`strutture-js`; the move to TypeScript does not erase that origin or relicense the work. See
[LICENSE](LICENSE), [NOTICE](NOTICE), and [licensing guidance](docs/licensing.md).
