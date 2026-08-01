# Public API policy

The public API is the set of entry points declared in `package.json#exports`. Private source paths
are not supported consumer APIs.

## Migration phase

The package is intentionally private and its final npm identity is undecided. The current public
entry points are the package root and the source-compatible `./domain/math` subpath. The root
exposes the migrated foundation, concrete-section, and concrete-material slices:

- `CalculationResult` and `VerificationResult`;
- centralized result status constants and `isResultStatus`;
- generic result-check utilities;
- force/length unit-system constants and conversion helpers;
- `CrossSection`, `RectangularSection`, `CircularSection`, `TSection`, and `PolygonSection`;
- section mass-property and principal-axis helpers;
- `ReinforcementBar` and `createLongitudinalReinforcementLayout`;
- `CompositeSectionComponent`, `CompositeSection`, and `ReinforcedConcreteSection`;
- `BaseMaterial`, `ConcreteMaterial`, and `SteelMaterial`;
- existing-material confidence constants and helpers;
- NTC 2018 concrete and reinforcement catalogs and material factories;
- ULS concrete and reinforcing-steel constitutive laws;
- `IllinoisRootSolver`, `StrainField`, `SectionFiberDiscretizer`, `RCUltimateSectionSolver`,
  `RCUniaxialDomainBuilder`, and `RCBiaxialDomainBuilder`;
- `DenseLinearSolver` and `BandedLinearSolver`;
- generic `Node`, `Support`, load DTOs, `DofRegistry`, `FemAssembler2D`,
  `KinematicConstraintReducer2D`, `LinearStaticSolver2D`, `BeamLinePreprocessor2D`,
  `FrameElement2DEulerBernoulli`, and `FrameElement2DTimoshenko`;
- `BEAM_SUPPORT_PRESETS`, `DEFAULT_SECTION_ROTATION`, `ElasticBeamSectionProvider`,
  `SingleBeamAnalysis`, `SingleBeamFemBuilder`, `SingleBeamModel`,
  `createElasticBeamSectionProvider`, `normalizeSectionRotation`, `resolveBeamSupportPreset`, and
  `splitPrincipalActions` for the generic single-beam pipeline;
- `FoundationBeamAnalysis`, `FoundationBeamFemBuilder`, and `FoundationBeamModel` for the generic
  assigned-input Winkler foundation-beam pipeline;
- `ReinforcedConcreteBeamSectionProvider` and `createReinforcedConcreteBeamSectionProvider`;
- `ReinforcedConcreteFoundationBeamApplication`, `ReinforcedConcreteFoundationBeamModel`, and
  `SectionMomentCurvatureCurve` for the declared RC foundation-beam cracked-stiffness boundary;
- `ConcreteNoTensionLaw`, `SteelElasticLaw`, `RCServiceStressSolver`, and
  `RCMomentCurvatureAnalyzer`;
- `ReinforcedConcreteShearVerification` and `ReinforcedConcreteTorsionVerification`;
- `ReinforcedConcreteBeamDetailingVerification`, `ReinforcedConcreteColumnModel`, and
  `ReinforcedConcreteColumnDetailingVerification`;
- `ReinforcedConcreteColumnVerification` and `ReinforcedConcreteColumnApplication`;
- `BeamSectionActionVerifier`, `verifyBeamSectionActions`,
  `ReinforcedConcreteServiceabilityVerification`, and `ReinforcedConcreteBeamVerification`;
- `RC_PLATE_ANALYSIS_TYPES`, `ReinforcedConcretePlateModel`, `ReinforcedConcretePlateVerification`,
  `ReinforcedConcretePlateApplication`, plate action transformations, Wood-Armer envelope, strip
  construction, and plate check functions;
- punching connection, action-state, perimeter, request, verification, application, design-code, and
  joint-action transfer contracts;
- seismic-wall biaxial resistance, capacity-shear, confinement, ductility, detailing, coupling-beam,
  and height-aggregation functions;
- `StructuralApplication`, `ReinforcedConcreteSectionModel`,
  `ReinforcedConcreteSectionVerification`, and `ReinforcedConcreteSectionApplication`.

The `./domain/math` subpath exposes the migrated `strutture-js/domain/math` runtime boundary:

- dense Gaussian elimination with partial pivoting and reusable LU factorization;
- banded Cholesky factorization and automatic semi-bandwidth detection;
- the source array helpers and 3-by-3 linear-system solver;
- `rayPolygonCapacity` for radial demand-capacity intersection with a sampled closed polygon.

This is a strict subset of the `strutture-js@0.8.0` public API. Missing exports are
`not-implemented`, not silently removed or deprecated. The complete baseline entry-point inventory
is recorded in `migration/baseline.json`.

Italian NTC-linked material names and legacy serialized confidence descriptions are preserved for
parity under [decision 0002](decisions/0002-language-and-migrated-public-strings.md). Their presence
does not change English as the default language for newly authored API material. Material design
values are implemented for the exported NTC factory, ULS uniaxial section resistance, and uniaxial
and biaxial interaction-domain scopes. Other reinforced-concrete analysis modes and serviceability
calculations must not be inferred from the public DTOs.

For `uls-uniaxial-resistance`, `uls-uniaxial-domain`, and `uls-biaxial-domain`, the TypeScript
application preserves the JavaScript result shape and numerical behavior. `service-stress` is also
implemented and preserves the source numerical output and existing fields; it adds a structured
Circolare 2019 reference for the inherited default modular ratio. `moment-curvature` preserves the
source event-location, ductility, post-ultimate, and serialized-result behavior. These
partial-surface and additive traceability differences are recorded in the slice provenance manifests
rather than being presented as an independent API redesign.

The public shear verifier preserves the source NTC 2018 capacities and parameter-resolution
behavior. Its circular empirical branch adds an `outside-corpus` structured reference to the
identified Cosenza-Maddaloni-Cuomo publication; no normative status is inferred for that research
formulation.

The public torsion verifier preserves the source NTC 2018 concrete-strut, transverse-reinforcement,
longitudinal-reinforcement, and combined shear-torsion checks. It retains the source result fields
and explicit missing-input behavior.

The public detailing verifiers preserve the source ordinary and dissipative beam/column rules,
anchorage inputs, and confinement calculations. The shared EN 1992 helper functions are exported for
source compatibility and remain explicitly `outside-corpus`.

The public column verifier aggregates second-order screening or nominal-stiffness generation,
biaxial section resistance, optional shear capacity design, and optional detailing. Effective
lengths and solver-neutral member actions remain explicit consumer inputs.

The public beam verifier aggregates solver-neutral sampled ULS and SLE actions, uniaxial or biaxial
section resistance, service stress and indirect crack control, optional shear and torsion, optional
detailing, and explicit station selection. Its local path preserves source behavior when
`serviceability.deflection` is `false`. Cracked-section deflection is not migrated in this slice; a
request for it produces an explicit `not-implemented` result.

The public plate application preserves the source 1000 mm conventional-strip boundary. It supports
rotated Wood-Armer ULS bending and shear, SLS stress and indirect crack control, and simplified
flat-slab slenderness. Membrane actions, direct deflection, global cracked analysis, and a plate
finite-element solver are not part of that public capability.

The public punching application preserves the source solver-neutral connection, signed joint-action,
and segment-based control-perimeter contracts. It supports interior, edge, and corner columns,
first- and second-generation EN 1992 kernels, generated or explicit perimeters, force reductions,
concentration factors, and optional vertical studs or links. Openings, beams, capitals, drops, wall
ends, varying slab thickness, prestress, and membrane compression are rejected as outside its scope.

The public seismic-wall functions preserve explicit solver-neutral section capacities and demands.
They cover local biaxial resistance and NTC 2018 chapter-7 wall, confinement, detailing,
coupling-beam, and height-aggregation rules. Automatic extraction of concurrent section-cut states
from a global finite-element model remains outside this local capability.

The public 2D frame kernel preserves the source linear Euler-Bernoulli and Timoshenko behavior for
generic nodes, supports, nodal and uniform full-element loads, nodal springs, prescribed
displacements, equal-DOF constraints, reactions, and internal-force sampling. The beam-line
preprocessor generates a straight frame from explicit supports, load discontinuities, and
discretization controls. The public single-beam pipeline composes these generic primitives with
section providers, load cases, combinations, station selection, sampled actions, reactions,
envelopes, and section-action verification. The public foundation-beam pipeline adds assigned
bilateral or compression-only lumped Winkler springs, imposed settlements, active-set contact, and
optional supplied stiffness iteration. These remain solver-neutral analysis boundaries. Rigid
offsets and geotechnical capacity derivation are not implied by these exports. The RC
foundation-beam exports provide local section verification and cracked-stiffness iteration for the
declared horizontal prismatic beam boundary. Full cracked-section deflection redistribution and the
source application registry remain outside the current target boundary.

`rayPolygonCapacity` preserves the source rule that a demand lies inside or on the sampled radial
domain when `utilizationRatio <= 1`. It is a generic geometric operation; the beam and column
verifiers use it only after their own applicability and action-resolution steps.

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
