> Classification: PUBLIC-SAFE | Status: implemented

# Repository instructions

These instructions apply to the entire `structural-checks-ts` repository.

## Language

Use English for all repository-authored content, including:

- documentation and architecture decision records;
- source-code identifiers, comments, JSDoc/TSDoc, and examples;
- schema descriptions;
- warnings, error messages, and other user-visible library text;
- architecture diagrams and labels;
- test names and descriptions;
- commit messages and pull-request titles and descriptions produced by agents.

English is the default, not a reason to damage normative traceability or mechanical migration
parity. Italian or another source language may be preserved when it is materially clearer or safer
for maintenance, provided the content is directly tied to an identifiable source or compatibility
contract. This includes:

- official normative titles;
- verbatim legal or technical excerpts;
- canonical identifiers and source filenames;
- terms that must remain in their original language for traceability.
- public strings mechanically migrated from `strutture-js` when translation would change serialized
  behavior;
- NTC- and Circolare-linked terminology, catalog labels, material names, and descriptions where the
  original Italian keeps the source relationship clearer.

Keep these exceptions attributable through nearby metadata, provenance, tests, or an obvious
normative context. Prefer English for new identifiers, comments, test descriptions, warnings, and
general documentation, but do not translate stable Italian compatibility data merely to satisfy
style consistency.

User-facing conversation may follow the user's language. Never translate, normalize, or otherwise
alter a canonical normative identifier.

## Migration authority

- `strutture-js` remains the single canonical implementation until maintainers publish an explicit
  public cutover record.
- Before that public record, this repository is a TypeScript parity target. Do not develop or
  advertise an independently evolving canonical implementation here.
- Do not introduce functionality only in this repository while `strutture-js` is canonical.
- After a public cutover record designates this repository as canonical, do not maintain formulas or
  normative branches independently in `strutture-js`.
- Preserve public behavior, formulas, numerical evidence, normative traceability, license, and
  provenance. Version deliberate incompatibilities explicitly.

## License and provenance

- Preserve `LGPL-2.1-or-later`; migration does not authorize relicensing.
- Preserve copyright notices, license files, third-party notices, and contributor rights.
- Record the source `strutture-js` revision for every migrated slice.
- Keep a verifiable link from migrated symbols to their source files, tests, validation campaigns,
  and reports.
- Distinguish migrated code, new code, generated output, and third-party code.
- Do not rewrite history or present migrated code as an unrelated new implementation.

## Repository boundaries

- This repository is a public, solver-neutral structural calculation and verification library.
- Do not add UI, framework-specific components, page state, authentication, databases, application
  storage, analytics, network orchestration, or product-specific logic.
- Do not add a NextFEM adapter to this library.
- Define only generic, solver-neutral, serializable analysis-result contracts when they are required
  by migrated behavior.
- Keep concrete NextFEM integration in a consumer or a dedicated adapter repository.
- Preserve the internal dependency direction `applications -> norms -> domain`. `domain` must not
  import `norms` or `applications`, and `norms` must not import `applications`.
- Consumers must import only the package root or subpaths declared by `package.json#exports`;
  examples and tests must not teach consumers to use private source paths.

## Normative traceability

- Every normatively relevant formula, limit, coefficient, design choice, and verification must have
  a traceable normative reference.
- Use canonical unit URNs and asset identifiers from a pinned revision of the `strutture-normative`
  JSON corpus.
- Store structured runtime references in `metadata.normativeReferences`.
- A URL is a human resolver, not a replacement for a canonical identifier.
- Treat `strutture-normative` as an external development, audit, and validation resource, never as a
  runtime dependency.
- Do not copy the corpus into packages, browser or worker bundles, project files, or serialized
  verification results.
- An `extracted` corpus record is not an approved normative review.
- Keep unavailable references explicitly classified as `outside-corpus`; never invent URNs or asset
  identifiers.
- Preserve structured references, coverage states, tests, tolerances, validation evidence, and
  `normativeConformityClaimed: false` where applicable.
- Do not claim legal, regulatory, or professional conformity from resolved references, passing
  tests, or corpus extraction status.
- Prefer a development or CI checkout pinned to an exact corpus revision for reference validation.

## Solver neutrality

- Structural verification functions must consume only generic, solver-neutral, serializable models
  and analysis-result DTOs.
- Keep NextFEM-, OOFEM-, and other solver-specific types, APIs, enumerations, handles, callbacks,
  and file formats outside this library.
- Implement concrete solver adapters in a consumer or dedicated integration repository through the
  generic `AnalysisProvider` boundary.
- Preserve explicit units, axes, sign conventions, component order, sampling locations,
  combinations, coverage, and provenance.
- Do not replace missing solver data with zero or infer unsupported capabilities.

## Migration safety

- Treat the recorded `strutture-js` implementation and its tests as the behavioral baseline.
- Do not migrate from an unidentified revision, a dirty source worktree, or a partially saved
  normative audit.
- The initial TypeScript migration must not change formulas, coefficients, numerical tolerances, or
  engineering assumptions.
- Keep mechanical migration separate from later engineering improvements.
- Port incrementally in bounded functional slices and keep all checks green after every slice.
- Preserve public exports and serialized result shapes unless a documented compatibility decision
  explicitly versions a difference.
- Preserve `status`, `outputs`, `checks`, `warnings`, `assumptions`, `metadata`, `demand`,
  `capacity`, and `utilizationRatio` where applicable.
- Require explicit units, assumptions, applicability limits, traceable sources, numerical tests, and
  independent validation proportionate to risk for engineering formulas.
- Do not describe scaffolds, mocks, or placeholders as implemented verification features.

## Project setup

- Use strict TypeScript for manually maintained library source and migrated tests.
- Keep formatting, linting, type checking, testing, build output, package exports, and CI
  deterministic.
- Produce ESM JavaScript for the supported Node.js ecosystem together with TypeScript declarations,
  without compromising the documented browser and Web Worker boundary.
- Do not import private implementation paths outside the declared package exports in consumer-facing
  material.
- Preserve `LGPL-2.1-or-later`, copyright notices, attribution, and verifiable derivation from
  `strutture-js`.
- Do not silently select a publishable npm identity, history-import strategy, compatibility policy,
  or cutover baseline while those decisions remain open.

## Migration sequence

1. Establish governance, license, provenance, TypeScript configuration, build, tests, lint, package
   exports, and CI.
2. Record the exact clean `strutture-js` baseline revision.
3. Import or reconstruct existing tests as migration oracles.
4. Port low-level domain primitives first.
5. Port normative and reinforced-concrete checks in bounded slices.
6. Preserve and validate structured normative metadata.
7. Add compatibility tests against the JavaScript baseline.
8. Consider API improvements or additional verifiers only after behavioral parity.
9. Keep solver integrations as separate adapter work behind a solver-neutral contract.

## Confidentiality

Never copy private blueprint information, internal plans, milestones, product strategy, commercial
details, private integration design, or reserved fixtures into this public repository. This
prohibition applies to documentation, source comments, examples, schemas, tests, issues,
discussions, commit messages, and pull-request descriptions.

Only import the minimum technical contract needed for interoperability after classification,
license, and provenance review.

## Implementation status

Use these implementation states precisely:

- `not-implemented`: the capability is absent or only a placeholder;
- `planned`: the decision is approved but the capability is unavailable;
- `partial`: only a declared subset is implemented;
- `implemented`: the capability is present and tested at the stated software level.

Use `draft` for proposal or contract maturity, not as a synonym for partial implementation. Use
`validated` only for a defined scope backed by versioned evidence and explicit tolerances. Neither
`implemented` nor `validated` is a legal or regulatory conformity claim.

## Change discipline

- Do not add frameworks, databases, runtime dependencies, or publishing infrastructure without an
  approved need and recorded decision.
- Do not add formulas or modify normative behavior without numerical tests, independent validation
  proportionate to risk, and traceable sources.
- Preserve serializable result fields and public behavior unless a breaking change is explicitly
  approved and versioned.
- Before delivery, inspect the complete diff and run the relevant type, test, validation, package,
  bundle, provenance, normative-reference, and architecture checks.
