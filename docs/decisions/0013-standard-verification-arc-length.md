# Decision 0013: Standard masonry-arch verification with fixed-state check and arc-length authority

Status: accepted

## Context

The previous standard verification of a masonry arch was the path primitive with objective
`design-state-check`, which required adaptive load control with `targetLambda: 1`. The design state
was whatever step the load control converged to, the fixed loads were only a proportional
initialization, and there was no certified notion of a global limit point of the equilibrium branch.
Three confusions were therefore possible:

- an arc step overshooting `lambda = 1` could be accepted as the design state;
- the maximum lambda seen before a numerical termination could be read as capacity;
- the fixed-load state could fail while the analysis still reported a scalable lambda.

The repository is not in production (see the pre-production change policy in `AGENTS.md`).

## Decision

1. `analyzeMasonryArchVerification` is the standard-verification façade and the single authority on:
   the fixed-state result, `PASS`/`FAIL`/`INDETERMINATE`, the exact `lambda = 1` design state, the
   verification limit, the failure mode, the failed criteria, the significant states, and the
   numerical diagnostics. The primitives remain available for expert and capacity analyses.
2. Logical phase A verifies `F_fixed` at `lambda = 0` first (not a construction stage). `FAIL` stops
   the verification without defining a scalable lambda; `INDETERMINATE` stops it without inventing a
   failure.
3. Rigid-plastic models use the static route: fixed-state equilibrium, then the assigned
   `lambda = 1` equilibrium; a fixed-passed/design-failed outcome runs direct limit analysis of the
   scalable pattern to supply a meaningful lambda limit.
4. Deformable and reinforced models use the arc-length route as the primary continuation. Adaptive
   load control is never the authority of the standard verification; it remains an expert choice on
   the primitive.
5. The exact `lambda = 1` state is certified by a fixed-lambda Newton corrector at the crossing of
   the primary branch; an overshooting arc step is never the design state, and an uncertifiable
   corrector is `INDETERMINATE`, never `FAIL`.
6. A global limit point of the primary branch is a distinct machine-readable result
   (`equilibrium-limit-point` event and criterion, `failureMode: "instability"`). Certification
   requires opposite-signed tangent load components between consecutive converged states with
   bracketing refinement, or a singular/nearly-vertical continuation tangent at the last converged
   state with a failed forward traversal. A discrete local plastic event is never a certified limit
   point, and `max(steps.lambda)` is never capacity by itself.
7. `lambdaVerificationLimit` is added to the capacity landmarks: the lambda of the first event that
   makes satisfying the design verification at `lambda = 1` impossible on the primary branch. It is
   distinct from `lambdaFirstLimit` and is null on `PASS`, on fixed-state failure, and when no
   blocking event could be certified.
8. Numerical diagnostics (`lastConvergedLambda`, `maximumObservedLambda`, `lastConvergedStep`,
   `terminationReason`, cutbacks, lambda bracket, corrector attempts, tangent component) are
   published, including on `INDETERMINATE`; they are never capacity, never a failure, and never the
   engineering verdict.
9. Active reinforcement keeps its assigned `T0` as part of the fixed state; passive reinforcement
   has `T0 = 0`. No staged prestressing analysis and no special-casing: `T0` improves or worsens the
   fixed state and the capacity through the same code path.
10. The existing local-plasticity semantics of Decision 0012 are preserved unchanged:
    `joint-opened`, `passive-tendon-activated`, redistributing `plastic-sliding`, redistributing
    perfectly-plastic `compression-strength-reached`/`crushing`, terminal `stop-at-onset` crushing,
    reinforcement yield without a post-yield law, reinforcement rupture, anchor capacity,
    bonded-layer capacity, and `extrados-contact-invalid`.

## Consequences

- Path result schema version bumped to 9.0.0; a new verification result schema (1.0.0) is added.
- Existing design-state tests that pinned load control were intentionally updated: criterion
  taxonomy tests use the explicit expert load control, and benchmark tests assert the new arc-length
  semantics (`design-state-reached`, corrected design state with lambda exactly one).
- The mandatory verification tests (fixed state, corrector, sliding and crushing redistribution,
  rupture/anchor/bonded verification limits, certified limit point, numerical INDETERMINATE, active
  `T0`) are added in `tests/masonry-arch-verification-facade.test.ts` and
  `tests/masonry-arch-arc-length-design-check.test.ts`.
