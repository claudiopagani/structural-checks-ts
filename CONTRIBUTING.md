# Contributing

Contributions must preserve the public, solver-neutral scope, the migration baseline, and the
repository rules in [AGENTS.md](AGENTS.md).

## Before changing code

1. Identify the bounded migration or maintenance slice.
2. Treat the recorded migration evidence in `migration/` (baseline manifest, slice manifests, and
   the parity inventory) as frozen historical data. The link to the previous JavaScript
   implementation is severed: no check, campaign, or workflow requires a live checkout of it.
3. Record decisions, tests, and validation evidence in the repository.
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
