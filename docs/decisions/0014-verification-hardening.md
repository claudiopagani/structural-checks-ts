# Decision 0014: Verification hardening — numerical failure is never a physical failure

Status: accepted

## Context

Decision 0013 introduced the standard verification façade and the arc-length certification of the
design state and of global limit points. A post-implementation audit found five edge cases where a
numerical failure could be misread as structural evidence, and two places where the published
contract did not match the implementation:

- the scalable phase could start after a design-blocking event identified exactly on the step that
  completes the fixed load (`fixedLoadFactor = 1`);
- a caught tangent-solve exception was equated to a vanishing tangent load component and could
  certify a global limit point;
- the "certified bracket" of a limit point could be zero-width or advance from one side only, while
  being named a two-sided bracketing;
- the fixed-lambda corrector could throw out of the standard verification when its tangent seed
  could not be constructed;
- the façade duplicated the failure-mode semantics with `"no-collapse-within-model"` fallbacks, and
  the static route overloaded `engineeringAssessment.lambda` with the limit-analysis capacity.

## Decision

1. The scalable-loading phase starts only when the fixed state is `PASS` **and** the fixed load
   factor reached one without a blocking event. A design-blocking event identified exactly on the
   completing step stops the analysis with zero scalable-loading steps and no scalable lambda.
2. A tangent load-correction exception is only a numerical diagnostic (null tangent component plus a
   warning). It can never certify `equilibrium-limit-point`, `instability`, or a physical `FAIL`.
   Certification requires positive branch-turning evidence between converged states; a singular or
   nearly vertical continuation tangent at the last converged state is only a
   `suspected-critical-point` diagnostic and keeps the run `INDETERMINATE`.
3. `MasonryArchVerifiedLimitPoint` is redefined with `detection: "branch-turning"` and the two
   converged sides (`risingSideStep`, `descendingSideStep`, `risingSideLambda`,
   `descendingSideLambda`). The turn of `lambda(s)` at `d(lambda)/ds = 0` lies between the two sides
   in arc-length coordinate; the certified `lambda` is the rising-side maximum refined with halved
   arc increments and always satisfies `lambda <= lambda_turning`. No lambda-interval bracket and no
   zero-width bracket is published for a turning point; `MasonryArchLambdaBracket` is narrowed to
   the uncertified `load-control-failure-bracket` meaning, and the rising-side refinement is
   documented as such, never as a two-sided bisection.
4. The fixed-lambda corrector is exception-safe. Interpolated seed first; if the tangent seed cannot
   even be constructed because the load-correction solve threw, a diagnostic is recorded, the arc
   radius is reduced, and if `lambda = 1` stays uncertifiable the result is `INDETERMINATE` /
   `design-state-not-certified`. Never a throw, never a physical `FAIL`.
5. `MasonryArchVerificationOutputs.failureMode` is `MasonryArchFailureMode | null` and is always
   identical to `engineeringAssessment.failureMode`: null on `PASS` and `INDETERMINATE`, the
   physical mode or `"undetermined"` on `FAIL`. The path primitive's own termination classification
   remains semantically named inside `subAnalyses.path.outputs`.
6. `engineeringAssessment.lambda` is the assessed load state (1 on `PASS` and for the assigned
   state, the deciding state on `FAIL`, the last verified state when available on `INDETERMINATE`),
   and is never a capacity. On the static route a design `FAIL` reports `assessment.lambda = 1`
   while `lambdaVerificationLimit` carries the direct limit-analysis capacity of the scalable
   pattern.
7. After limit-point refinement, the final internal state (`q`, `lambda`, committed interface
   states, final evaluation) and the last history step describe one and the same equilibrium state;
   when no refinement step advanced, the certified rising-side state is re-appended as the
   termination step.

## Consequences

- Masonry-arch path result schema bumped to 10.0.0 and the standard-verification result schema to
  2.0.0; the repository is pre-production and no backward compatibility is kept.
- Regression and invariant tests added: fixed blocking event exactly at `fixedLoadFactor = 1` (zero
  scalable steps), tangent-seed exception safety, two-sided branch-turning contract, failure-mode
  identity on PASS/INDETERMINATE/FAIL, static-route lambda semantics, and post-refinement
  internal-state coherence.
- `docs/masonry-arch-analysis.md` and the benchmark coverage matrix were updated to HEAD reality.
- No OCFEM changes, no new mechanics, no staged construction, no benchmark data changes.
