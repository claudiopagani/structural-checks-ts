> Classification: PUBLIC-SAFE | Implementation status: implemented | Validation status:
> not-validated

# Two-dimensional masonry-arch analysis

## Implemented scope

The implemented module provides a geometrically linear, two-dimensional rigid-voussoir arch with
explicit contact interfaces and selectable rigid-plastic no-tension laws:

- no masonry tension;
- unbounded or assigned finite compression resistance;
- no sliding or Coulomb sliding with an explicit flow rule;
- rigid voussoirs and rigid springing boundaries;
- small-displacement equilibrium in the reference geometry.

It calculates normalized geometry, applied block wrenches, a representative statically admissible
equilibrium, springing reactions, interface resultants, eccentricities, hinge proximity, global
equilibrium residuals, and a masonry thrust line. It also calculates the multiplier of selected
factored load cases, verifies hinge and zero-dilation sliding mechanisms, and checks external work
against frictional dissipation. Finite-compression activation is identified statically; a crushing
velocity mechanism is not yet recovered.

The same model may contain assigned curved post-tensioning. Intrados tendons use independent rigid
deviators; convex extrados tendons use unilateral contact samples. Continuous-external and
distributed terminal-transfer conditions are explicit. Reinforcement forces, contact forces, device
demands, capacities, and utilization remain separate from masonry compression results.

The module additionally provides a geometrically nonlinear path solver for the explicit
`deformable-no-tension` interface family. It uses finite rigid-block kinematics, analytically
integrated global-joint normal contact, one zero-dilation elastic-plastic Coulomb slip variable per
interface, fixed-action initialization, adaptive load control, displacement control, and spherical
arc-length control. A compact non-symmetric banded backend is used until a curved tendon introduces
global coupling. Compatible intrados and extrados tendons participate in equilibrium and may
activate from the solved deformation; extrados samples use a unilateral taut-cable active set.
Finite masonry compression stops at onset by default, while an explicit perfectly plastic option
stores irreversible closure and permits continuation with elastic unloading.

FRCM, FRP, and equivalent SFRM layers are separate passive bonded reinforcements. Static analysis
adds their asymmetric tension-only membrane contribution to the local `N-M` domain, including
anchored or linearly developed unanchored ends. Deformable analysis activates them from compatible
joint opening using an explicit transfer length. Typed cross-model comparison includes both curved
tendons and bonded layers. The declared simplified single-span scope is `implemented`; its complete
application range remains `not-validated`. The implemented mechanisms are tested, but the library
does not claim universal material calibration or bridge-level validation.

## Public API

The module is available from the declared wildcard application subpath:

```ts
import {
  analyzeMasonryArchCollapse,
  analyzeMasonryArchNonlinear,
  analyzeMasonryArchState,
  compareMasonryArchModels,
  createMasonryArch,
  evaluateArchReinforcementConfiguration,
  evaluateMasonryArchBondedSectionDomain,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

const model = createMasonryArch({
  id: "arch-1",
  units: { force: "kN", length: "m" },
  geometry: {
    kind: "simplified-symmetric",
    referenceCurve: "intrados",
    profile: { type: "circular" },
    span: 10,
    rise: 3,
    thickness: 0.8,
    outOfPlaneWidth: 1,
    voussoirCount: 41,
    keystone: { arcLength: 0.5 },
  },
  masonry: { unitWeight: 20 },
  interfaces: {
    model: "coulomb",
    frictionCoefficient: 0.6,
    flowRule: { type: "non-associated", dilationAngle: 0, angleUnits: "rad" },
  },
  loads: [
    { id: "SW", type: "self-weight", loadCaseId: "G1" },
    {
      id: "Q-left",
      type: "patch",
      loadCaseId: "Q",
      components: { x: 0, y: -10 },
      startStation: 0.05,
      endStation: 0.45,
    },
  ],
  reinforcements: [],
});

const state = analyzeMasonryArchState(model);

const collapse = analyzeMasonryArchCollapse(model, {
  scalableLoadCaseIds: ["Q"],
});
```

An intrados assigned post-tension can be added without changing the analysis functions:

```ts
reinforcements: [
  {
    id: "PT-intrados",
    side: "intrados",
    area: 0.002,
    elasticModulus: 200_000_000,
    initialForce: 100,
    interaction: {
      type: "rigid-deviators",
      count: 7,
      capacity: { resultantResistance: 80 },
    },
    terminations: {
      left: {
        type: "distributed-anchorage",
        connectorCount: 3,
        connectorSpacing: 0.2,
      },
      right: { type: "continuous-external" },
    },
  },
];
```

A passive bonded layer is a separate input family:

```ts
bondedLayers: [
  {
    id: "FRCM-intrados",
    family: "frcm",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    debondingStrain: 0.0066,
    ultimateStrain: 0.012,
    transferLength: 0.25,
    terminations: {
      left: { type: "unanchored", developmentLength: 0.5 },
      right: { type: "anchored" },
    },
  },
];
```

`transferLength` is used only by deformable compatibility analysis. Static limit analysis uses the
assigned capacity and end-development ramp. On a model containing that layer,
`evaluateMasonryArchBondedSectionDomain(model, interfaceIndex, normalForce)` returns the local
asymmetric `N-M` slice and its governing facets.

The deviator count includes the two path-end deviators. It must be odd and at least three, so the
central deviator is exactly at the crown. The count is independent of `voussoirCount`.

A passive tendon can be evaluated on an explicitly prescribed rigid-block configuration:

```ts
const moved = evaluateArchReinforcementConfiguration(model, {
  units: { force: "kN", length: "mm" },
  blockDisplacements: [
    {
      blockId: "V-020",
      translation: { x: 0, y: 2 },
      rotation: 0.001,
    },
  ],
});
```

Omitted blocks retain their reference position. Translation uses the explicit configuration length
unit; finite rotation is counter-clockwise in radians. This function evaluates the reinforcement
response only and does not claim equilibrium of the prescribed masonry configuration.

Input force and length units are mandatory. The implementation normalizes internally to `kN` and `m`
and records both source and internal units in results.

The four public interface choices are:

```ts
{ model: "heyman" }
{ model: "coulomb", frictionCoefficient: 0.6 }
{
  model: "finite-compression",
  compressiveStrength: 1000,
  compressionFacetCount: 16,
  friction: { frictionCoefficient: 0.6 },
}
{
  model: "deformable-no-tension",
  normal: {
    elasticModulus: 2_000_000,
    characteristicLength: 0.4,
    compressiveStrength: 1000,
    postCrushingBehavior: "stop-at-onset", // or explicit "perfectly-plastic"
    integrationPointCount: 16,
  },
  tangential: {
    shearModulus: 800_000,
    characteristicLength: 0.4,
    frictionCoefficient: 0.6,
    cohesion: 0,
    flowRule: { type: "non-associated", dilationAngle: 0 },
  },
}
```

Support contacts inherit the internal law unless `supports.left.interface` or
`supports.right.interface` supplies an explicit override.

Arc-length continuation is selected explicitly:

```ts
const path = analyzeMasonryArchNonlinear(model, {
  geometricNonlinearity: true,
  scalableLoadCaseIds: ["Q"],
  control: {
    type: "arc-length",
    monitor: { blockId: "V-020", component: "y" },
    targetPathLength: 0.5,
    initialRadius: 0.02,
    loadScale: 1,
  },
  stopAtFirstMaterialLimit: false,
});
```

### Model comparison

`compareMasonryArchModels` runs each case through the same public collapse-analysis boundary and
returns one compact row per case:

```ts
const comparison = compareMasonryArchModels(
  [
    {
      caseId: "heyman-40",
      model: heymanModel,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "finite-compression-80",
      model: finiteCompressionModel,
      analysisOptions: { scalableLoadCaseIds: ["Q"] },
    },
    {
      caseId: "passive-nonlinear",
      model: passiveTendonModel,
      analysisOptions: {
        units: { force: "kN", length: "m" },
        geometricNonlinearity: true,
        scalableLoadCaseIds: ["Q"],
        control: {
          type: "load",
          targetLambda: 2,
          monitor: { blockId: "V-020", component: "y" },
        },
      },
    },
  ],
  { referenceCaseId: "heyman-40" },
);
```

Each row reports analysis status and convergence, `lambdaCritical`, failure mode, interface model,
geometric-linearity flag, discretization, reinforcement identifiers, maximum masonry compression,
maximum reinforcement, anchor and contact force, equilibrium residual, assumptions, and warnings.
`lambdaDifference`, `lambdaRatio`, and percentage difference are returned only when both the
reference and candidate have a finite critical multiplier.

Quantitative comparison is permitted only when the normalized physical geometry, load definitions,
combination factors, and fixed/scalable load-case roles agree within the assigned comparison
tolerance. A different number of voussoirs is allowed for convergence studies. Interface laws,
reinforcements, and geometric nonlinearity are intentional comparison variables. A mismatch returns
typed reason codes and exact differing property paths; it never silently reports a ratio.

### Geometrically nonlinear API

The deformable model may be followed using load control:

```ts
const path = analyzeMasonryArchNonlinear(deformableModel, {
  units: { force: "kN", length: "mm" },
  geometricNonlinearity: true,
  scalableLoadCaseIds: ["Q"],
  linearSolver: "automatic",
  control: {
    type: "load",
    targetLambda: 3,
    monitor: { blockId: "V-020", component: "y" },
    initialStep: 0.05,
    minimumStep: 1e-5,
  },
});
```

or by one block degree of freedom:

```ts
const path = analyzeMasonryArchCollapse(deformableModel, {
  units: { force: "kN", length: "mm" },
  geometricNonlinearity: true,
  scalableLoadCaseIds: ["Q"],
  control: {
    type: "displacement",
    blockId: "V-020",
    component: "y",
    increment: -0.1,
    targetDisplacement: -20,
  },
});
```

`analyzeMasonryArchCollapse` routes `geometricNonlinearity: true` to the same incremental solver.
Displacement inputs use the explicitly declared analysis length unit; rotations always use radians.
The output control definition is normalized to the internal `kN`–`m` system.

## Geometry

### Reference curve

`span`, `rise`, and the optional elliptical springing angle refer to the selected `referenceCurve`:

```text
intrados | centerline | extrados
```

The other curves are normal offsets of the selected curve. Offsets that reach a curvature cusp,
reverse, or become geometrically invalid are rejected.

### Circular profile

For half-span `a = L / 2` and rise `f`, the circle is:

```text
R = (a^2 + f^2) / (2 f)
y_c = f - R
```

The simplified builder currently requires `f <= L / 2`, so the reference curve is single-valued in
global `x`. The springing tangent angle is derived and is not an independent input.

### Elliptical profile

The symmetric elliptical segment is:

```text
x(u) = a_e sin(u)
y(u) = b_e cos(u) - b_e cos(u0)
-u0 <= u <= u0
```

Given span `L`, rise `f`, and left-springing angle `alpha` measured from global `+x`:

```text
r = L tan(alpha) / (2 f)
cos(u0) = 1 / (r - 1)
a_e = L / (2 sin(u0))
b_e = f / (1 - cos(u0))
```

`alpha` requires explicit `angleUnits: "deg" | "rad"`. A finite ellipse requires
`tan(alpha) > 4 f / L`; equality is the parabolic limit. At `alpha = 90 degrees`, the profile is the
upper half of an ellipse with semi-axes `L / 2` and `f`.

### Voussoirs and keystone

Without a custom keystone, the selected reference-curve length is divided into `voussoirCount` equal
parts. Even and odd counts are both valid.

With `keystone`, the custom arc length is centered at the crown and the total count must be odd. The
remaining reference length is divided equally between the other `voussoirCount - 1` blocks. An even
count is rejected rather than silently changed.

Circular joints are radial. Smooth non-circular joints are normal to the selected reference curve.
Each normalized voussoir exposes polygon vertices, area, centroid, out-of-plane width, volume,
source stations, and its two interface identifiers.

## Loads and combinations

Every load belongs to a general load case through `loadCaseId` or an existing `LoadCase` reference.
`analyzeMasonryArchState` accepts an existing `LoadCombination`; factors produced by the general
G1/G2/Q and SLE/ULS manager are applied before block equilibrium.

The current load mapper supports:

- self-weight from masonry unit weight and polygon volume;
- fill weight;
- uniform distributed load;
- patch distributed load;
- point force and point moment.

Distributed loads default to `distributionBasis: "horizontal-projection"`:

```text
dF = q dx
```

They may explicitly use `distributionBasis: "arc-length"`:

```text
dF = q ds
```

For a 10 m span, 12 m curved length, and 10 kN/m vertical load, these definitions produce 100 kN and
120 kN respectively.

`distributionCurve` identifies the intrados, centerline, or extrados curve whose `dx` or `ds`
measures the intensity. It defaults to the model's selected geometry reference curve and is
independent from `applicationCurve`, which identifies where the resultant acts. This distinction is
explicit because offset curves have different projected widths and arc lengths.

Fill always uses vertical tributary strips:

```text
h(x) = h_crown + y_extrados,crown - y_extrados(x)
dF_y = -gamma_fill b h(x) dx
```

This is prescribed gravity loading, not fill-structure interaction. A point load exactly on an
internal interface requires `targetVoussoirId`; the library does not assign it arbitrarily to the
left or right block.

Load integration preserves resultant force and moment about every block centroid. The resolved
per-block wrenches and per-load global resultants are public outputs.

## Collapse multiplier and load-case selection

The fixed/scalable partition belongs to each collapse analysis, not permanently to the physical load
or model. A UI checkbox can therefore be mapped directly to `scalableLoadCaseIds`. The same load
case may be fixed in one analysis and scalable in another.

For each supplied combination, its existing factors are resolved first. The selected factored load
cases then share one non-negative multiplier:

```text
F(lambda) = sum(gamma_j F_j,fixed) + lambda sum(gamma_k F_k,scalable)
```

For example, with `gamma_G1 = 1.3`, `gamma_Q = 1.5`, and only `Q` selected, the critical load field
is `1.3 G1 + lambdaCritical 1.5 Q`. The result reports the base combination factor, the fixed or
scalable role, and the effective factor at collapse for every load case.

The assigned factored combination corresponds to `lambda = 1`. Results therefore include a separate
load-factor check with `demand = 1`, `capacity = lambdaCritical`, and
`utilizationRatio = 1 / lambdaCritical`. Numerical analysis success and this engineering check are
kept separate: a correctly computed multiplier below one is an analysis result with a failed
load-factor check.

At least one known load case must be selected. If the selected cases have zero factor in the
combination, or otherwise produce a zero wrench field, the analysis rejects the input. Selecting all
loads may legitimately produce an unbounded multiplier in the ideal Heyman model: without a finite
strength, uniformly scaling an already admissible load pattern does not change geometric
admissibility. This is reported as `no-collapse-within-model`, not as an infinite JSON number.

## Interface and sign conventions

- Global `+x` is right and global `+y` is up.
- Positive global applied moment is counter-clockwise.
- Interfaces are ordered from the left springing to the right springing.
- The chain tangent is directed left-to-right.
- The joint axis is directed from intrados to extrados.
- `N` is positive in compression.
- `V` is positive along the joint axis.
- Interface `M` is signed so `e = M / N` is positive toward the extrados.

For available interface length `h`, ideal Heyman admissibility is:

```text
N >= 0
|M| <= N h / 2
```

The normalized eccentricity is:

```text
e_normalized = 2 e / h
```

Values `-1` and `+1` correspond to intrados and extrados eccentricity boundaries.

`compressedLength` and `maxCompression` are deliberately `null` in this ideal model. Inferring them
would introduce an unstated finite-stress or elastic distribution.

### Coulomb friction and non-associated flow

With gross contact area `A = b h`, Coulomb admissibility is:

```text
|V| <= c A + mu N
mu = tan(phi)
```

`frictionCoefficient` is `mu`; `cohesion` is a stress and defaults to zero. A nonzero cohesion is an
ideal rigid-plastic capacity with no opening- or slip-induced degradation in this release. Users
needing bond damage must not reinterpret it as a retained post-cracking material property.

The plastic potential is distinct from the strength surface:

```text
g(N, V) = |V| - tan(psi) N
```

The default is `flowRule: { type: "non-associated", dilationAngle: 0 }`. It permits tangential
plastic slip without forcing normal dilation. Unilateral opening from rocking remains independent
and available. `0 <= psi <= atan(mu)` is enforced. The associated option sets `psi = phi` and is
retained as an explicit comparison model, not as the physical default.

Assigned-load analysis uses the strength surface only. It reports, for every frictional interface,
`demand = |V|`, `capacity = c A + mu N`, `utilizationRatio`, and status. The flow rule enters only
when a sliding collapse mechanism is formed.

### Finite compression

The rigid-plastic rectangular no-tension stress block gives:

```text
0 <= N <= b h fc
|M| <= N (h / 2 - N / (2 b fc))
```

The curved resultant domain is replaced by a safe inner polygon. `compressionFacetCount` is the
number of chord facets per moment sign. The default is eight for a light browser-oriented analysis;
engineering use must refine it and check convergence. Chord stations are clustered near both `N = 0`
and `N = b h fc`, where a uniform stationing would give poor limiting slopes.

For output only, the solver recovers a uniform edge compression block:

```text
a = h - 2 |e|
sigma_max = N / (b a)
```

This recovery matches the adopted resultant domain but is not an elastic stress solution.
`compressedLength = a`, `maxCompression = sigma_max`, and the compression utilization are returned.
A statically active polygon facet is classified as crushing even when its conservative chord leaves
a small residual margin to the exact parabola; facet convergence quantifies that approximation.

The exact resultant-domain evaluator is separately exposed as
`rectangularNoTensionCompressionDomain2D`. The formula and its dimensional interpretation are
checked against Eq. (6) of D'Ambrisi et al.,
[_Carbon-FRCM materials for structural upgrade of masonry arch road bridges_](https://doi.org/10.1016/j.compositesb.2015.01.024).
The paper is a mechanical reference and does not create a normative-conformity claim.

## Curved assigned post-tensioning and rigid devices

Reinforcement path, physical devices, and masonry voussoirs are separate model entities. The path is
evaluated on the selected intrados or extrados boundary. Device stations are measured by that
boundary's own arc length, even when the arch geometry was defined using another reference curve.
Only during equilibrium assembly is a nodal reinforcement force assigned to masonry blocks. A force
inside a block is applied to that block at its physical point; a force exactly at an internal joint
is split equally between adjacent blocks at the same point. Both force and moment are thereby
preserved without identifying a device with a joint or a voussoir.

In reference-geometry state and collapse analyses, the active tendon force is the assigned
`initialForce`:

```text
T = initialForce >= 0
sigma_tendon = T / A
```

`initialForce: 0` therefore returns `slack` with zero action in those analyses. The separate
`evaluateArchReinforcementConfiguration` operation applies finite block translations and rotations,
reconstructs the current path, and evaluates the tension-only compatible response without solving
for that configuration.

For two terminations anchored inside the model, let `l0,j` and `l_j` be the reference and current
straight lengths of the tendon segments. Let `r_j` be the segment-tension ratio created by the
terminal transfer groups, so `T_j = r_j T` and `r_j = 1` away from a transfer zone. Then:

```text
L0 = sum_j l0,j
L  = sum_j l_j
L_eff = sum_j r_j l0,j
Delta L = L - L0

T_trial = T0 + EA Delta L / L_eff
T = max(0, T_trial)
```

An absolute length change not exceeding `64 Number.EPSILON max(1, L0, L)` is treated as zero only in
the constitutive update. The raw `elongation` and the applied `elongationTolerance` remain explicit
in the result, preventing a floating-point residual from spuriously activating a passive tendon
under a global rigid-body motion.

With one connector at each end, every `r_j = 1`, `L_eff = L0`, and this reduces to the standard
linear-elastic update. The same `T0 + EA (L-L0)/L0` relation, with cable force and direction updated
in the moved configuration, is used in the nonlinear kinematic formulation reported by
[Niero, Pagliarusco, and Zampieri](https://doi.org/10.1016/j.engstruct.2026.122451).

If either termination is `continuous-external`, the modeled path is only part of a larger tendon
system and cannot determine its compatibility. The current release therefore keeps `T = T0` and
reports `externally-force-controlled`. A fully anchored tendon reports `anchored-length-compatible`.
When `T_trial <= 0`, tangent stiffness is zero and the tendon is `slack`; a tendon with `T0 = 0` and
`T > 0` is `active-passive`.

Yield strength, tensile strength, and ultimate strain are explicit applicability or failure checks.
The elastic force is not capped at yield: `yielded` means the linear-elastic law has left its stated
range, not that an undocumented plastic law has been applied.

Path points inside a block follow its exact planar rigid transformation. A point exactly on an
internal joint uses the average position of its two transformed attachments, and its conjugate force
is split equally between the adjacent blocks. This idealizes a rigid device spanning the joint,
preserves symmetry, and exactly preserves virtual work, resultant force, and moment. It is not a
model of a device attached to only one face of an opening joint.

For a node whose adjacent cable segments are directed along increasing arch station, the force
transmitted by the tendon to the rigid device or contact is:

```text
F_i = T_i+ t_i+ - T_i- t_i-
```

For constant tension and deviation angle `Delta theta`:

```text
F_n = 2 T sin(Delta theta / 2)
```

The result returns left and right tension, force vector, inward-normal and tangential components,
resultant magnitude, and direction. Positive normal component points toward the arch interior.

### Intrados deviators

An intrados tendon would detach from the boundary between supports, so its path is imposed by
physical rigid deviators. They are equally spaced along the intrados, independent from the
voussoirs, with an odd count of at least three and one device at the crown. The tendon is a straight
segment between adjacent device points. Device stiffness, slip, and pull-out are excluded.

### Convex extrados contact

Positive tension on the current convex circular or elliptical extrados presses the tendon against
the arch. It is therefore represented by numerical unilateral-contact samples, not by physical
deviator objects. Refinement gives:

```text
q_n = T kappa
```

and `q_n = T / R` on a circle. In a moved configuration, the active samples are the ordered upper
convex envelope between mandatory terminal connectors. An intermediate sample removed from that
taut-cable envelope is returned as `separated` with zero contact force. Reversed station order or a
degenerate segment remains an explicit failure; the solver never supplies adhesive contact.

### Terminal conditions and connector groups

Each end independently selects one of two conditions:

- `continuous-external`: tension continues beyond the model. No terminal capacity is checked. The
  force transmitted to the omitted external system is returned as a boundary action;
- `distributed-anchorage`: tension is transferred to the arch by a rigid connector group with its
  own count and constant spacing. The group is independent from the global deviator count.

For distributed anchorage, default equal load shares make the segment tension increase from zero to
`T` at the left end and decrease from `T` to zero at the right end. Optional positive explicit
weights must sum to one. Computing every connector force from the actual adjacent tensions and
directions preserves the complete force and moment system; two fully anchored ends have zero
external boundary traction.

Assigned capacities may include normal, shear, and resultant resistance with independent, linear, or
elliptical component interaction. The library returns demand, capacity, utilization, and status. It
does not derive ETA/EAD or product-specific resistance.

### Bonded passive layers

FRCM, FRP, and equivalent SFRM layers bonded to masonry use `bondedLayers`, not
`ArchReinforcementInput`. A bonded layer modifies the local section resistance domain, while a
curved tendon remains a separate structural element whose direction changes create device or contact
forces. The model keeps both result families distinct.

Each layer is a zero-thickness tension-only membrane at signed boundary coordinate `z`, positive
toward the extrados. With masonry resultants `N_m, M_m` and tensile layer force `T`:

```text
0 <= T <= T_Rd
N = N_m - T
M = M_m - T z
```

The static strengthened domain is the exact Minkowski sum of the masonry domain and that membrane
segment. It therefore preserves the unreinforced bending direction and enlarges only the direction
mobilizing the selected boundary. The layer capacity is the minimum of every assigned limit:

```text
T_Rd = min(A f_t, E A epsilon_debond, E A epsilon_u)
```

At least one limit is required. The governing limit, local development factor, force, capacity,
utilization, and state are returned. An anchored end has full capacity at the modeled end; an
unanchored end uses a user-assigned development length and a transparent linear capacity ramp.
Static equilibrium returns the minimum layer force required by the representative admissible state,
not a unique elastic force.

In `deformable-no-tension` analysis, `transferLength` is required. The local layer strain is the
positive opening of the reinforced boundary divided by that length; compression makes the layer
slack. The local end-development factor scales both elastic stiffness and `T_Rd`; the resulting
tension is assembled without adding mechanical degrees of freedom. This is a regularized compatible
membrane law, not a calibrated product bond-slip law.

An SFRM entry is an equivalent tensile membrane area. Compression and bending of a finite-thickness
overlay, substrate/coating delamination propagation, cyclic bond degradation, and product-specific
anchorage resistance are outside the implemented model.

## Deformable interfaces and nonlinear equilibrium

The nonlinear model retains three finite planar degrees of freedom at every rigid voussoir:

```text
q_b = [u_x, u_y, theta]
```

At each global joint, the two initially coincident material-point lines are transformed exactly by
their respective blocks. Their separation is projected onto a frame rotated by the mean
adjacent-block rotation. Springing-contact frames remain fixed to the rigid boundary. Because a
straight interface remains straight under each rigid transformation, its normal gap and the
corresponding virtual-displacement operator are affine in the joint coordinate `z`:

```text
g(z)   = g_0 + g_1 z
B_g(z) = B_0 + B_1 z
```

Normal gap `g` is positive in opening; tangential slip is `s`. With explicitly assigned
regularization lengths `l_n` and `l_t`:

```text
k_n = E_n / l_n
K_t = (G_t / l_t) A

sigma = max(0, -k_n g)
sigma = min(sigma, f_c)                    when f_c is assigned

s_bar   = s(0)
V_trial = -K_t (s_bar - s_p)
V_cap   = c A + mu N
V       = clamp(V_trial, -V_cap, V_cap)
```

The default `stop-at-onset` normal law is integrated analytically between its zero-pressure and
optional crushing-front coordinates:

```text
N   = b integral sigma(z) dz
M   = b integral z sigma(z) dz
Q_n = b integral sigma(z) [B_0 + B_1 z] dz
```

Therefore, in the default mode, `N`, `M`, compressed length, maximum compression, and the interface
tangent are independent of `integrationPointCount`; the samples are output diagnostics only.

With `postCrushingBehavior: "perfectly-plastic"`, the same points become constitutive history
locations. Each stores irreversible plastic closure at the compression plateau and unloads
elastically. Plastic closure is committed only after a converged increment, so a failed trial or
cutback cannot change the material state. This option has mesh-dependent material localization and
requires an integration-point convergence study; it supplies no compressive softening or fracture
energy.

Coulomb plasticity has one scalar `s_p` for the complete joint, exactly matching
`|V| <= c A + mu N`; applying it independently to edge samples would spuriously force sliding
wherever normal pressure tends to zero. The reported uniform sample shear stress `V / A` is a
visualization diagnostic, not an independent local yield check. The implemented plastic potential
has zero dilation: tangential plastic slip does not create normal opening. A nonzero dilation angle
is rejected by the nonlinear evaluator, although it remains available in the static limit-analysis
comparison model.

The virtual-work integration preserves force and moment equilibrium under a finite common rigid-body
motion. The tangent is obtained by centered differentiation of the analytically integrated objective
generalized forces; tangent evaluations do not allocate output samples. At the nonsmooth
`N = V = 0`, `c = 0` Coulomb vertex, the solver selects the full closed normal branch and a
closed-stick generalized derivative only for the tangent predictor. It adds no physical cohesion,
tension, or traction and is reported as `coincidentClosedStickPredictor`.

The complete current-configuration residual is:

```text
R(q, lambda) = Q_interfaces(q, state)
             + Q_reinforcement(q)
             + Q_fixed(q)
             + lambda Q_scalable(q)
```

Combination factors are applied before this partition. Dead-load force directions remain global;
self-weight follows the current centroid and quadrature or point-load application locations follow
their block material points. The reinforcement path, force, device directions, and anchor demands
are updated at every equilibrium evaluation. A fully internal anchored tendon is compatible; a
continuous-external tendon remains force controlled as documented above.

Fixed actions and initial reinforcement effects are first established by proportional continuation.
Every converged step commits one generalized plastic slip per interface. A failed Newton iteration
or load-step trial reuses the previous committed states; it cannot silently commit a failed
configuration.

For a zero-cohesion model, the first fixed-load equilibrium uses a deterministic numerical
continuation through auxiliary cohesion offsets:

```text
c_aux,0 = 0.01 F_scale / A_min
c_aux / c_aux,0 = 1, 0.1, 0.01, 0
```

The auxiliary stages supply only configuration seeds: their plastic states are not committed. The
last stage is re-solved with exactly the user-assigned physical cohesion, including `c = 0`.
`contactInitialization: "none"` disables this continuation. `convergenceInfo` returns whether it was
used, its initial stress offset, and the number of completed stages, so this numerical device is
never hidden from the caller.

Load control uses Newton iteration, normalized residuals, backtracking, adaptive step growth, and
automatic cutback. Displacement control uses a load-equilibrium seed for the first point, a secant
path predictor thereafter, and the augmented equations:

```text
[ K_t   Q_scalable ] [ Delta q      ] = -[ R ]
[ c^T       0      ] [ Delta lambda ]    [ g ]
```

where `g` is the signed control-coordinate gap.

Spherical arc-length control instead constrains the scaled increment from the previous converged
point:

```text
mean((Delta q_j / q_scale,j)^2) + (alpha Delta lambda)^2 = Delta s^2
```

Translations are scaled by the characteristic arch length, rotations are dimensionless, and
`loadScale = alpha` controls the relative load coordinate. The tangent predictor follows the
previous secant orientation; the bordered Newton system solves equilibrium and the quadratic path
constraint together. Radius growth, cutback, termination path length, and every accepted residual
are returned. Arc length can follow a limit point, but it does not create a post-peak material law.

The masonry and follower-load tangent has scalar semi-bandwidth five because each joint connects
only two consecutive three-DOF blocks. In `linearSolver: "automatic"` mode it is stored in compact
band form and solved by non-symmetric Gaussian elimination with pivoting restricted to the lower
band. Displacement control reuses one band factorization for the equilibrium and load columns and
eliminates the border by a scalar Schur complement. Bonded layers preserve this local band
structure. An active curved tendon produces global coupling, so the solver explicitly materializes
and solves the dense tangent. `linearSolver: "dense"` is available as a deterministic reference
backend; regression tests require the dense and compact solutions to agree. The selected backend is
reported in `convergenceInfo.linearSolver`.

A bounded non-monotone line-search acceptance is counted explicitly when an active-set transition
prevents immediate residual decrease. The test suite includes an 80-voussoir zero-cohesion path on
the compact backend. The warning above 80 voussoirs now applies only when global reinforcement has
actually selected dense storage.

Results contain full final fiber/interface and reinforcement states, every converged block
configuration, `lambda-u` and reinforcement-force/displacement curves, residual histories, cutbacks,
line-search diagnostics, and an optional load-factor bracket at loss of load control.

## Representative equilibrium and thrust line

Rigid no-tension equilibrium generally admits more than one thrust line. The solver does not label
one arbitrary solution as the physical elastic state.

All interface resultants are affine functions of the three left springing reaction components. The
solver forms the complete selected polyhedral interface domain and maximizes the minimum normalized
margin after force and moment scaling. The deterministic simplex uses seven non-negative primary
variables regardless of the number of voussoirs. Symmetric geometry and loading are explicitly
projected onto the symmetric admissible solution only when the interface laws are also mirrored.

The result declares:

```text
solutionMeaning: "representative-statically-admissible"
```

At every interface, the thrust point is:

```text
p_thrust = p_mid + e j
```

where `j` is the intrados-to-extrados joint axis. This is the masonry compression resultant only;
reinforcement tension, device forces, and extrados contact forces are separate result fields.

## Static limit analysis

For fixed block wrenches `F_f` and unit-multiplier scalable block wrenches `F_s`, every interface
resultant is affine in the three left springing reaction components and in `lambda`. The solver
maximizes:

```text
maximize lambda
subject to equilibrium
           N_i >= 0
           -N_i h_i / 2 <= M_i <= N_i h_i / 2
           |V_i| <= c_i A_i + mu_i N_i              when friction is enabled
           (N_i, M_i) inside the safe compression polygon when fc is finite
           (N_i, M_i) inside the bonded-layer Minkowski-sum domain when layers are present
           lambda >= 0
```

Combination coefficients are already embedded in `F_f` and `F_s`. The implementation first finds a
Heyman-admissible reaction for the fixed state. Reaction increments are represented by positive and
negative parts, leaving seven primary non-negative variables: six for the three free reaction
increments and one for `lambda`. The number of primary variables is independent of the number of
voussoirs; interfaces add only inequality rows.

The deterministic internal primal simplex uses explicit force, moment, and row scaling. It has no
runtime dependency and does not expose a general-purpose LP API. A fixed state that is already
inadmissible returns `lambdaCritical: 0` and `fixed-load-infeasible`. A genuinely unbounded problem
returns `lambdaCritical: null` and `no-collapse-within-model`.

### Active hinges and kinematic verification

An active moment boundary with positive compression is a candidate intrados or extrados hinge. The
solver does not assume four hinges in advance. Non-active interfaces join adjacent voussoirs into
rigid macro-blocks; active interfaces impose equality of velocity at their hinge point. Active
springing interfaces impose zero hinge-point velocity against the rigid boundary.

The reduced kinematic constraint matrix is rank-checked. A mechanism is reported only when it has a
non-zero rigid-block velocity field, satisfies all hinge and support constraints, and fulfils:

```text
W_fixed + lambdaCritical W_scalable = 0
```

within the declared tolerance. The result exposes a centroid translation and rotation for every
voussoir so a consumer can render the mechanism. An active zero-compression interface is reported as
an instability warning because hinge-only kinematics is insufficient to describe complete contact
loss.

### Sequential non-associated sliding solution

A one-step Coulomb LP provides a maximum statically admissible multiplier, but its dual mechanism
would be associated and would generally impose dilation. Zero-dilation collapse therefore uses the
sequential LP construction described by
[Gilbert, Casapulla, and Ahmed](https://doi.org/10.1016/j.compstruc.2006.02.005) and restated by
[Hua and Milani](https://doi.org/10.1016/j.compstruc.2023.106987).

At iteration `k`, the sliding slope is reduced toward the target dilation slope:

```text
mu_k = tan(psi) + xi_k (mu - tan(psi))
xi_(k+1) = max(xi_k / 2, 0.001)
```

The temporary cohesion is shifted using the previous normal resultant so the modified line retains
the original Coulomb capacity at that stress point:

```text
c_k A = c A + (mu - mu_k) N_(k-1)
```

LPs are repeated until `xi = 0.001` and the relative multiplier change satisfies
`nonAssociatedTolerance`. The result exposes iteration count, final reduction factor, multiplier
change, and convergence. Non-convergence is never relabelled as a physical collapse result.

For a zero-dilation active sliding joint, the rigid-block kinematics enforces zero relative normal
velocity and permits relative tangential slip opposite to the stored shear resultant. Rocking joints
simultaneously enforce contact at their active edge and opening, not penetration, at the opposite
edge. A mechanism is verified only for a one-dimensional compatible active set. The virtual-work
check becomes:

```text
W_fixed + lambdaCritical W_scalable
  = sum_i |V_i deltaDot_t,i|
```

The right-hand side is reported as `internalDissipation`. Higher-dimensional or incompatible active
sets remain `maximum-static-admissibility` results and are not presented as verified sliding.

Finite-compression activation in static limit analysis similarly returns
`maximum-static-admissibility` and status `not-verified`, because the LP active set does not infer a
crushing velocity mechanism. The separate deformable solver may continue with the explicit perfectly
plastic compression law, but that path does not retroactively verify the LP kinematics.

## Equilibrium diagnostics

Both physical and normalized residuals are returned:

```text
sum Fx
sum Fy
sum M about the global origin
```

Force residuals are scaled by a characteristic applied-force value. Moment residual is additionally
scaled by a characteristic arch length. A state result is successful only if a reaction inside every
selected interface domain exists and all normalized global residuals satisfy the declared tolerance.
A collapse result additionally distinguishes `kinematically-verified-collapse` from
`maximum-static-admissibility`.

When the best relaxed state lies outside the admissible thickness, the result is `failed`, retains
the numerical state for diagnosis, reports a negative representative margin, and marks affected
interfaces as `outside-admissible-thickness`.

## Validation evidence

The versioned Milestone 1 through 8 tests cover:

- circular and elliptical endpoint, crown, and springing-angle reconstruction;
- intrados, centerline, and extrados reference geometry;
- even ordinary discretization and odd custom-keystone enforcement;
- 20/40/80/160 circular polygon-area convergence;
- horizontal-projection versus arc-length load resultants;
- analytical fill-weight integration on a semicircle;
- patch and point force/moment conservation;
- consumption of existing NTC load-combination factors;
- symmetric reactions and thrust line under self-weight;
- global force and moment residuals;
- explicit failure for a geometrically insufficient thin arch;
- fixed/scalable load-case selection after combination factors;
- the expected multiplier rescaling under different fixed and scalable safety factors;
- active intrados/extrados hinges and a one-degree-of-freedom rigid-block mechanism;
- virtual-work equilibrium at the critical multiplier;
- admissibility immediately below and inadmissibility immediately above the computed limit;
- 20/40/80/160 collapse-multiplier convergence;
- explicit scale-invariant unbounded and fixed-load-infeasible outcomes.
- Coulomb input normalization, support-interface overrides, and dilation-angle validation;
- per-interface friction demand, capacity, utilization, and equilibrium under assigned loads;
- transition from a four-hinge mechanism to a mixed sliding-rocking mechanism as `mu` decreases;
- zero normal sliding rate, correct slip direction, positive frictional dissipation, and virtual
  work;
- sequential non-associated convergence diagnostics;
- finite-compression state recovery and a governing `masonry-crushing` static limit;
- monotone finite-compression multiplier convergence for 8, 16, and 24 chord facets.
- intrados deviator validation, equal boundary-arc spacing, and a crown device independent from the
  masonry discretization;
- the exact discrete identity `2 T sin(Delta theta / 2)`;
- extrados contact refinement toward `q_n = T kappa`;
- equilibrium including continuous-external tendon boundary tractions;
- progressive distributed terminal transfer and exact self-equilibrium with two anchored ends;
- assigned device capacity and explicit failed utilization;
- assigned post-tensioning in the masonry equilibrium while retaining separate result fields;
- zero `initialForce` remaining slack and action-free in the reference geometry;
- passive activation under prescribed elongation and the exact `EA Delta L / L_eff` force;
- distributed transfer-zone compliance through segment tension ratios;
- passive shortening and complete unloading of an initially post-tensioned tendon to slack;
- explicit force control when the tendon continues outside the model;
- updated path directions and exact force/moment equilibrium in a moved configuration;
- yield, tensile-strength, and ultimate-strain state transitions without hidden plastic capping;
- work-conjugate two-block interpolation for a crown device located exactly on a joint.
- explicit deformable-interface input and rejection of hidden or zero characteristic lengths;
- uniform normal closure against the assigned interface modulus and the independent tangent value;
- zero-dilation Coulomb return mapping without artificial normal opening;
- exact partial-contact and finite-compression-front integration, sampling-count independence, and
  nonlinear `masonry-crushing` termination;
- irreversible perfectly plastic crushing closure with elastic unloading and commit/revert history;
- finite rigid-body objectivity and generalized force/moment self-equilibrium;
- symmetric adaptive load-controlled response and equilibrium at every committed increment;
- displacement-control agreement with an independently followed load-controlled stable branch;
- spherical arc-length equilibrium, adaptive radius, and normalized path-constraint residuals;
- passive-tendon activation from a deformation determined by coupled equilibrium;
- explicit millimetre-to-metre conversion of displacement-control inputs;
- routing of geometrically nonlinear collapse requests to the incremental solver;
- zero-cohesion auxiliary continuation followed by an exactly zero-offset physical solution with 80
  voussoirs;
- compact non-symmetric banded LU agreement with the forced dense nonlinear solution and reusable
  factorization of the displacement-control border;
- dense fallback when compatible curved reinforcement introduces global tangent coupling;
- nonlinear extrados unilateral-contact active-set solution and release of separated samples;
- exact D'Ambrisi infinite-compression strengthened-section boundary, asymmetric finite-compression
  bonded domain, and explicit unanchored-end development ramp;
- compatible passive bonded-layer activation while retaining the compact banded tangent;
- cross-model summaries for Heyman, finite-compression, reinforced, refined-discretization, and
  geometrically nonlinear cases;
- rejection of quantitative ratios when normalized physical geometry or loading differs;
- exact reproduction of the D'Ambrisi et al. rectangular no-tension finite-compression domain at
  zero force, peak moment, an intermediate force, and full compression capacity;

### Published point-load benchmark

The ideal no-slip point-load example in Stockdale et al.,
[Kinematic collapse load calculator: Circular arches](https://doi.org/10.1016/j.softx.2018.05.006),
is included as a versioned mechanical benchmark. Its inputs are a 27-block semicircular arch with
intrados radius `1.806 m`, thickness/radius `0.1661`, out-of-plane depth `0.250 m`, density
`1530 kg/m3`, and a vertical point load at the eighth joint from the left springing.

Using `g = 9.81 m/s2`, the present solver obtains `2.74660 kN`. The publication reports `2.751 kN`
from KCLC and `2.756 kN` from an independent virtual-powers construction. The differences are
`-0.16%` and `-0.34%`, respectively. The active interface indices are `3, 8, 20, 27`, including the
loaded eighth joint. The tolerance explicitly includes the present straight-sided polygonal
voussoirs versus the source circular-sector geometry and numerical reconstruction of the published
inputs.

These tests provide bounded software-level evidence, one published complete-arch mechanics
benchmark, and published exact interface-domain benchmarks. They do not validate the broader
geometry, loading, material, or reinforcement scope. The declared implementation is `implemented`,
but application validation remains `not-validated` and `normativeConformityClaimed: false` until
additional independent benchmarks are completed.

### Literature benchmark register

Milestone 8 reviewed the two supplied primary papers and records their evidence at the narrowest
reproducible scope. Status applies to the benchmark, not to the paper as a whole.

| Source and target                                                                                                                | Status        | Current evidence or blocking capability                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stockdale et al. 2018, 27-block ideal circular arch, `2.751 kN`                                                                  | `implemented` | Reproduced within the declared polygonal-geometry tolerance above.                                                                                                                                                                                                          |
| [D'Ambrisi et al. 2015](https://doi.org/10.1016/j.compositesb.2015.01.024), Eq. (6) unreinforced finite-compression `M-N` domain | `implemented` | Exact numerical regression uses the reported `B = 2.75 m`, `t = 0.60 m`, and `fd = 4.74 MPa`.                                                                                                                                                                               |
| D'Ambrisi et al. 2015, strengthened section domain                                                                               | `implemented` | The asymmetric infinite-compression expression is reproduced exactly; finite compression uses the same membrane translation with a convergent safe polygon. Anchored and linearly developed unanchored ends are executable.                                                 |
| D'Ambrisi et al. 2015, three-span bridge collapse multipliers                                                                    | `planned`     | Requires a multi-span system and complete transcription of bridge geometry, loading, and strengthening layout. The published multiplier table is not claimed as reproduced.                                                                                                 |
| [Zampieri et al. 2020](https://doi.org/10.1016/j.engstruct.2020.111135), lower-bound block/interface formulation                 | `partial`     | The implemented static kernel has the same `A q - lambda f_v = f` equilibrium structure, finite compression, Coulomb friction, and sequential zero-dilatancy treatment. This is formulation consistency, not reproduction of the paper's strengthened-arch examples.        |
| Zampieri et al. 2020, laboratory SFRM arch predictions `0.32 kN` unstrengthened and `12.90 kN` strengthened                      | `planned`     | The equivalent tensile-membrane domain now exists. Exact experimental geometry, SFRM parameter reduction, and boundary-fixture transcription must still be versioned before the published values can become an oracle.                                                      |
| Zampieri et al. 2020, Prestwood Bridge prediction `220 kN` versus `228 kN` test                                                  | `planned`     | Requires passive backfill resistance and the paper's bridge-level load-distribution assumptions; prescribed vertical fill weight alone is not equivalent.                                                                                                                   |
| [Niero, Pagliarusco, and Zampieri 2026](https://doi.org/10.1016/j.engstruct.2026.122451), moved post-tensioned arch formulation  | `partial`     | The exact `T = T0 + EA(l-l0)/l0` update, moved force directions, anchor resultants, finite compression, and non-monotone path-following ingredients are executable. The paper's haunchings and manually switched measured mechanisms are not represented as a blind oracle. |

The Zampieri friction thresholds and the D'Ambrisi anchored-versus-unanchored observations are
useful future acceptance targets. They are not substituted for executable fixtures, and no value
from the tables is entered as a pass/fail oracle until all governing inputs can be represented
without hidden assumptions.

Niero et al. report an `85.05 kN` experimental peak and construct their comparison curve by manually
merging three mechanisms identified from experimental displacements, then terminate the curves at
that measured peak. That is valuable validation evidence for updated tendon magnitude and direction,
but it is not an independently generated post-peak branch that can validate automatic arc-length
continuation. The present tests therefore validate the numerical arc-length constraint and
equilibrium path without claiming reproduction of that experiment.

## Declared limitations

- two-dimensional in-plane model only;
- no out-of-plane behavior or barrel load distribution;
- idealized circular or symmetric elliptical simplified geometry in the current builder;
- rigid blocks with straight polygon edges between discretization stations;
- rigid springing boundaries and no settlements;
- ideal-interface Coulomb sliding is rigid-plastic; the separate nonlinear interface implements
  deformable stick and zero-dilation perfect-plastic slip, but not cohesion degradation or cyclic
  calibration;
- finite compression uses a faceted rigid-plastic resultant domain and requires a facet-convergence
  study;
- nonlinear finite compression stops at first crushing by default; optional irreversible perfectly
  plastic closure permits continuation and elastic unloading, but compressive softening, fracture
  energy, and a calibrated post-crushing masonry law are unavailable;
- passive activation is coupled for fully anchored intrados reinforcement; prescribed-configuration
  evaluation remains available as a separate constitutive diagnostic;
- intrados deviators and terminal connectors are rigid; device stiffness, slip, pull-out, bond
  stress, and progressive failure are excluded;
- convex extrados contact uses a sampled taut-cable active set; it does not introduce independent
  cable/contact degrees of freedom or a general complementarity solver for arbitrary non-convex
  paths;
- bonded FRCM/FRP/SFRM is a zero-thickness tension-only equivalent membrane; finite overlay
  thickness, overlay compression/bending, progressive delamination, calibrated bond-slip, and cyclic
  degradation are excluded;
- overlapping bonded layers are supported on one boundary per interface; simultaneous intrados and
  extrados layers at the same interface are rejected by the current eliminated domain;
- static bonded-layer forces are minimum-required admissibility resultants, not unique compatible
  elastic forces; deformable analysis requires an explicit transfer length;
- static Coulomb capacity with bonded layers conservatively uses the total section normal resultant,
  rather than the larger recovered masonry-only compression resultant;
- verified frictional mechanisms currently require a one-degree-of-freedom zero-dilation active set;
- nonlinear Coulomb flow currently requires zero dilation;
- the nonlinear backend uses a compact non-symmetric banded tangent for local interface coupling and
  falls back to dense LU when a compatible curved reinforcement creates global coupling; a dedicated
  banded-plus-low-rank reinforcement update is not implemented;
- load, displacement, and spherical arc-length controls are implemented; automatic arc-length
  continuation has not yet been quantitatively validated against a published blind masonry-arch
  post-peak benchmark;
- no continuum masonry FEM;
- device capacities are assigned by the user; no product-specific anchor resistance is derived;
- no legal, regulatory, or professional conformity claim.
