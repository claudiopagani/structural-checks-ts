# Migration status

Last updated on 2026-08-01.

## Baseline safety

- At initialization, the target repository had no commits and only the pre-existing untracked
  `AGENTS.md` was present. The initialization is now recorded at target commit
  `0282894f3ceb597c59e8591ca16988622e4c4843`.
- Source repository: clean `master`, aligned with `origin/master`, at
  `6f33baead8b88166c4b2cf94af41763412e3c751`.
- The completed normative audit, structured reference catalog, resolver check, and audit tests are
  committed in that source `HEAD`.
- `strutture-js npm run check`: passed.
- Normative corpus: clean `master` at `41da3faa489600173106935bbcf726119300e48d`.
- `strutture-normative npm run check:ci`: passed.
- `strutture-js npm run check:normative-references`: passed with 44 resolved references, 13
  explicitly `outside-corpus`, 401 canonical units, and 320 assets.

The corpus's proposed `integration/structural-checks-ts/manifest.json` records an older source
commit and a dirty observed worktree. It is not used as the migration baseline. The committed pin in
the clean source implementation and its passing resolver check are used instead.

## Implemented slice 0001

Implementation state: **implemented** for the declared foundation scope.

- strict TypeScript result DTOs, status constants, and generic check utilities;
- strict TypeScript force/length unit resolver;
- root ESM package export and declaration output;
- reconstructed source tests and live compatibility comparisons;
- provenance, architecture, package, browser bundle, Web Worker, and external corpus checks.

No engineering formula or verifier is included in this slice. Its implementation state does not
extend validation or conformity claims.

## Implemented slice 0002

Implementation state: **implemented** for reinforced-concrete section modeling and mechanical
JavaScript parity.

- rectangular, circular, T, and polygon section geometry;
- section mass properties, rotations, and principal-axis resolution;
- reinforcement bars and generated top/bottom longitudinal layouts;
- generic transformed composite sections;
- reinforced-concrete sections with positioned bars, transformed properties, bounding boxes,
  reference points, and baseline-compatible serialization;
- reconstructed geometry, reinforcement, and composite-section oracles;
- live result and serialization comparisons against the pinned JavaScript source.

This slice contains usable section and reinforcement models. It does not contain concrete material
design values, normative resistance formulas, member checks, or verifiers. Those capabilities remain
`not-implemented`.

The source material-confidence model was deliberately not copied in this slice. The subsequent
[language decision](decisions/0002-language-and-migrated-public-strings.md) now permits its Italian
NTC-linked serialized descriptions to be preserved for compatibility.

## Implemented slice 0003

Implementation state: **implemented** for the declared concrete and reinforcement material scope.

- generic base, concrete, and steel material DTOs with explicit units and cloning;
- LC1–LC3 existing-material confidence states and characteristic-value conversion;
- NTC 2018 concrete class and B450A/B450C reinforcement catalogs;
- fresh and existing concrete material factories;
- fresh and existing reinforcing-steel material factories;
- preserved Italian NTC material names and knowledge descriptions under the recorded language
  decision;
- structured references to NTC formulas [4.1.3] and [4.1.5];
- an explicit `outside-corpus` reference for chapter 11 material-property inputs;
- reconstructed material tests and live serialized parity comparisons.

The material values and DTOs in this scope are usable and integrated with slice 0002 section models.
This does not implement section resistance, serviceability, member verification, or a normative
conformity claim.

## Implemented slice 0004

Implementation state: **implemented** for the declared NTC 2018 ULS uniaxial section-resistance
scope.

- ULS concrete parabola-rectangle, triangular-rectangle, and stress-block constitutive laws;
- reinforcing-steel elastic-perfectly-plastic and elastic-plastic-hardening laws;
- rectangular or polygonal concrete fiber discretization;
- affine strain fields, concrete strain extremes, and the ultimate section-state kernel;
- Illinois axial-equilibrium iteration;
- `ReinforcedConcreteSectionModel`, `ReinforcedConcreteSectionVerification`, and
  `ReinforcedConcreteSectionApplication`;
- uniaxial N–M resistance for either compressed edge at an assigned axial force;
- preserved result fields, sign convention, N/mm normalization, warnings, assumptions, and
  structured NTC metadata;
- exact live result comparison with the pinned JavaScript source for positive and negative bending;
- a fixed numerical oracle with `MxRd = 225827910.755909 N·mm` for the migrated test section;
- an independent continuous-section integration and bisection equilibrium result of
  `225901455.6072406 N·mm`, with a recorded 0.0326% fiber-mesh difference against a 0.1% acceptance
  limit.

This is usable engineering functionality for the declared ULS uniaxial section scope. It is not a
complete reinforced-concrete verifier. At the completion of this slice, uniaxial and biaxial
interaction domains, service stress, moment-curvature, shear, torsion, detailing, columns, beams,
foundations, walls, plates, punching, and solver adapters remained `not-implemented`. Slice 0005
subsequently implements the uniaxial interaction domain.

The implemented analysis mode has no known serialized or numerical parity difference. While the
migration was at slice 0004, the TypeScript verifier deliberately returned `not-implemented` for the
four other section analysis modes that the JavaScript baseline already dispatched.

## Implemented slice 0005

Implementation state: **implemented** for the declared NTC 2018 ULS uniaxial N-M interaction-domain
scope.

- public `RCUniaxialDomainBuilder` with strict TypeScript input and output contracts;
- assigned axial-force levels, sorted and deduplicated consistently with the JavaScript source;
- automatic axial-force sampling between `As fyd` in tension and `-(0.8 Ac fcd + As fyd)` in
  compression;
- either one curvature sign or both top- and bottom-compressed branches;
- application dispatch through the `uls-uniaxial-domain` analysis type;
- preserved result fields, rounding, ordering, assumptions, warnings, units, and structured NTC
  metadata;
- exact full-result comparison with the pinned live JavaScript source;
- fixed numerical oracles for four assigned axial-force levels and both curvature signs;
- comparison of the `NEd = -800000 N` domain point with the independent continuous-section reference
  from slice 0004, retaining the 0.0326% observed difference against a 0.1% acceptance limit;
- independent reconstruction of the automatic axial-capacity endpoints and 21-point spacing.

This is usable engineering functionality for generating the declared uniaxial resistance domain. It
does not evaluate whether a demand point lies inside the domain and is not a complete
reinforced-concrete verifier. At the completion of this slice, biaxial interaction domains, service
stress, moment-curvature, shear, torsion, detailing, member checks, and solver adapters remained
`not-implemented`. Slice 0006 subsequently implements the biaxial interaction domain.

The implemented domain result has no known serialized or numerical parity difference for the tested
assigned-force fixture. At this slice, the TypeScript application manifest advertised the two
migrated uniaxial modes and deliberately excluded the remaining JavaScript workflows.

## Implemented slice 0006

Implementation state: **implemented** for the declared NTC 2018 ULS biaxial N-Mx-My
interaction-domain scope.

- public `RCBiaxialDomainBuilder` with strict TypeScript input and output contracts;
- an assigned axial-force level with configurable neutral-axis angle sampling;
- source-compatible counterclockwise angle orientation from positive `MxRd` toward positive `MyRd`;
- positive or negative compressed-side control on the public builder;
- application dispatch through the `uls-biaxial-domain` analysis type;
- preserved result fields, rounding, ordering, assumptions, warnings, units, and structured NTC
  metadata;
- exact full-result comparison with the pinned live JavaScript source;
- fixed numerical oracles for eight angles, including both cardinal axes and four coupled-moment
  quadrants;
- independent continuous weak-axis integration and bisection equilibrium result of
  `117838878.40731114 N·mm`, compared with the refined 984-fiber result of `117775476.843262 N·mm`;
  the observed 0.0538% difference is below the 0.1% acceptance limit.

This is usable engineering functionality for generating the declared biaxial resistance domain. It
does not evaluate whether a demand point lies inside the domain and is not a complete
reinforced-concrete verifier. Service stress, moment-curvature, shear, torsion, detailing, member
checks, and solver adapters remain `not-implemented`.

The tested biaxial result has no known serialized or numerical parity difference. The TypeScript
application manifest now advertises all three migrated ULS section modes and deliberately excludes
the remaining JavaScript workflows.

## Implemented slice 0007

Implementation state: **implemented** for the public math boundary and radial demand-capacity scope.

- public `./domain/math` package subpath matching the JavaScript runtime surface;
- dense Gaussian elimination with partial pivoting, diagnostics, and reusable LU factorization;
- symmetric banded Cholesky solving, diagnostics, and semi-bandwidth detection;
- array helpers and the three-by-three linear-system solver needed by subsequent concrete analyses;
- source-compatible radial ray-polygon capacity intersection;
- direct inside, boundary, outside, and zero-demand classification through the
  `utilizationRatio <= 1` rule;
- live parity comparisons with the pinned JavaScript source;
- an analytic rectangular-domain oracle with boundary intersection `(75, 50)` and utilization ratio
  `0.8` for demand `(60, 40)`;
- demand classification against the sampled reinforced-concrete biaxial domain from slice 0006.

This is usable geometric demand-capacity functionality for closed, sampled two-dimensional
resistance domains. It does not itself determine whether a structural model, load combination, or
member is applicable, and it is not a normative conformity claim. Integration into concrete beam,
column, wall, and generic member verification remains `not-implemented`.

## Implemented slice 0008

Implementation state: **implemented** for the declared reinforced-concrete service-stress
equilibrium scope.

- public linear no-tension concrete and linear elastic steel constitutive laws;
- public `RCServiceStressSolver` for axial force and biaxial bending;
- uniaxial and biaxial solve paths with damped finite-difference Newton iteration;
- concrete tension excluded from equilibrium and response details;
- source-compatible fallback infrastructure for later serviceability and member workflows;
- standalone `service-stress` dispatch through the reinforced-concrete section application;
- explicit modular ratio with the inherited default `n = 15`;
- structured traceability to the pinned Circolare 2019 unit supporting that default;
- exact live parity for constitutive response, solver state, and all pre-existing workflow fields;
- independent uniform axial validation using `eps0 = NEd / ((Es / n) Ac + Es As)`.

This is usable service-stress analysis. It does not yet apply NTC concrete or reinforcement stress
limits, perform crack or deflection checks, or verify a beam, column, wall, or other member. The
additional `metadata.normativeReferences` entry is an intentional traceability improvement over the
otherwise numerically and structurally matching JavaScript result.

## Implemented slice 0009

Implementation state: **implemented** for the declared reinforced-concrete moment-curvature scope.

- public `RCMomentCurvatureAnalyzer` with strict TypeScript input, point, event, and curve
  contracts;
- axial-equilibrium solution at prescribed curvature and neutral-axis orientation;
- first-yield, material-ultimate, balanced-failure, maximum-moment, and post-ultimate event
  locations;
- configurable zero-stress, retained-stress, and linear-softening post-ultimate response;
- NTC 2018 conventional first-yield curvature and curvature-ductility outputs;
- standalone `moment-curvature` dispatch through the reinforced-concrete section application;
- exact full-result comparison with the pinned JavaScript source;
- independent elastic fiber-stiffness validation using
  `Mx = Ec * sum(Ai * (yi - yc)^2) * curvature`.

This is usable section-level moment-curvature analysis. It does not verify shear, torsion,
detailing, member stability, or a complete beam or column. The migrated result has no known
serialized or numerical parity difference.

## Implemented slice 0010

Implementation state: **implemented** for the declared reinforced-concrete shear scope.

- public `ReinforcedConcreteShearVerification` with strict serializable contracts;
- safe resolution of web width, effective depth, longitudinal steel area, concrete area, material
  strengths, axial compression, and vertical stirrups;
- NTC 2018 resistance without transverse reinforcement;
- NTC 2018 variable-angle truss resistance with vertical stirrups, including concrete-strut and
  steel-tie mechanisms;
- source-compatible selection of the greater available stirrup and no-stirrup resistance;
- explicit missing-input results without replacement by zero;
- inherited Cosenza-Maddaloni-Cuomo circular-section equations, clearly marked as empirical, without
  a partial safety factor, and `outside-corpus`;
- exact live parity for the NTC branches and parity apart from additive structured traceability for
  the empirical branch;
- independent direct evaluation of the no-stirrup NTC equations.

This is usable section-level shear verification within the stated inputs. It does not implement
torsion interaction, minimum reinforcement, spacing, anchorage, or complete member detailing.

## Implemented slice 0011

Implementation state: **implemented** for the declared reinforced-concrete torsion scope.

- public `ReinforcedConcreteTorsionVerification` with strict serializable contracts;
- rectangular-section derivation of effective wall thickness, median area, and median perimeter,
  with explicit geometry accepted for other section shapes;
- NTC 2018 concrete-strut, closed-transverse-reinforcement, and assigned-longitudinal-reinforcement
  torsion resistances;
- compatible or explicit strut-angle resolution within the inherited NTC limits;
- combined concrete shear-torsion interaction using the same strut angle and the migrated shear
  resistance kernel;
- explicit compatibility-torsion opt-out and safe missing-input results;
- exact live serialized parity with the pinned JavaScript source for resistance, interaction,
  missing-shear, and compatibility-torsion cases;
- independent direct evaluation of all three torsion resistances.

This is usable section-level equilibrium-torsion verification within its stated geometry and
reinforcement inputs. The longitudinal torsion steel remains an explicitly assigned area; this slice
does not establish its additive placement with flexural reinforcement, minimum reinforcement,
spacing, anchorage, or complete member detailing.

## Implemented slice 0012

Implementation state: **implemented** for the declared beam and column detailing scope.

- public EN 1992 bond, anchorage, local-bearing, and shrinkage-curvature helpers with explicit
  `outside-corpus` references;
- public `ReinforcedConcreteBeamDetailingVerification` for longitudinal and transverse minimum and
  maximum rules, dissipative zones, hoop geometry, continuity, and anchorage;
- public `ReinforcedConcreteColumnModel` with source-compatible unit normalization;
- public `ReinforcedConcreteColumnDetailingVerification` for ordinary reinforcement, dissipative
  geometry, hoop constraints, confinement effectiveness, mechanical confinement, curvature ductility
  demand, and anchorage;
- exact live serialized parity for the beam and column detailing fixtures;
- independent direct evaluation of anchorage, minimum steel, confinement effectiveness, and
  mechanical confinement.

These are usable detailing checks for explicit serializable reinforcement contracts. They do not
infer reinforcement from drawings, replace bar arrangement review, establish construction
feasibility, or yet aggregate section resistance and actions into complete beam or column member
results.

## Implemented slice 0013

Implementation state: **implemented** for the declared local column-member scope.

- public `ReinforcedConcreteColumnVerification` and `ReinforcedConcreteColumnApplication`;
- independent-axis NTC 2018 slenderness screening with explicit effective lengths;
- explicit total-moment acceptance or isolated-member nominal-stiffness second-order generation;
- biaxial fiber-domain demand containment at the assigned axial force;
- optional two-axis shear verification with dissipative capacity-design demand;
- optional reinforcement and confinement detailing aggregation;
- exact live full-result parity for stocky, unresolved slender, generated second-order,
  capacity-shear/detailing, and serializable-model cases;
- independent reconstruction of nominal rigidity, Euler critical load, moment magnification, and
  generated total moment.

This is usable local column verification for solver-neutral assigned actions and effective lengths.
It does not perform global frame analysis, infer effective lengths, or replace a global P-Delta
analysis when that is required.

## Implemented slice 0014

Implementation state: **implemented** for the declared local beam-member scope.

- public `BeamSectionActionVerifier`, `verifyBeamSectionActions`,
  `ReinforcedConcreteServiceabilityVerification`, and `ReinforcedConcreteBeamVerification`;
- solver-neutral ULS and SLE result selection with all, critical, user, grid, and combined station
  modes;
- uniaxial or biaxial ULS flexural resistance and radial demand containment;
- NTC 2018 concrete and reinforcement service-stress limits;
- indirect crack control using explicit reinforcement groups and Circolare 2019 diameter and spacing
  tables;
- optional shear, torsion interaction, and beam detailing aggregation;
- exact full-result parity with the pinned JavaScript source when `serviceability.deflection` is
  explicitly `false`;
- a composition fixture covering biaxial flexure, service stress, crack control, shear-torsion
  interaction, dissipative detailing, station metadata, and missing-input behavior.

This is usable local beam verification for supplied solver-neutral sampled actions. Cracked-section
deflection belongs to a separate source application with additional FEM redistribution dependencies
and is not part of this slice. If deflection is requested, the beam verifier returns an explicit
`not-implemented` result; it does not silently claim that deflection was checked. Global analysis
and solver-specific adapters also remain outside this scope.

## Implemented slice 0015

Implementation state: **implemented** for the declared local reinforced-concrete plate and
slab-strip scope.

- public strict TypeScript plate model, application, verification, and action-transformation
  contracts;
- source-compatible rotation of plate moments and shear into reinforcement axes;
- conservative orthogonal Wood-Armer demands on top and bottom 1000 mm strips;
- ULS uniaxial strip bending and independent X/Y shear verification, with optional vertical S-links;
- SLS service-stress and indirect crack-control checks on each equivalent strip;
- simplified flat-slab slenderness screening using both reinforcement faces and the Circolare 2019
  C4.1.I interpolation;
- exact live full-result parity with the pinned JavaScript source for ULS without stirrups, ULS with
  an S-link grid, SLS stress/cracking, and simplified slenderness;
- tensor-invariant, shear-vector, distributed-area, and strip-fiber reconstruction checks.

This is usable local plate verification for explicit resultants and reinforcement. It is not a plate
finite-element solver, does not accept membrane resultants, does not perform punching verification,
and does not calculate curvature, stiffness, a deflected shape, or direct deflection. Those
exclusions remain explicit in the serialized scope metadata.

## Implemented slice 0016

Implementation state: **implemented** for the declared local reinforced-concrete punching scope.

- strict TypeScript connection, action-state, joint-action transfer, control-perimeter, request,
  verification, and application contracts;
- first-generation EN 1992 punching resistance with support-face, basic-control, reinforced, outer
  control, and reinforcement-layout checks;
- second-generation EN 1992 punching resistance with basic-control, maximum-resistance, reinforced,
  outer-control, and reinforcement-layout checks;
- canonical generated perimeters for rectangular interior, edge, and corner columns, plus circular
  interior columns and explicit segment-based perimeters;
- automatic or assigned concentration factors, direct punching forces, support reactions, and
  enclosed-load reductions;
- exact live full-result parity with the pinned JavaScript source for both code generations, with
  and without vertical punching reinforcement;
- published worked-example values and DTO normalization as fixed migration oracles.

This is usable local punching verification for constant-thickness slabs within the declared
connection geometry. Openings, beams, capitals, drops, wall ends, varying thickness, prestress,
membrane compression, inclined reinforcement, and proprietary reinforcement-system enhancements
remain explicitly outside the implemented scope.

## Implemented slice 0017

Implementation state: **implemented** for the declared solver-neutral reinforced-concrete
seismic-wall scope.

- exact live parity for all public source wall kernels and their structured normative metadata;
- biaxial wall-section resistance through the migrated fiber solver and sampled resistance domain;
- critical-zone height, moment-envelope shift, slender and squat capacity-shear amplification, and
  dissipative-zone shear modifiers;
- wall boundary length, confinement trigger, and mechanical confinement ratio;
- effective flanges, mixed-system shear envelopes, and weakly reinforced wall shear/axial ranges;
- wall curvature ductility, geometry, reinforcement detailing, and coupling-beam procedures;
- wall-section and wall-height completeness aggregation without synthesizing missing capacities;
- independent numerical checks of the shear-amplification and confinement equations.

This is usable wall verification for explicit solver-neutral section capacities and demands.
Automatic collection and resistance-axis projection of concurrent wall section-cut states requires
the remaining global FEM contracts and is deliberately deferred to that later slice.

## Implemented slice 0018

Implementation state: **implemented** for the declared local reinforced-concrete isolated-footing
scope.

- strict TypeScript model, application, contact-analysis, and verification contracts;
- exact compression-only equilibrium for full, uniaxial partial, and nonlinear biaxial partial
  contact of a rigid rectangular base;
- assigned design bearing and sliding resistance checks without synthesizing geotechnical capacity;
- orthogonal 1000 mm strip bending and one-way shear checks from integrated contact pressure;
- punching demand from the column force minus the enclosed effective soil reaction;
- column-footing local bearing and optional column/footing reinforcement anchorage;
- exact live full-result parity with the pinned JavaScript source for five application branches;
- exact contact-state and strip-integration parity with the pinned JavaScript source.

This is usable local structural verification for a centered, unrotated rectangular footing with
explicit units and assigned geotechnical resistances. Bearing-capacity derivation, settlement,
sliding-resistance derivation, soil-structure interaction, eccentric or rotated columns, and
solver-specific action extraction remain outside this slice.

## Implemented slice 0019

Implementation state: **implemented** for the declared static axial single-pile geotechnical scope.

- strict TypeScript soil-material, layered-profile, one-dimensional ground-model, ULS design
  situation, pile, load-scenario, vertical-stress, analysis, and application contracts;
- hydrostatic total/effective vertical stress through layered bulk and saturated unit weights;
- alpha-undrained, beta effective-stress, K tan(delta), and assigned shaft-resistance methods;
- undrained-Nc, effective-stress-Nq, and assigned base-resistance methods;
- exact integration where an effective-stress or unit-resistance ceiling crosses a layer segment;
- explicit component and overall resistance conversion with mandatory provenance;
- compression and shaft-only tension paths, explicit action/capacity checks, and toe-layer proximity
  screening;
- a serializable structural-coupling result that marks pile response, pile groups, and structural
  verification with their actual unavailable states;
- live numerical and serialized parity for every migrated fixture.

This is usable static ULS geotechnical capacity for one vertical constant-section pile. It does not
implement pile groups, pile-cap load sharing, axial transfer curves, settlement, negative skin
friction, cyclic or seismic behavior, lateral response, or structural pile-section resistance.
GroundSection2D, pore-pressure fields, zone-based selection, and deformation-parameter resolution
also remain deferred. The TypeScript result deliberately adds one structured `outside-corpus` USACE
reference; all other result content retains live source parity.

## Implemented slice 0020

Implementation state: **implemented** for the declared solver-neutral linear 2D frame-kernel scope.

- strict TypeScript node, support, point-load, nodal-load, line-load, and distributed-load DTOs;
- stable three-DOF 2D frame registration and element-load indexing;
- dense global stiffness and load assembly, including nodal support springs;
- prescribed-displacement and scaled equal-DOF reduction with offsets;
- linear-static solution, displacement expansion, and reaction recovery;
- linear-elastic Euler-Bernoulli frame stiffness, uniform full-element loads, and internal-force
  sampling;
- exact live parity for DTOs, assembly, constraints, solver results, diagnostics, and error paths;
- independent cantilever, simply supported, and fixed-fixed closed-form response checks.

This is a usable low-level linear 2D frame analysis kernel. It is not an RC member or
foundation-beam verification application. Timoshenko elements, rigid offsets, beam-line
preprocessing, load combinations, envelopes, cracked-section iteration, and reinforced-concrete
foundation-beam checks are covered by slices 0021 through 0024.

## Implemented slice 0021

Implementation state: **implemented** for the declared beam-line preprocessing and linear
Timoshenko-element scope.

- straight horizontal beam-line subdivision at supports, point loads, partial uniform-load bounds,
  requested element counts, and maximum element lengths;
- generated generic nodes, frame elements, supports, springs, nodal loads, and full-element uniform
  loads with explicit unit conversion;
- explicit rejection of unsupported trapezoidal and tapered loads;
- closed-form linear Timoshenko stiffness with assigned or material/section-derived shear rigidity;
- shear-correction handling and locking diagnostics;
- exact live parity for generated models, solver response, serialization, units, and tested errors;
- independent point-load, partial uniform-load, and stocky-cantilever closed-form checks.

This is usable preprocessing and linear frame-element functionality. The higher-level
`SingleBeamAnalysis` pipeline is migrated separately in slice 0022. RC foundation-beam analysis and
verification are covered by slices 0023 and 0024.

## Implemented slice 0022

Implementation state: **implemented** for the declared generic single-beam analysis scope.

- strict TypeScript section rotation, elastic section-provider, input, station, FEM-builder, sampled
  result, envelope, and analysis contracts;
- explicit section or provider-derived axial, flexural, and optional shear rigidity;
- Euler–Bernoulli or Timoshenko linear elements, including custom source-compatible element-class
  overrides;
- inclined beam geometry with source-compatible horizontal projection of vertical loads;
- section-rotation projection of vertical rigidity and principal internal actions, with the source
  warning and modeled-axis limitations preserved;
- normalized supports, uniform and point loads, load cases, combinations, governing load context,
  verification-station selection, reactions, sampled actions, and result envelopes;
- generic solver-neutral beam section-action verification through the existing contract;
- exact live serialized comparison with the pinned JavaScript `SingleBeamAnalysis` result, plus
  closed-form, station, torsion-forwarding, provider-context, and validation-error fixtures.

This is usable generic linear single-beam analysis for explicit solver-neutral inputs. It is not RC
foundation-beam analysis, does not model Winkler soil springs or active-set contact, does not
perform cracked-section deflection or stiffness iteration, and does not provide a building-level
analysis or solver-specific adapter. Generic foundation-beam analysis is covered by slice 0023 and
RC foundation-beam analysis by slice 0024.

## Implemented slice 0023

Implementation state: **implemented** for the declared generic foundation-beam analysis scope.

- strict TypeScript foundation-beam model, FEM builder, and analysis contracts;
- contiguous or segmented subgrade-modulus inputs with explicit contact width and unit conversion;
- bilateral lumped Winkler springs assembled by tributary element length;
- imposed soil settlements represented by source-compatible equivalent nodal loads;
- compression-only contact through the source active-set iteration, including active-node metadata,
  relaxation, convergence, and warnings;
- optional element flexural-stiffness iteration through a solver-neutral supplied resolver;
- beam action sampling, soil pressure and reaction response, gap and sign-convention fields,
  load-case combinations, envelopes, assumptions, and metadata;
- exact live model-field and full-result comparisons with the pinned JavaScript source, plus
  independent equilibrium, settlement, active-set, segmented-spring, and stiffness-iteration checks.

This is usable generic foundation-beam soil-interaction analysis for assigned solver-neutral inputs.
It does not derive soil capacity or geotechnical settlement, perform consolidation or creep
analysis, verify reinforced-concrete foundation-beam sections, perform cracked-section deflection,
or provide a solver-specific adapter. Reinforced-concrete foundation-beam verification is covered by
the separate slice 0024 boundary.

## Implemented slice 0024

Implementation state: **implemented** for the declared RC foundation-beam boundary.

Manifest `migration/slices/0024-reinforced-concrete-foundation-beams.json` records the separate
reinforced-concrete foundation-beam boundary at the pinned source revision. Its scope is:

- `ReinforcedConcreteBeamSectionProvider` and its public factory;
- `SectionMomentCurvatureCurve` only as required for the foundation-beam cracked-stiffness resolver;
- `ReinforcedConcreteFoundationBeamModel` and `ReinforcedConcreteFoundationBeamApplication` composed
  with the migrated generic foundation and local beam pipelines;
- strict DTO and error parity, public-root exports, live serialized comparisons, and independent
  section, cracking-threshold, contact, stiffness-iteration, and metadata checks.

The implementation records the source normative keys with the pinned corpus classification and makes
no conformity claim. The source application registry remains a separate unimplemented boundary. The
standalone `RCrackedDeflectionApplication`, full `CrackedSectionDeflectionAnalysis`, hyperstatic
deflection iteration, and service-deflection adapters are explicitly outside this slice and remain a
later boundary.

## Remaining migration

The package as a whole is **partial**. Remaining work includes:

1. complete export, symbol, formula, fixture, validation-campaign, performance, and bundle
   inventory;
2. remaining normative catalogs and structured reference utilities;
3. standalone reinforced-concrete cracked-section deflection, source application-registry parity,
   geotechnical foundations, remaining pile checks, and other concrete applications in bounded
   slices;
4. remaining FEM elements, preprocessing, applications, browser, and Web Worker parity;
5. complete numerical campaigns and tolerance comparison;
6. other material systems and remaining low-level domain primitives;
7. package identity, history, compatibility, freeze, cutover, and rollback decisions.
