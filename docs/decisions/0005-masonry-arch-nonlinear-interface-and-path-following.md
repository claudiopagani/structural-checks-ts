> Classification: PUBLIC-SAFE | Decision status: accepted | Implementation status: implemented

# Decision 0005 — Masonry-arch nonlinear interface and path-following formulation

## Decision gate

Milestone 6 evaluates a tension-only reinforcement on a prescribed finite rigid-block configuration.
Milestone 7 must instead determine that configuration from equilibrium and compatibility. This is a
constitutive decision, not only a choice of nonlinear equation solver.

An ideal Heyman model has rigid blocks, no tensile strength, infinite compressive strength, and no
elastic interface compliance. Below collapse it determines statically admissible resultants but not
a unique deformation field. At collapse it determines one or more mechanisms, but not the
pre-collapse elongation needed to activate a passive tendon. A coupled passive-reinforcement
analysis therefore cannot obtain a unique load-deformation path from the ideal rigid-plastic model
alone.

The definitive Milestone 7 implementation is blocked until the maintainer accepts either an explicit
deformable-interface regularization or the narrower interpretation that passive tendons activate
only along an extracted collapse mechanism.

## Alternatives

### A. Deformable zero-thickness interfaces between rigid blocks — recommended

Each block retains three finite planar rigid-body degrees of freedom. Every masonry joint and
springing contact receives explicit normal and tangential constitutive parameters. The normal law is
integrated across the joint depth so that partial contact, opening, closure, rocking, and finite
compression are recovered from the contact stress distribution. The tangential law uses an elastic
stick branch followed by Coulomb plasticity with the already accepted non-associated flow rule.

Advantages:

- gives a unique pre-collapse deformation and therefore a compatible passive-tendon elongation;
- keeps the requested `rigid blocks + interfaces + tension-only reinforcement` architecture;
- supports opening, closure, sliding, mixed mechanisms, crushing, and updated reinforcement geometry
  in one equilibrium problem;
- can reuse the repository's masonry-fiber state pattern, dense linear solver, and generic
  displacement-control concepts;
- exposes interface work and residuals directly for verification.

Disadvantages:

- requires calibrated stiffness and characteristic-length inputs that do not exist in ideal Heyman
  analysis;
- the predicted displacement and passive-tendon force depend on those parameters and on joint
  discretization;
- active contact, softening, and non-associated flow require a robust state commit/revert scheme,
  line search, and step cutback;
- a compatible curved tendon introduces low-rank global coupling, while non-associated sliding makes
  the tangent non-symmetric. The existing banded Cholesky solver is therefore not directly
  applicable.

### B. Pure rigid-plastic complementarity

Keep infinite contact stiffness and solve equilibrium, unilateral contact, Coulomb yield, and
plastic flow as a complementarity or mathematical-programming problem.

Advantages:

- retains ideal limit-analysis assumptions and avoids artificial elastic stiffness;
- is appropriate for collapse multipliers and mechanism extraction.

Disadvantages:

- does not define pre-collapse displacement or passive-tendon activation;
- rigid-plastic response may be non-unique and jumps directly to mechanisms;
- would require a new complementarity backend or a substantial extension of the sequential linear
  programs;
- cannot provide a material load-displacement curve without an additional regularization.

### C. Reduced hinge-mechanism continuation

Extract a collapse mechanism from the current static limit analysis and continue only its active
hinge coordinates while updating the tendon.

Advantages:

- small, transparent system with direct virtual-work checks;
- efficient for a known rocking mechanism.

Disadvantages:

- begins at collapse and does not predict the service-to-collapse deformation path;
- assumes an active set that can change under reinforcement;
- does not generalize cleanly to sliding, crushing, contact closure, or extrados contact changes.

### D. Dynamic relaxation or discrete-element pseudo-time integration

Introduce interface springs, mass, and damping and approach quasi-static equilibrium through a
transient calculation.

Advantages:

- naturally handles contact-status changes and severe mechanisms;
- avoids a singular Newton tangent in some post-peak regimes.

Disadvantages:

- adds artificial mass, damping, time-step, and kinetic-energy tolerances;
- is more expensive and makes deterministic quasi-static interpretation harder;
- is unnecessary before a static incremental formulation has been tested.

## Decision

Adopt alternative A as a new, explicit interface family. Do not reinterpret the ideal Heyman
interface as deformable and do not assign hidden default stiffness. The linear state and static
collapse solvers remain available and unchanged for the ideal models.

The first nonlinear interface law should be deliberately small:

```ts
{
  type: "deformable-no-tension",
  normal: {
    elasticModulus,
    characteristicLength,
    compressionStrength?,
    // Resultants are exact; this controls returned stress/gap samples.
    integrationPointCount
  },
  tangential: {
    shearModulus,
    characteristicLength,
    frictionCoefficient,
    cohesion: 0,
    dilationAngle: 0
  }
}
```

The characteristic lengths are explicit regularization/calibration parameters. The software may
offer a separately named geometry-derived helper later, but the solver must not silently infer them.
Stress and strain histories must be returned at the normal sampling points. Cohesion and nonzero
dilation retain the existing explicit opt-in semantics.

For a straight zero-thickness interface between planar rigid blocks, the finite-motion gap and its
virtual-displacement operator are affine along the joint. The accepted implementation refinement is
therefore to integrate the clipped linear normal stress exactly at its opening and crushing fronts.
`integrationPointCount` affects only output sampling, not force, moment, compressed length, or the
tangent in the default stop-at-onset law. Decision 0006 adds an explicit perfectly plastic crushing
option in which the same points carry irreversible normal history. The tangential constitutive state
remains one scalar plastic slip for the global joint resultant; sampling points do not carry
independent tangential degrees of freedom or plastic states.

Use exact planar rigid-block kinematics and assemble current-configuration residuals and a
consistent tangent. Use load control with Newton iteration, residual scaling, backtracking line
search, and automatic step cutback while the path is stable. Add displacement control through the
existing augmented-equilibrium concept only after the load-controlled tangent and energy tests pass.
Add spherical arc-length control after displacement-control and path-constraint regressions pass;
keep its numerical validation distinct from material post-peak validation.

The nonlinear solve must use trial/commit/revert state. A failed increment reverts every masonry
interface and reinforcement state before retrying with a smaller step. A converged increment must
report force, moment, and normalized residuals before it is committed.

The first implementation may use the existing pivoted dense solver because non-associated contact
and the active tendon yield a generally non-symmetric, globally coupled tangent. After profiling,
the accepted lightweight optimization is compact general-band storage and pivoted non-symmetric LU
for the masonry-only tangent. The active tendon still selects the dense fallback until its low-rank
coupling is derived and verified. Displacement control eliminates its one-row/one-column border by a
scalar Schur complement when the banded backend is active. No numerical dependency is justified.

## Extrados contact boundary

An intrados path remains imposed by the explicit rigid deviators already in the model. For an
extrados tendon, prescribing all current boundary samples would incorrectly retain contact through
local loss of convexity or separation. The initial nonlinear extrados scope should therefore use a
contact active set:

- a contacting sample may transmit compression to the arch but no adhesion;
- a released sample is omitted and adjacent active points are joined by a straight tendon segment;
- contact status is updated only after convergence or during a controlled active-set restart;
- a contact reversal, cycling ambiguity, or unresolved multiple-contact state stops with an explicit
  diagnostic rather than forcing the original path.

Decision 0006 selects and implements the ordered taut-cable convex-envelope active set for this
boundary. Assigned-force reference-geometry extrados analysis remains available as the linear
alternative.

## Consequences for the public API

Decision 0007 subsequently separates the engineering `analysisObjective` from the continuation
`control`. The control alternatives below remain numerical strategies and no longer imply capacity
or advanced-path meaning by themselves.

- `geometricNonlinearity: true` requires a deformable interface family and must reject an ideal
  Heyman-only model for load-deformation analysis.
- Nonlinear options need load-step, minimum-step, residual, iteration, line-search, and control-DOF
  settings. Numerical tolerances remain separate from material stiffness.
- Results must distinguish `reference`, `trial`, and `committed` configurations and return
  `lambda-u`, `T-u`, interface opening/slip, contact states, energy, residual, and iteration
  histories.
- A result must identify `solutionMeaning: "incremental-deformable-interface-equilibrium"` and list
  all stiffness and regularization assumptions.
- The existing prescribed-configuration reinforcement operation remains a constitutive diagnostic;
  it is not replaced or relabelled as an equilibrium solve.

## Validation required before acceptance as implemented

1. Rigid-body objectivity and zero internal work under a global finite rigid motion.
2. Finite-difference verification of every interface and tendon tangent block.
3. One-joint normal compression, eccentric compression, opening, closure, elastic stick, Coulomb
   return mapping, and zero-dilation sliding tests.
4. Increment-by-increment global force and moment equilibrium and energy balance.
5. Small-load convergence to a symmetric response and convergence with normal integration-point
   refinement.
6. Passive-tendon activation from solved, rather than prescribed, deformation.
7. Agreement of the initial tangent with an independently assembled linearized system.
8. A limit point traversed by displacement control, with load control stopping explicitly at the
   expected loss of path stability.
9. Comparison with the moved-geometry tendon update and post-tensioned masonry-arch experiments
   reported by [Niero, Pagliarusco, and Zampieri](https://doi.org/10.1016/j.engstruct.2026.122451),
   within documented differences in joint and contact laws.

## Acceptance

The maintainer accepted this decision on 2026-08-11. The selected formulation and path-control
boundary are implemented. Application-wide validation remains deliberately narrower than the
software implementation status.

## Implemented initial subset

The accepted first implementation now provides:

- explicit normalized normal and tangential stiffness and characteristic-length inputs;
- exact planar block transformations and a corotational global-joint gap/slip frame;
- no-tension linear normal contact with optional first-crushing termination;
- exact analytic normal resultants for affine gap, no tension, partial contact, and optional finite
  compression, with sampling points retained only for explicit output;
- joint-resultant elastic-perfectly-plastic Coulomb slip with zero dilation and one committed scalar
  plastic slip per interface;
- an objective generalized-force residual and a centered numerical tangent of the analytic local
  resultants;
- a traction-free full closed-normal and closed-stick generalized derivative at the coincident
  Coulomb vertex;
- a reported auxiliary-cohesion homotopy for zero-cohesion fixed-load initialization, whose final
  stage has exactly zero auxiliary cohesion and alone supplies the committed state;
- proportional fixed-action initialization, adaptive load control, step cutback, and state revert;
- row/column-equilibrated augmented displacement control with load and secant predictors;
- current material-point dead-load moments and coupled intrados reinforcement compatibility;
- full configuration, interface, reinforcement, equilibrium, and curve histories;
- compact non-symmetric band assembly and pivoted LU for the masonry tangent, a Schur-complement
  displacement-control border, a forced-dense comparison option, and dense fallback for global
  reinforcement coupling;
- spherical arc-length continuation with adaptive radius and an explicit normalized path residual;
- unilateral moved-extrados tendon contact release through a taut-cable active set;
- optional irreversible perfectly plastic crushing closure with elastic unloading; and
- locally compatible passive bonded layers that preserve the banded tangent.

The centered local tangent remains a transparent derivative of exactly integrated resultants in the
default stop-at-crushing law. The perfectly plastic history option uses explicit integration points.
The global tangent is dense only when a curved tendon creates global coupling. Nonzero dilation
remains explicitly rejected. First crushing still terminates by default; selecting the perfectly
plastic option does not imply a calibrated softening law. Decision 0006 records these extensions.
