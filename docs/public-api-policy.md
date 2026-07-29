# Public API policy

The public API is the set of entry points declared in `package.json#exports`. Private source paths
are not supported consumer APIs.

## Migration phase

The package is intentionally private and its final npm identity is undecided. The only current entry
point is the package root. It exposes the migrated foundation slice:

- `CalculationResult` and `VerificationResult`;
- centralized result status constants and `isResultStatus`;
- generic result-check utilities;
- force/length unit-system constants and conversion helpers.

This is a strict subset of the `strutture-js@0.8.0` public API. Missing exports are
`not-implemented`, not silently removed or deprecated. The complete baseline entry-point inventory
is recorded in `migration/baseline.json`.

## Compatibility

During mechanical migration:

- public names and runtime behavior match the recorded JavaScript baseline;
- serialized result shapes preserve `status`, `outputs`, `checks`, `warnings`, `assumptions`,
  `metadata`, `demand`, `capacity`, and `utilizationRatio` where applicable;
- units, defaults, error behavior, numerical values, and tolerances do not change;
- browser and Web Worker portability remains a compatibility requirement;
- a deliberate incompatibility requires a separate documented decision and versioned migration.

The live parity test loads the exact sibling `strutture-js` revision and compares the migrated
surface. It rejects a dirty or different source baseline.

## Future entry points

The root and subpaths from `strutture-js` will be restored incrementally only when their complete
slice is migrated and tested. The final npm name, semver transition, compatibility window, and any
bridge package remain open decisions. No current configuration authorizes publication.
