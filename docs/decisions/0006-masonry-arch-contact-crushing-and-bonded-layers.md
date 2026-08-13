> Classification: PUBLIC-SAFE | Decision status: accepted | Implementation status: implemented

# Decision 0006 — Extrados contact, crushing continuation, and bonded layers

## Problem

The initial nonlinear release stops at first crushing and rejects a moved extrados tendon because
prescribing every original contact sample can create tensile contact forces. The static resistance
domain also contains masonry only, so it cannot represent passive FRCM, FRP, or SFRM layers bonded
to one arch boundary.

These are mechanical choices. They cannot be hidden behind solver tolerances or inferred material
defaults.

## Extrados tendon contact

### Alternatives

1. Keep every sampled point constrained to the tendon. This is simple but transmits adhesion when a
   moved arch loses local convexity.
2. Add independent cable and contact degrees of freedom with complementarity constraints. This is
   the most general formulation, but it substantially expands the present rigid-block solver.
3. Use the taut-cable envelope of the moved boundary samples. Released samples carry no force and
   adjacent active samples are connected by a straight tendon segment.

### Decision

Use alternative 3 for convex two-dimensional extrados paths. In each interval bounded by mandatory
terminal connectors, the active points are the ordered upper convex envelope of the moved extrados
samples. A removed sample is reported as `separated` and carries zero contact action. Mandatory
connectors remain on the path. A reversed or degenerate station order terminates with an explicit
diagnostic; the solver does not invent adhesion or an out-of-plane cable route.

The active set is evaluated in every trial configuration. Because an active-set change is
non-smooth, the nonlinear line search and step cutback remain authoritative. Contact sampling is a
numerical discretization and must be refined in validation.

## Continuation after masonry crushing

### Alternatives

1. Stop at first attainment of the compression strength.
2. Clip the compression envelope without history. This can follow monotonic loading but gives
   incorrect unloading after permanent crushing.
3. Store an irreversible plastic closure at normal integration points and use elastic unloading from
   the perfectly plastic compression plateau.
4. Add compressive softening and fracture-energy regularization.

### Decision

Keep alternative 1 as the default and add alternative 3 as an explicit constitutive option. Normal
integration points are history variables, not additional mechanical degrees of freedom. The joint
still has only the relative motion of the adjacent rigid blocks. The plastic closure is committed
only after a converged increment; failed Newton trials and cutbacks revert it.

Perfect plasticity has no post-peak material softening. It can expose a structural limit point, but
it must not be described as a calibrated masonry crushing curve. Alternative 4 remains outside the
current scope because it needs material-specific energy data and an independent validation campaign.

## Bonded passive reinforcement

### Alternatives

1. A closed-form one-layer formula for each product family.
2. A strain-compatible continuous composite section with masonry and reinforcement stress–strain
   diagrams.
3. A zero-thickness, tension-only membrane resultant added to the masonry interface domain.
4. A user-supplied arbitrary resultant domain.

### Decision

Use alternative 3 as the first general bonded-layer model. It is transparent, solver-neutral, and
matches the block/interface lower-bound architecture. For a layer force `T` at signed coordinate `z`
measured toward the extrados,

```text
0 <= T <= T_Rd
N = N_m - T
M = M_m - T z
```

The strengthened domain is the Minkowski sum of the masonry domain and this bounded membrane-force
segment. The construction supports several overlapping layers and keeps the strengthened and
unstrengthened bending directions distinct. For an intrados layer (`z = -t/2`) and unbounded masonry
compression, its positive-moment boundary is

```text
M_Rd = N t / 2 + T_Rd t
```

which is the infinite-compression expression reported by D'Ambrisi et al. for an intrados FRCM
layer. With finite masonry compression, the same resultant construction shifts the finite
compression domain without changing its masonry law.

`T_Rd` is the minimum of the user-assigned tensile-strength, debonding-strain, and ultimate-strain
limits after unit conversion. No undocumented material-family coefficient is selected. Unanchored
ends use an explicit linear development ramp over a user-supplied development length; anchored ends
retain full capacity to the modeled layer end.

FRCM, FRP, and SFRM share this membrane mechanics. An SFRM input therefore represents an equivalent
tensile membrane area and does not include the compression or bending resistance of a finite-thick
overlay. A continuous finite-thickness SFRM section belongs to alternative 2 and remains outside
this decision.

For deformable-interface analysis, the same layer bridges the joint at its boundary coordinate. Its
elastic tension is based on the positive local opening divided by an explicit transfer length,
capped by `T_Rd`. This local regularization is required for a unique passive response and is not a
product-specific bond–slip law.

## Path control

Adaptive load control and single-degree-of-freedom displacement control remain primary algorithms.
Add spherical arc-length control using scaled block translations, rotations, and load multiplier.
The load/displacement scaling, radius adaptation, cutbacks, and path-constraint residual are public
diagnostics. Arc length is not a substitute for a constitutive post-peak law: validation keeps
solver path-following and material assumptions separate.

Decision 0007 additionally makes the engineering objective explicit. Load, displacement, and
arc-length remain continuation controls; none of them independently defines a design-state,
capacity, or advanced-path analysis.

## Consequences

- Bonded layers and curved tendons remain different public entities.
- Masonry compression resultants, bonded-layer forces, and curved-tendon forces remain separate in
  result DTOs.
- A rigid-plastic current state can report layer capacity activation and utilization, but not a
  unique elastic layer force unless deformable compatibility is used.
- Static and nonlinear results must expose local development factors, governing capacity limits,
  contact release, material-state commit/revert, and convergence diagnostics.
- No runtime dependency or dense section discretization is introduced by the static layer domain.
