# Decision 0009: Final masonry-arch analysis architecture

Status: accepted

## Context

Earlier increments exposed model families, engineering meanings, continuation controls, and
compatibility routing through overlapping entry points. The package is not in production and the
consumer UI is being redesigned, so preserving that transitional API would make the canonical
engineering contract harder to understand and maintain.

Historical derivation, license, source revision, and validation provenance remain governed by
Decision 0003 and the versioned migration evidence. This decision consolidates and replaces every
later transitional masonry-arch decision.

## Decision

The public application has exactly three analysis boundaries:

- assigned rigid-plastic equilibrium;
- direct rigid-plastic limit analysis;
- deformable-interface path analysis.

Mechanical response, engineering objective, and continuation control are independent typed values.
No mode flag or compatibility router changes one level implicitly.

Masonry interface-law input and normalization belong to `domain/masonry/interfaces`. General
continuation-control contracts, spherical arc-length geometry, and the Newton equilibrium kernel for
load, displacement, and arc-length control belong to `domain/solvers/continuation`. The generic
kernel consumes only `R(q, lambda)`, its tangent, its load derivative, and explicit dimensional
scales. Arch-specific assembly binds these reusable parts to rigid voussoir geometry, loads,
reinforcements, event policy, and engineering result interpretation.

The only definition of lambda is

```text
F(lambda) = F_fixed + lambda * F_scalable
```

after combination factors are applied. Fixed/scalable roles are selected per analysis. Solved
responses and initial or compatibility tendon forces are excluded.

Design-state checks return `PASS`, `FAIL`, or `INDETERMINATE`. Numerical non-convergence is not a
physical failure. Capacity results distinguish first limit, peak, last converged termination, and
explicitly defined collapse.

Every converged deformable-path step owns its complete coherent state. Static analyses do not return
fabricated pre-collapse deformation. Limit analyses return a normalized collapse mechanism only when
kinematics are actually verified.

## Consequences

The transitional entry points, aliases, overloaded result fields, model labels, and deprecated
options are intentionally removed. Consumer UIs must target the new contract directly.

The refactoring does not change the repository's LGPL-2.1-or-later license, canonical-authority
decision, historical derivation record, normative disclaimer, or solver-neutral boundary.
