> Classification: PUBLIC-SAFE | Decision status: accepted | Implementation status: implemented

# Decision 0003 — Masonry arch rigid-block solver foundation

## Purpose of this record

This record defines the mechanical and software foundation for a two-dimensional masonry-arch module
based on rigid voussoirs, interfaces, and optional curved tension-only reinforcement. Milestones 1
through 8 geometry, loads, interface laws, state and collapse equilibrium, assigned post-tensioning,
curved intrados deviators, curved extrados contact, rigid anchor checks, and passive-tendon response
on prescribed rigid-block configurations are implemented. Decision 0009 records the current
deformable-interface formulation, contact and crushing continuation, passive bonded layers, and
final public analysis architecture. Typed model comparison, comparability diagnostics, and the
reviewed literature-evidence register are also implemented. Capabilities outside the declared scope
remain unavailable unless stated otherwise in the technical documentation.

Decision 0009 refines the public analysis semantics without changing this mechanical foundation. It
separates mechanical model, engineering objective, and numerical strategy, and makes the complete
analysis-local definition of lambda part of every relevant result.

The record commits Milestones 1 through 8 to the accepted geometry, load, interface,
representative-state, static limit-analysis, non-associated sliding, finite-compression, and
kinematic active-set choices, together with the reinforcement and comparison decisions below. No
post-peak contact algorithm is implied.

## Canonical authority and normative references

Decision 0004 resolves the former governance prerequisite: `structural-checks-ts` is the sole
canonical implementation and the masonry-arch module is developed directly in this repository.

Research papers used as mechanical references are `outside-corpus` unless and until canonical
identifiers are available in a compatible current `strutture-normative` corpus. The corpus may be
corrected and refined without rolling it back to an old commit. Reference resolution, engineering
validation, and legal or regulatory conformity remain separate concerns.

## Repository findings that constrain the design

- The package is ESM-only, strict TypeScript, browser and Web Worker compatible, and has no runtime
  dependencies.
- Public consumers may import only the root or declared package subpaths. The existing
  `./applications/*` wildcard can expose a `masonry-arches` application without immediately adding a
  new domain subpath.
- Models generally require explicit `{ force, length }` input units, normalize to documented
  internal units, preserve source units in metadata, and expose serializable DTOs.
- Results preserve `status`, `outputs`, `checks`, `warnings`, `assumptions`, `metadata`, `demand`,
  `capacity`, and `utilizationRatio` where applicable.
- Available numerical components include dense Gaussian elimination with pivot diagnostics, banded
  Cholesky factorization, Illinois bracketing, linear 2D assembly utilities, and a displacement-
  control nonlinear solver. There is no linear-programming, quadratic-programming, complementarity,
  or general constrained-optimization solver.
- Existing masonry components include compression-only cyclic fibers, shear-strength laws,
  masonry-pier kinematics, and nonlinear state commit/revert patterns. They are useful references,
  but none is a rigid-voussoir arch equilibrium or limit-analysis kernel.

## Scope and declared limits

The initial structural system is one in-plane arch strip represented by an ordered chain of rigid
voussoirs and two boundary contacts. It may carry self-weight, fixed loads, and one common
multiplier applied to any number of scalable loads. It may include zero or more curved
reinforcements.

The following are outside the initial scope:

- continuous masonry FEM, continuum damage, or mesoscale brick-and-mortar FEM;
- out-of-plane behavior, torsion of the arch barrel, and three-dimensional load distribution;
- deformable soil or fill interaction, multi-ring interaction, spandrel walls, and train-load
  distribution; prescribed fill weight is included as an arch load;
- deformable voussoirs;
- deformable, slipping, or progressive-pullout anchors;
- product-specific anchor resistance derived by the library;
- branching rigid-block assemblages, vaults, and domes until the ordered-chain solver is validated;
- legal, regulatory, or professional conformity claims.

## Recommended layering

The reusable rigid-block mechanics should be independent from the arch application workflow:

```text
src/domain/masonry/rigid-blocks/
  geometry and local frames
  rigid-block equilibrium assembly
  interface strength-domain contracts
  equilibrium and kinematic residual diagnostics

src/applications/masonry-arches/
  geometry builders and discretization
  arch model normalization
  arch load mapping
  curved reinforcement and anchor demand
  state, collapse, convergence, and comparison analyses
  public application barrel
```

Only the `applications/masonry-arches` subpath should be public initially. A new public
`domain/masonry` package subpath would be a separate API decision. Root exports and application
registry inclusion should be added only when the implemented scope is validated.

This preserves `applications -> domain`, keeps the core reusable by a future non-arch block system,
and avoids coupling the mechanics to a UI or concrete external solver.

## Coordinate, sign, and ordering conventions

The recommended internal unit system is `{ force: "kN", length: "m" }`, matching the existing
masonry interface and nonlinear masonry components. Every public model constructor must still
require explicit input units.

- Global `+x` points right and global `+y` points up.
- Positive global moment is counter-clockwise.
- Voussoirs and interfaces are ordered from the left springing to the right springing.
- Each interface has an intrados point, an extrados point, a midpoint, and a local joint axis `j`
  directed from intrados to extrados.
- The interface normal and tangent are stored explicitly; their orientation must never be inferred
  later from a screen coordinate system.
- `N` is positive in compression.
- `V` is positive along the stored local tangent.
- `M` is defined so that `e = M / N` is positive toward the extrados along `j`.
- A thrust-line point at `e > 0` therefore approaches the extrados; a point at `e < 0` approaches
  the intrados.
- Reinforcement tension `T` is non-negative. A negative elastic trial force produces the slack state
  and is projected to zero.

Every result must repeat the axes, interface ordering, component order, signs, and units in
metadata.

## Geometry representation and stereotomy

Two independent curves are not sufficient to define blocks: an arch also needs a correspondence
between the intrados and extrados and a stereotomy for its joints. The normalized solver geometry
should therefore be explicit voussoir polygons and interface segments, regardless of how the input
was generated.

### Simplified symmetric input

The first public builder should provide the compact input expected in routine use while retaining an
unambiguous normalized geometry:

```ts
type SimplifiedSymmetricArchProfile =
  | {
      type: "circular";
    }
  | {
      type: "elliptical";
      springingAngle: number;
      angleUnits: "deg" | "rad";
    };

interface SimplifiedSymmetricArchGeometryInput {
  kind: "simplified-symmetric";
  referenceCurve: "intrados" | "centerline" | "extrados";
  profile: SimplifiedSymmetricArchProfile;
  span: number;
  rise: number;
  thickness: number;
  outOfPlaneWidth: number;
  voussoirCount: number;
  keystone?: {
    arcLength: number;
  };
  stationing?: "equal-arc-length";
}
```

For `type: "circular"`, span and rise define the circle and the springing tangent angle is derived;
the contract does not accept a third independent angle. For `type: "elliptical"`, span, rise, and
springing angle define a symmetric segment of an axis-aligned ellipse. The angle is measured at the
left springing from global `+x` toward the crown.

One explicit parameterization of the elliptical reference curve is:

```text
x(u) = a sin(u)
y(u) = b cos(u) - b cos(u0)
-u0 <= u <= u0
```

where the crown is at `u = 0`. Given span `L`, rise `f`, and springing angle `alpha`:

```text
r = L tan(alpha) / (2 f)
cos(u0) = 1 / (r - 1)
a = L / (2 sin(u0))
b = f / (1 - cos(u0))
```

The limiting `alpha = 90 degrees` case is the upper half of an ellipse with `a = L / 2` and `b = f`.
Finite input must satisfy `tan(alpha) > 4 f / L`; equality is the degenerate parabolic limit rather
than a finite ellipse. The builder must reject incompatible or degenerate values rather than alter
the requested angle.

The reference curve is explicit because intrados, centerline, and extrados span/rise differ once
thickness is applied. The selected curve is constructed from the simplified parameters and the other
two curves are obtained by normal offset. The normalized solver stores all three and reports the
offset-approximation error. `span`, `rise`, and elliptical `springingAngle` always refer to this
selected curve. It rejects cusps, self-intersections, reversed offsets, and any case where the
requested thickness is not geometrically admissible.

Without a custom keystone, the complete reference-curve arc length is divided into `voussoirCount`
equal parts. Circular joints are radial; elliptical and other smooth-profile joints are normal to
the selected reference curve. An even count places a joint at the crown; an odd count places an
ordinary central block there.

When `keystone` is supplied, its custom `arcLength` is centered exactly at the crown and
`voussoirCount` must be odd. The remaining reference-curve length is divided equally among the
remaining `voussoirCount - 1` blocks, half on each side. An even count is an input error rather than
being silently rounded. The keystone length, resolved stations, and remaining common block length
are reported in normalized geometry.

The public geometry builders should support:

- circular and symmetric elliptical-segment arches;
- polycentric arches as ordered circular segments with continuity checks;
- paired intrados/extrados polylines with explicit corresponding stations;
- explicit voussoir polygons for arbitrary stereotomy;
- a centerline plus constant normal thickness, with curvature and self-intersection validation.

Arbitrary callback curves should not be stored in the model because they are not serializable. A
sampling helper may accept a callback during preprocessing, but it must produce a serializable,
versioned normalized geometry before analysis.

The discretizer must return, for every voussoir:

- polygon vertices, signed and absolute area, centroid, and orientation;
- out-of-plane width and volume;
- self-weight force and its application point;
- left and right interface identifiers;
- interface endpoints, length, midpoint, normal, tangent, and local joint axis;
- source curve stations and geometric approximation errors.

Degenerate polygons, crossed boundaries, reversed station order, zero-length interfaces, negative
thickness, and non-matching endpoints are failures, not silently repaired inputs.

## Unified arch model

The public model should be one serializable, discriminated contract rather than separate solvers for
plain, passive, or post-tensioned arches. Decision 0009 defines its final public shape:

```ts
interface MasonryArchModelInput {
  id: string;
  units: UnitSystemInput;
  geometry: MasonryArchGeometryInput;
  masonry?: MasonryArchMasonryInput;
  interfaceLaw: MasonryInterfaceLawInput;
  supports?: MasonryArchSupportsInput;
  loads?: readonly MasonryArchLoadInput[];
  reinforcements?: readonly ArchReinforcementInput[];
  bondedLayers?: readonly BondedLayerReinforcementInput[];
  metadata?: Record<string, unknown>;
}
```

`reinforcements: []` is the plain arch. `initialForce: 0` is passive reinforcement.
`initialForce > 0` is post-tensioning. These are model states, not separate algorithms.

## Springing boundaries

The two springings are rigid external boundaries connected to the first and last voussoir by
explicit contact interfaces. The boundaries have no compliance or rigid-body motion in the initial
scope. Their contact interfaces use the same admissible-domain contracts as internal interfaces,
with independent property overrides when required.

Support reactions are the resultants transmitted by these boundary interfaces. Opening, sliding, and
crushing are therefore governed by the selected contact law and are not suppressed by an abstract
point support or a hidden “fixed” reaction assumption. Prescribed boundary movement and deformable
abutments are deferred extensions.

## Loads and the collapse multiplier

Arch loads must use the existing general `Action`, `LoadCase`, and `LoadCombination` system instead
of embedding a second set of `G1`, `G2`, variable-action category, partial-factor, or SLE/ULS rules.
Each arch load is assigned to a load case. The existing NTC 2018 combination builders may then
produce SLE or ULS factors from permanent classes and variable-action categories.

The collapse partition is an analysis choice, not an intrinsic property of a physical load. After
the selected load-combination factors are resolved, the analysis identifies which load-case ids are
fixed and which share the collapse multiplier:

```text
F(lambda) = sum(gamma_j F_j,fixed) + lambda sum(gamma_k F_k,scalable)
```

The initial release should use one scalar `lambda` shared by all selected scalable loads. Multiple
independent multipliers are a different optimization problem and are not implied by accepting more
than one scalable load. Combination factors and `lambda` must never be multiplied implicitly in an
undocumented order: combination factors are resolved first, and `lambda` then scales the selected
factored pattern. State and collapse results must report both sets of factors.

Required load types are:

- body force/self-weight from assigned unit weight;
- prescribed fill weight varying with the vertical depth above the arch;
- uniform distributed load over the complete arch;
- patch distributed load over a bounded interval;
- point force and point moment at a geometric location;
- explicit load already assigned to a voussoir, for reproducible benchmark assembly.

For a horizontal fill surface and vertical gravity loading, the recommended fill definition is:

```text
h(x) = h_crown + y_extrados,crown - y_extrados(x)
q_fill(x) = gamma_fill b h(x)
```

where `gamma_fill` is fill unit weight, `b` is the analyzed out-of-plane width, and `h_crown` is the
cover depth at the crown. Setting `h_crown = 0` gives exactly the requested intensity proportional
to the vertical distance below the crown. This is a prescribed load only: no fill stiffness,
arching, passive pressure, or soil-structure interaction is implied.

Distributed loads use intensity per unit horizontal projection by default and may explicitly select
intensity per unit arch length. The resolved basis must always be present in normalized inputs and
results. The intrados, centerline, or extrados curve used to measure `dx` or `ds` must also be
explicit after normalization and may differ from the curve where the load acts. Patch limits and
point-load locations should accept a normalized arch station and, where useful, a global `x`
coordinate, with the resolved station reported in output. Numerical integration must preserve
resultant and moment about every loaded block centroid and expose quadrature error diagnostics.

For example, if the span is `10 m`, the curved reference length is `12 m`, and the entered vertical
intensity is `10 kN/m`:

- `horizontal-projection` produces a total vertical force of `10 x 10 = 100 kN`;
- `arc-length` produces a total vertical force of `10 x 12 = 120 kN`.

Physical fill is integrated by vertical strips, so its elemental weight is
`dF = gamma_fill b h(x) dx`. If expressed internally per curved length `ds`, its equivalent
intensity is `q_s = gamma_fill b h(x) |dx/ds|`; this transformation preserves the same total force
and moment.

Load mapping must preserve both force and moment about the block centroid. Its output must expose
the equivalent per-block fixed and scalable wrenches so that global equilibrium can be audited.

## Interface strength domains

One interface contract should expose its admissible resultant domain and, later, its constitutive
trial/commit response. Planned discriminants are:

```text
heyman
coulomb
finite-compression
nonlinear-contact
```

For the ideal Heyman domain:

```text
N >= 0
|M| <= N h / 2
```

where `h` is the available joint length between intrados and extrados. Sliding is excluded by an
explicit model assumption, not by a hidden large friction coefficient.

For Coulomb friction and optional cohesion:

```text
|V| <= c A + mu N
```

with `mu` and `c` assigned at the interface or through a model default. `c = 0` is the default.

The architecture must allow a future deformation-based law with normal opening/closure, tangential
slip, history variables, and commit/revert state without changing the normalized block geometry or
analysis result schemas.

## State analysis is not unique under Heyman assumptions

For a statically indeterminate rigid arch, equilibrium and the no-tension inequalities define a set
of admissible thrust lines. They do not identify a unique physical stress state. Returning one line
without saying how it was selected would be mechanically misleading.

The recommended state result therefore contains:

1. feasibility and equilibrium residuals;
2. admissible ranges or margins for the redundant reactions where computable;
3. one explicitly labelled representative admissible solution;
4. the objective and scaling used to select that representative solution.

The recommended representative is the center of the normalized admissible polytope, obtained by
maximizing the minimum normalized interface margin. It is a robust visualization and diagnostic
choice, not an elastic prediction. An elastic or deformation-based state requires a separate
constitutive model.

The state API must therefore distinguish at least:

```text
solutionMeaning: "representative-statically-admissible"
solutionMeaning: "constitutive-equilibrium"
```

## Recommended limit-analysis formulation

### Alternatives considered

1. **Enumerate assumed hinge mechanisms.** Transparent for textbook arches, but incomplete for
   arbitrary loads, friction, crushing, reinforcement, and mixed modes.
2. **Elastic regularization followed by hinge release.** Produces a unique path but adds stiffness
   assumptions to a classical rigid-plastic problem and can make the result path dependent.
3. **Static lower-bound optimization with a kinematic dual.** Represents equilibrium and interface
   strength constraints directly, finds the maximum admissible multiplier, and can recover a
   mechanism from the dual when the assumptions admit one.

### Recommendation

Use the static lower-bound formulation as the primary Milestone 1–5 kernel and derive or solve the
corresponding kinematic problem for mechanism reporting. Do not assume a four-hinge mechanism. This
choice is implemented for the ideal Heyman Milestone 2 domain.

For the ordered single-arch chain, all interface resultants can be propagated from the three left
boundary resultants. The optimization therefore has a small number of independent variables even
when the arch has hundreds of voussoirs. The implementation should exploit this chain reduction but
retain a general equilibrium-assembly contract so that a future branching block system can replace
the backend without changing the arch API.

Active interface constraints identify candidate hinges, sliding joints, or crushing sections. A
collapse mechanism is returned only if a compatible rigid-block velocity field satisfies support
constraints, contact directions, and virtual-work equilibrium within tolerance. Otherwise the result
must say that a static limit was found but a unique mechanism was not determined.

For finite friction, static admissibility and kinematic interpretation remain separate. Associated
Coulomb flow introduces dilation. The accepted default is non-associated zero-dilation flow, solved
by sequential LP with an explicit active-set compatibility and frictional-dissipation check. An
incompatible or multi-dimensional active set remains a static-admissibility result and is not called
a verified sliding mechanism.

The sequential construction follows the published formulation of Gilbert, Casapulla, and Ahmed, DOI
`10.1016/j.compstruc.2006.02.005`, as restated for masonry arches by Hua and Milani, DOI
`10.1016/j.compstruc.2023.106987`. These are mechanics references classified as `outside-corpus`,
not normative conformity sources.

## Optimization backend decision

### Alternatives considered

1. Add a JavaScript/WASM LP package such as a general simplex or interior-point solver.
2. Add a repository-owned generic dense LP solver.
3. Implement a small, deterministic fixed-dimension half-space solver specialized for the ordered
   arch-chain reduction, with full primal residual and active-set diagnostics.

### Recommendation

Start with alternative 3 for the linear Heyman and Coulomb milestones. It avoids a new runtime
dependency, keeps browser bundles predictable, and scales primarily with the number of interface
constraints rather than a dense global variable count. The algorithm must use deterministic ordering
or a fixed seed, explicit row and variable scaling, feasibility tolerances, and independent
equilibrium/duality checks.

Do not expose this backend as a general public LP solver. If later block topologies or finite-
compression domains require a general optimizer, record a separate dependency and numerical-method
decision with browser-size and benchmark evidence.

## Finite compression decision

Two mechanically different models must not be conflated:

1. a rigid-plastic bounded compression stress field, suitable for lower-bound limit analysis; and
2. an elastic no-tension distribution, suitable for a constitutive state analysis.

For a rectangular joint of out-of-plane width `b`, available length `h`, and bounded compressive
stress `0 <= sigma <= f_c`, the exact rigid-plastic resultant domain has a nonlinear moment
boundary. A piecewise-linear inner approximation can preserve a safe lower bound and the linear
optimizer, but needs an explicit facet-convergence study.

An elastic no-tension distribution instead gives full compression inside the kern and a triangular
compressed zone outside it. It produces a determinate `compressedLength` and `maxCompression` only
after a constitutive deformation or a selected resultant state is assigned.

The alternatives considered were:

- rigid-plastic limit domain for collapse plus a separately labelled representative stress recovery;
- elastic no-tension contact for state and a nonlinear collapse search;
- a fiber-discretized interface with documented mesh regularization and convergence.

The accepted path is the first one for collapse, using a safe faceted inner domain and an explicit
facet-convergence parameter. A uniform edge compression block provides separately labelled output
recovery. Elastic/deformation-based stress recovery remains a later model.

## Curved reinforcement and anchors

In the implemented contract, an `ArchReinforcement` is a curved tension-only tendon: it is an
ordered path along the selected arch boundary. It must not be used for a bonded FRCM, FRP, SFRM, or
similar layer. `BondedLayerReinforcement` is a separate family that modifies local section
resistance and has explicit bond-development and end-anchorage limits. This distinction follows the
Milestone 8 review of D'Ambrisi et al. 2015 and Zampieri et al. 2020 and prevents bonded-layer
benchmarks from being misreported as tendon validation.

Reinforcement path, physical deviators/connectors, and masonry voussoirs are distinct entities. The
numerical assembly maps a physical interaction force to the containing voussoir. In reference
geometry, a device exactly on an internal interface is shared equally by its adjacent voussoirs at
the same point. In a prescribed moved configuration, its position is the average of its two rigidly
transformed attachments and each block receives half the force at its own attachment point. This
work-conjugate mapping preserves virtual work, resultant force, and moment without identifying the
device with either block.

The state stores reference and current segment lengths, tensions, tangent stiffness, and
slack/yield/failure flags separately from masonry compression resultants. In reference-geometry
state and collapse analyses, the path force is `initialForce`. A separate prescribed-configuration
operation evaluates compatible force and updated direction without claiming structural equilibrium.

For an elastic tension-only segment or frictionless continuous tendon:

```text
T_trial = T0 + EA (L - L0) / L0
T = max(0, T_trial)
```

`T0 > 0` contributes actions in the reference configuration. `T0 = 0` produces no initial action and
activates only when the current path length exceeds its stress-free length.

For a distributed terminal transfer, segment tension is represented as `T_j = r_j T`. Its compatible
elastic length is therefore:

```text
L_eff = sum_j r_j l0,j
T_trial = T0 + EA (L - L0) / L_eff
```

This preserves the assumed progressive tension-transfer pattern. If either end is
`continuous-external`, the modeled path does not define the compatibility of the omitted cable and
the current release remains force-controlled at `T = T0`.

At an internal deviator, with cable tangents oriented consistently along the path, the force exerted
by the cable on the anchor is:

```text
F_anchor = T_plus t_plus - T_minus t_minus
```

Equivalent forms using both unit vectors directed away from the anchor are acceptable if the stored
orientation is explicit. For equal adjacent tension and deviation `Delta theta`:

```text
|F_normal| = 2 T sin(Delta theta / 2)
```

The two terminal conditions are discriminated:

- `continuous-external`: the tendon continues beyond the model with its assigned tension. No local
  terminal anchorage resistance is checked, but the boundary traction transmitted to the external
  system is returned so equilibrium is auditable;
- `distributed-anchorage`: a separate rigid connector group transfers the tension progressively over
  a terminal zone. Connector count and constant spacing are independent of the global deviator
  count. Equal load shares are the default; explicit positive shares summing to one may be supplied.
  Segment tension rises from zero to `T` at the left group and falls from `T` to zero at the right
  group.

Computing each node action from its adjacent segment tensions and directions makes the distributed
system telescope exactly. With two distributed terminations, the complete tendon-to-arch action is
self-equilibrated in force and moment. A single concentrated terminal anchor remains expressible as
`connectorCount: 1`.

Anchor resistance is assigned by the user. Serializable interaction rules should be discriminated
data such as independent component checks, linear interaction, or elliptical interaction; arbitrary
callbacks should not be stored in the model. Anchor checks return demand, capacity, utilization,
status, and provenance, without deriving product-specific ETA/EAD resistance.

### Intrados and extrados are different constraints

- Intrados reinforcement requires explicit rigid deviators to hold the tendon on a path from which
  it would otherwise detach. Their count is independent of the voussoir count, must be odd and not
  smaller than three, and includes one physical deviator at the crown. They are equally spaced by
  arc length along the intrados.
- On the current convex circular and elliptical extrados, positive cable tension presses the tendon
  against the masonry. The normalized model therefore uses unilateral contact samples rather than
  inventing physical deviators. A negative inward contact component is reported as
  `contact-cannot-enforce-path`; geometry with curvature reversal or a gap requires an explicit
  guide model before it can be accepted.
- Terminal transfer connectors are physical devices and remain distinct from both intrados deviators
  and extrados contact samples. Co-located devices are assembled once and reported with a combined
  role.

The discrete deviator model must converge to `q_n = T kappa` as the path is refined. This is a
required benchmark, not merely a documentation statement.

## Reference-geometry and finite-kinematics analyses

Assigned equilibrium and direct limit analysis use the reference geometry. This supports classical
unreinforced limit analysis and prescribed post-tensioning actions. A passive tendon with `T0 = 0`
remains slack unless a compatible deformation is evaluated; a reference-geometry rigid-block
equilibrium cannot invent its elongation.

Deformable-path analysis gives each voussoir rigid-body translations and rotation, evaluates current
interface gaps and slips, and updates reinforcement length and direction from current positions. The
coupled sequence is load, block motion, contact state, tendon elongation, tendon force, and renewed
equilibrium.

Milestone 6 implements and tests the passive tendon constitutive/kinematic response under prescribed
finite rigid-block motion. Its coupled structural benefit is not claimed until Milestone 7
implements geometric update and nonlinear equilibrium.

The existing displacement-control solver is a useful algorithmic reference, but it assumes a smooth
tangent evaluator. Rigid contact, friction, and tension-only activation are nonsmooth. Reuse must be
decided after a one-interface and a short-arch prototype demonstrates convergence; otherwise an
active-set or semismooth formulation may be required. Arc-length should not be introduced until a
validated load/displacement-control path shows that a limit point cannot be followed adequately.
Decision 0009 records the implemented explicit load, displacement, and spherical arc-length
alternatives.

## Public analyses and result schemas

The intended public workflow is:

```ts
const model = createMasonryArch(input);
const state = analyzeMasonryArchEquilibrium(model, {
  loadFactorsByCaseId,
});
const collapse = analyzeMasonryArchLimit(model, {
  loadCombination,
  scalableLoadCaseIds: ["Q-leading"],
});
const comparison = compareMasonryArchModels(cases, {
  referenceCaseId: "heyman",
});
```

These names and versioned `CalculationResult` outputs are implemented public contracts.

The state output should contain:

- normalized geometry and per-block applied wrenches;
- support reactions;
- one representative masonry thrust line and its stated solution meaning;
- per-interface `N`, `V`, `M`, `e`, normalized eccentricity, compressed length, maximum compression,
  friction utilization, active constraints, and state;
- masonry compression resultants separate from reinforcement tension;
- reinforcement segment states and anchor force vectors;
- global force/moment equilibrium residuals and tolerances;
- warnings, assumptions, convergence information, and visualization geometry.

The collapse output should contain:

- distinct capacity landmarks and fixed/scalable load decomposition;
- failure mode and all simultaneously active modes;
- critical, hinged, sliding, and crushing interfaces;
- reinforcement and anchor states;
- a compatible collapse mechanism when determinable;
- primal, dual, equilibrium, and virtual-work residuals;
- optimizer termination, iterations, tolerances, scaling, and warnings.

Comparison must consume complete analysis results and report model identifiers, assumptions,
capacity landmarks, failure mode, maximum compression, maximum tendon force, maximum anchor force,
and comparable/non-comparable reasons. It must not compare values silently when load patterns,
units, or geometry differ.

## Diagnostics and tolerances

Absolute tolerances alone are not adequate across unit systems and arch sizes. Every solve must use
documented normalized residuals and also report physical residuals:

```text
sum Fx
sum Fy
sum M about a declared origin
```

Recommended residual scaling uses the greater of one and the total absolute applied force; moment
scaling additionally uses a declared characteristic arch length. Interface admissibility has its own
force and moment scales.

Warnings must cover at least insufficient block discretization, insufficient strength-domain
faceting, non-convergence, near-degenerate geometry, non-positive compression where not permitted,
slack reinforcement, reinforcement or anchor overload, exceeded friction/compression, ill-
conditioned active constraints, and non-unique mechanisms.

## Validation sequence and gates

No milestone advances until its predecessor has mechanical tests, strict consumer tests, package
exports, browser/worker checks, provenance, and documented tolerances.

1. **Geometry and state equilibrium:** symmetric simple arch, reaction symmetry, thrust-line
   symmetry, exact global equilibrium, invalid geometry, and 20/40/80/160 block geometry
   convergence.
2. **Ideal collapse:** independent static and kinematic/virtual-work agreement, active hinges, load
   multiplier convergence, and a public analytical or literature benchmark.
3. **Friction and finite compression:** rocking-to-sliding transition, compression-governed cases,
   mixed active constraints, and interface-domain convergence.
4. **Assigned post-tensioning:** separate masonry/tendon resultants, intrados deviator and extrados
   contact forces, equilibrium after prestress, and `q_n = T kappa` convergence.
5. **Rigid anchors:** internal and terminal anchor force vectors, the `2 T sin(Delta theta / 2)`
   identity, and assigned-capacity checks.
6. **Passive tendon law:** zero initial force, activation in elongation, slack in shortening, and
   elastic/yield/failure transitions under prescribed motion.
7. **Geometric nonlinearity:** incremental residual checks, block rotations/openings, tendon path
   update, load-displacement and tension-displacement histories, and limit-point behavior.
8. **Comparison and validation closure:** cross-model comparability rules, convergence reports,
   documented benchmarks, applicability limits, and performance budgets.

The initial Milestone 8 gate is implemented. Broader arch validation remains open: comparison output
must continue to distinguish implemented executable benchmarks from registered future targets.

## Initial public benchmark candidates

The validation campaign should use primary sources and transcribe only the minimum inputs and
reference outputs necessary for reproducibility, with license and provenance review:

- D'Ambrisi et al., _Carbon-FRCM materials for structural upgrade of masonry arch road bridges_, DOI
  `10.1016/j.compositesb.2015.01.024`: the exact unreinforced finite-compression `M-N` equation is
  implemented as a versioned regression, together with the strengthened asymmetric section domain.
  The multi-span C-FRCM collapse cases remain planned because they require multi-span geometry and a
  complete bridge-input transcription.
- Zampieri et al., _Evaluation of the vertical load capacity of masonry arch bridges strengthened
  with FRCM or SFRM by limit analysis_, DOI `10.1016/j.engstruct.2020.111135`: the lower-bound,
  finite-compression, friction, and zero-dilatancy formulations are consistent with the implemented
  static architecture. The equivalent bonded tensile-membrane domain is implemented; numerical
  reproduction remains planned where passive backfill resistance or untranscribed bridge inputs are
  required.

- Makris and Alexakis, _The effect of stereotomy on the shape of the thrust-line and the minimum
  thickness of semicircular masonry arches_, DOI `10.1007/s00419-013-0763-4`: radial-stereotomy
  minimum thickness `t/R = 0.1075` and vertical-stereotomy value `t/R = 0.1095`.
- Aita, Bruggi, and Taliercio, _Limit analysis of masonry arches and domes with finite strength:
  funicular analysis versus stability area method_, DOI `10.1007/s11012-024-01781-7`: a fully
  specified segmental-arch geometry, self-weight, scalable crown load, finite compression, critical
  joints, and independent stability-area comparison.
- Niero, Pagliarusco, and Zampieri, _Collapse behaviour of masonry arch bridges strengthened with an
  external post-tensioning system_, DOI `10.1016/j.engstruct.2026.122451`: intrados post-tensioning,
  evolving tendon force/direction, finite compression, failure modes, and load-displacement
  validation against an experimental arch.
- Zampieri et al., _Damaged masonry arch bridges strengthened with external post-tensioning:
  Experimental and numerical results_, DOI `10.1016/j.engstruct.2024.117929`: experimental
  unstrengthened and post-tensioned arch capacity data and rigid-block comparison.

The minimum-thickness problem validates geometry and ideal no-tension equilibrium, not a general
collapse multiplier. The finite-compression and post-tensioning papers require a benchmark fixture
review to confirm that all geometry, material, load, damage, and cable inputs needed for independent
reproduction are publicly reported.

## Confirmed decisions

The maintainer confirmed on 2026-08-10 that:

1. `structural-checks-ts` is the sole canonical implementation;
2. the static lower-bound formulation with kinematic verification is the Milestone 1–5 method;
3. a representative admissible Heyman state is acceptable when it is explicitly labelled as
   non-unique and non-constitutive;
4. the ordered-chain fixed-dimension optimizer is the initial backend;
5. finite-compression collapse uses the recommended rigid-plastic domain with separately labelled
   stress recovery;
6. a frictional multiplier is called a verified collapse only after an explicit flow-rule and
   kinematic check;
7. intrados reinforcement uses independent equally spaced rigid deviators, while a convex extrados
   uses unilateral contact samples; terminal connector groups remain separate from both;
8. passive-tendon constitutive testing and coupled geometrically nonlinear benefit remain separated
   between Milestones 6 and 7;
9. the arch reuses the general action, load-case, and SLE/ULS combination manager;
10. the load vocabulary includes fill, uniform, patch, and point loads;
11. simplified geometry supports circular and elliptical profiles and may be defined at the
    intrados, centerline, or extrados;
12. the springings are rigid external boundaries with explicit contact interfaces;
13. ordinary blocks use equal reference-curve arc lengths; an optional custom-length keystone is
    centered at the crown and requires an odd total block count;
14. convenience builders may classify masonry self-weight as `G1` and fill weight as `G2`, while the
    normalized model retains explicit, overridable load cases;
15. distributed loads default to horizontal-projection intensity and may explicitly select
    arc-length intensity; fill always uses horizontal vertical-strip integration.

The maintainer additionally confirmed on 2026-08-11 that:

16. Coulomb sliding defaults to a non-associated flow rule with zero dilation;
17. the strength surface and plastic potential remain distinct, with an optional explicit dilation
    angle satisfying `0 <= psi <= phi`;
18. the initial non-associated collapse backend uses sequential LP and verifies frictional
    dissipation rather than deriving a physical mechanism from the static LP dual alone;
19. finite compression uses the rigid-plastic rectangular no-tension domain, a configurable safe
    chord approximation, and separately labelled uniform-edge-block stress recovery;
20. cohesion defaults to zero; nonzero cohesion in this release is ideal rigid-plastic and has no
    opening- or slip-induced degradation;
21. physical intrados deviators and masonry voussoirs are independent; deviators are equally spaced
    by intrados arc length, have an odd count of at least three, and include one at the crown;
22. a convex extrados uses unilateral contact rather than physical deviators by default;
23. each tendon end is either continuous beyond the model or transfers tension to the arch through
    an independently discretized terminal connector group;
24. reinforcement actions are applied to the containing block and split equally only when their
    physical point lies exactly on an internal interface, preserving force and moment;
25. a two-ended distributed anchorage is length-compatible, whereas a tendon continuing beyond the
    model remains force-controlled until an external tendon-length boundary is supplied;
26. a device on a moving joint uses work-conjugate two-block interpolation rather than arbitrary
    ownership by one voussoir;
27. yield, tensile strength, and ultimate strain are explicit checks; the elastic force is not
    silently capped by an unimplemented plastic law.
28. nonlinear equilibrium uses explicit deformable no-tension interfaces and never assigns hidden
    stiffness to an ideal Heyman interface;
29. the first nonlinear flow implementation is non-associated Coulomb plasticity with zero dilation;
30. adaptive load control, augmented displacement control, and spherical arc-length are explicit
    alternatives with separate convergence diagnostics;
31. nonlinear extrados contact uses the verified taut-cable release active set recorded by Decision
    0009;
32. bonded FRCM/FRP/equivalent-SFRM layers use the distinct tension-only membrane model recorded by
    Decision 0009.

## Decisions that may be deferred to later milestones

- `initialForce` should be the effective tendon force in the reference analysis state; prestress
  losses and jack-to-effective-force conversion remain outside the arch solver unless a later
  normatively traceable module supplies them.
- A point load exactly on a joint needs an explicit target block or joint action to avoid arbitrary
  left/right assignment.
- Frictional tendon ducts, deformation-dependent unequal adjacent tendon tensions, nonlinear path
  control, and support settlements each require a later dedicated mechanical decision.
