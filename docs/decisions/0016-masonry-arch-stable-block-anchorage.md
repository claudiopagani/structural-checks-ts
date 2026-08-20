# Decision 0016 — Masonry-arch stable block anchorage

- Status: implemented
- Scope: `applications/masonry-arches` tendon anchorage and bonded-layer extent contracts.
- Classification: new solver-neutral work; no normative conformity is claimed.

## Context

Decision 0015 introduced a topology-first tendon model with normalized side stations and fixed
external points. That advanced model is mechanically explicit, but it is not a safe stable contract
for a selection-based UI: a nominally vertical or angled anchorage could otherwise be reconstructed
from a free point, an automatically selected nearby device, or a geometry-derived tangent. Bonded
layers also had only a continuous station interval even though the intended UI selection is a block
extent.

## Decision

1. Stable intrados tendon anchorage is the closed union
   `terminalBlocks | customBlocks | closedLoop | externalVertical`.
2. Stable extrados tendon anchorage is the closed union
   `terminalBlocks | customBlocks | externalByAngle`. Extrados closed loops and `externalByPoint`
   are not stable modes.
3. Block selection defaults to one-based user numbering and resolves explicitly to zero-based
   indices. Values must be finite integers in range and strictly ordered; no clamping, swapping, or
   other silent correction is permitted.
4. Terminal modes resolve to indices `0` and `nBlocks - 1`. Custom block terminals are placed at the
   selected block-side midpoint. Terminal modes use the actual end boundary of the first and last
   blocks, so the right terminal cannot regress to the penultimate block.
5. `externalVertical` is an intrados-only prescribed terminal direction. Both arch transfer points
   remain on the terminal blocks and the external direction is vertical downward.
6. `externalByAngle` is an extrados-only prescribed terminal direction measured in degrees from the
   horizontal, with `0 <= angleDeg <= 90`. The two outward/upward directions are mirror-symmetric.
7. Prescribed-direction terminals have no external coordinate and contribute no arbitrary free
   branch to tendon compatibility length. The solver applies the direction change at the attached
   terminal device and reports the external-system force with
   `anchorageGeometry: "prescribed-direction"`.
8. A bonded layer's stable `extent` is a strictly ordered block range. It maps to the exact side-arc
   boundaries of the selected first and last blocks and remains a distributed layer, never a tendon
   or point anchorage.
9. The station/point `topology` and bonded-layer station interval remain available as explicitly
   experimental advanced routes for existing validated studies. Stable normalization never creates
   an `external-anchor` point, searches for a nearest point, or computes a tangent/intersection from
   a free line.

## Consequences

- The public model schema is `6.0.0`.
- The external-system force result gains the `anchorageGeometry` discriminator. Equilibrium, limit,
  path, verification, and comparison result schemas become `8.0.0`, `9.0.0`, `15.0.0`, `6.0.0`, and
  `7.0.0`, respectively.
- Existing advanced station/point inputs retain their validated mechanics and serialize with
  `anchorageGeometry: "fixed-point"` for fixed external anchors.
- Stable tendon and bonded-layer resolvers are public and are also used by model normalization, so
  direct API and future UI paths share one validation and geometry contract.
