# structural-checks-ts

`structural-checks-ts` is the planned TypeScript successor to
[`strutture-js`](https://github.com/claudiopagani/strutture-js), a public, solver-neutral structural
calculation and verification library.

## Current status

Implementation status: **partial**. Canonical cutover status: **planned**.

`strutture-js` remains the canonical implementation until the complete migration gates pass and
maintainers publish an explicit cutover record. This repository currently contains one usable parity
slice:

- result status constants and serializable `CalculationResult` and `VerificationResult` DTOs;
- generic result-check utilities;
- the generic force/length unit-system resolver.

No structural or normative verifier has been migrated yet. The repository does not claim normative,
legal, regulatory, or professional conformity.

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
