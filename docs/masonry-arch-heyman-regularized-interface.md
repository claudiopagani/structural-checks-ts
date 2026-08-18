# Regularized Heyman-type deformable interface model

Status: implemented | Scope: `domain/masonry/interfaces`, `domain/masonry/rigid-blocks`,
`applications/masonry-arches`

This document describes the regularized Heyman-type deformable interface model. It is the mechanical
capability a future OCFEM Standard mode can build on, while this repository keeps the solver-neutral
library boundary: the model lives entirely inside the existing masonry-arch pipelines, and no
OCFEM-specific code exists here.

## What the model is

The model simplifies the **resistance limits of the masonry**, not the kinematics, the elastic
regularization, or the reinforcement mechanics:

- **zero tensile capacity**: the normal law is `elastic-no-tension` with a tension cut-off;
- **unbounded compression strength**: `compressiveStrength` is omitted from the normal law, which
  already means "no finite compression limit" in the interface-law contract;
- **elastic unbounded tangential response**: `tau = Kt * delta_t` with `Kt = G / h`, a finite shear
  modulus and a finite characteristic length, and **no Coulomb sliding surface**: no friction
  coefficient, no cohesion, no dilation, no return mapping, no plastic slip, no tangential capacity,
  and no friction utilization;
- **finite E and G as interface regularization**: normal and tangential stiffnesses are explicit and
  finite;
- **finite rigid-block kinematics**: the same corotational rigid-voussoir formulation, arc-length
  continuation, branch turning, and exact lambda = 1 corrector used by every deformable model;
- **compatible active and passive reinforcement**: tendons, anchors, deviators, extrados contact,
  and bonded layers are unchanged and fully operative;
- **stresses remain response quantities, not resistance utilization**: `sigma_c` and `tau` are
  demands published per interface state; with no assigned masonry resistance limits the
  corresponding utilizations are `null`, never `0`, `1`, or an invented pseudo-capacity.

This is **not** the classical rigid-plastic Heyman model: elastic tangential deformation due to
finite G is not plastic sliding, and elastic interface deformability is retained on purpose.

## Public API

```ts
const law: MasonryDeformableInterfaceLawInput = {
  response: "deformable",
  normal: {
    type: "elastic-no-tension",
    elasticModulus: 1_000_000, // kPa
    characteristicLength: 0.5, // m
    integrationPointCount: 8,
    // compressiveStrength omitted: unbounded compression strength.
  },
  tangential: {
    type: "elastic-unbounded",
    shearModulus: 400_000, // kPa
    characteristicLength: 0.5, // m
  },
};
```

The tangential law is deliberately not called "frictionless" (`frictionless` means `tau = 0`) and
not called "no-slip" (`no-slip` would imply `delta_t = 0`); it keeps a finite-G elastic
regularization with nonzero tangential tractions.

## Normalized representation

`normalizeMasonryInterfaceLaw` maps the law onto the existing normalized contract:

- `friction: null` — for a deformable law this means the elastic-unbounded tangential response; no
  `mu`, cohesion, or friction capacity is invented (`Infinity` and huge finite substitutes are
  forbidden);
- `compressiveStrength: null` — the existing omitted-strength semantics;
- `deformability.tangential` carries the finite `shearModulus` and `characteristicLength`.

The domain-level law mirrors the same discrimination with an explicit
`tangential.type: "elastic-coulomb" | "elastic-unbounded"` union.

## Constitutive semantics

For `elastic-unbounded` the joint evaluation performs:

```text
shearTrial  = -Kt * area * (tangentialSlip - 0)   // no plastic slip state
shearForce  = shearTrial                          // no Coulomb return mapping
shearStress = shearForce / area                   // published per interface state
sliding     = false                               // no sliding surface exists
plasticSlip = 0                                   // no plastic slip is accumulated
checks.friction            = null                 // no tangential capacity exists
frictionUtilization        = null
fibers[].frictionCapacity  = null
```

The normal response keeps the exact analytic no-tension integration; with
`compressiveStrength === null` the crushing-onset test is disabled, `crushing` stays false,
`checks.compression` is null, and the intrados/extrados compression stresses remain published finite
response quantities.

## Events and engineering semantics

No `sliding-started` / `plastic-sliding` events can be produced (there is no sliding surface) and no
`compression-strength-reached` / `crushing` events can be produced (there is no compression limit).
Everything else is unchanged:

- `joint-opened` / `joint-closed`, `passive-tendon-activated`, `tendon-slackened`,
  `reinforcement-yielded`, `reinforcement-rupture`, `bonded-layer-capacity-reached`,
  `extrados-contact` events;
- a certified global limit point below lambda = 1 remains `FAIL` with `failureMode = "instability"`
  and `lambdaVerificationLimit < 1`;
- numerical failure without a certified limit point remains `INDETERMINATE`, never `FAIL`;
- no new verdicts (no "Heyman PASS"): OCFEM presentation is a consumer concern.

Deformable models keep `response: "deformable"`, so `analyzeMasonryArchVerification` selects the
existing `arc-length-continuation` route; no separate Heyman solver exists.

## Validation coverage

`tests/masonry-arch-heyman-regularized.test.ts` covers:

- normalization without invented resistance parameters;
- nonzero elastic shear tractions and null utilizations;
- event absence for the removed masonry limits;
- passive tendon activation through the ordinary verification façade (arc-length route, T0 = 0,
  activation, positive final force, exact lambda = 1 corrector, PASS);
- active tendon with T0 preserved as part of the fixed state;
- bonded-layer compatibility with a real, finite layer capacity;
- a certified global limit point below one (instability FAIL);
- numerical termination staying INDETERMINATE;
- elastic-regime equivalence between an unmobilized elastic-Coulomb law and the elastic-unbounded
  law (same G, characteristic length, normal law, loads, geometry), showing that `elastic-unbounded`
  is the same tangential elasticity without the yield surface;
- unchanged behavior of the existing finite-strength sliding-redistribution and stop-at-onset
  crushing cases.

Normative conformity is not claimed for this model: it is a solver-neutral mechanical capability.
