# Contributing

Contributions must preserve the public, solver-neutral scope, the migration baseline, and the
repository rules in [AGENTS.md](AGENTS.md).

## Before changing code

1. Identify the bounded migration or maintenance slice.
2. Confirm the recorded `strutture-js` baseline and relevant source files are clean.
3. Record source files, symbols, tests, evidence, and Git blob identifiers in `migration/`.
4. For normatively relevant work, verify canonical identifiers against the pinned external
   `strutture-normative` revision.
5. Keep mechanical parity changes separate from engineering or API changes.

Run the complete gate before proposing a change:

```bash
npm ci
npm run check
```

Do not weaken numerical tolerances merely to obtain parity. Classify and document any difference.

## License

Unless explicitly stated otherwise, contributions are provided under the same `LGPL-2.1-or-later`
terms under which this project distributes them. Contributors must have the right to submit their
work. Third-party material requires compatible licensing and explicit provenance.
