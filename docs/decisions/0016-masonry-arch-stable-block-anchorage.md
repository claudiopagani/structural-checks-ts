# Decision 0016 — Station-based masonry-arch reinforcement geometry

- Status: implemented; the original block-based decision at `e859daf` is superseded.
- Scope: `applications/masonry-arches` discrete tendons and bonded-layer geometry.
- Classification: new solver-neutral work; no normative conformity is claimed.

## Context

Decision 0015 introduced a topology-first tendon model with normalized side stations and fixed
external points. The first version of Decision 0016 then promoted voussoir block ranges,
`externalVertical`, and `externalByAngle` prescribed directions as the stable UI-oriented contract.
That version was implemented at `e859daf` and remains useful historical context, but it confused a
numerical discretization with physical geometry. Changing `voussoirCount` could move a physical
terminal or bonded extent, and a prescribed direction without an actual external point omitted the
physical free branch from tendon compatibility.

## Decision

1. A normalized side-boundary arc-length station is the sole physical arch coordinate for
   reinforcement. Station `0` is the left end and `1` the right end of the relevant intrados or
   extrados boundary. The mapping to the reference curve and attached masonry block remains an
   internal responsibility of this library.
2. Block numbers and ranges are not part of the structural model. A UI may convert a selected block
   to a station before constructing the model, but normalized inputs and results do not retain block
   indices as reinforcement geometry.
3. An arch-anchored terminal is `{ type: "arch-anchor", station }`. Its material point moves with
   the attached masonry block.
4. A physical external terminal is `{ type: "external-anchor", station, point }`. `station`
   identifies the arch-side terminal device; `point` is the actual fixed external endpoint. Left and
   right stations and points are independent.
5. The straight segment between each external fixed anchor and its arch-side terminal is a real free
   terminal branch. It contributes to reference length, current length, passive activation, and the
   active or passive tendon force increment. The fixed-anchor force belongs to the external
   structural system and is not added to masonry support reactions.
6. A pure direction is not a physical external anchor. The block-based `externalVertical` and
   `externalByAngle` modes and their `external-direction` normalization are removed. The pure helper
   `externalAnchorPointFromDirectionAndLength` may convert a terminal point, direction, and positive
   branch length to a fixed point before model construction; it does not participate in equilibrium.
7. Intrados open tendons accept independent stationed arch or external terminations and stationed
   interior deviators. Intrados closed loops use left and right return-deviator stations; their
   return branch is the actual straight chord and participates in full compatibility.
8. Extrados open tendons use the same terminal union and compression-only unilateral contact. The
   terminal stations delimit the arch-side contact interval. A fixed external point connects to that
   interval through a free straight branch; assigning the station does not force intermediate
   contact, which remains governed by the taut-cable envelope.
9. Bonded layers use a strict `startStation < endStation` effective interval on their assigned side.
   Full assigned tensile capacity is available inside and the layer is absent outside. Physical
   development and local bond design are the user's separate responsibility; the model applies no
   development ramp or terminal reduction.
10. Reinforcement device results publish mechanical actions only. They contain no local anchor,
    deviator, connector-group, or development resistance and no device utilization or verdict.

## Consequences

- The public model schema is `7.0.0`.
- Equilibrium, limit, path, verification, and comparison result schemas are `9.0.0`, `10.0.0`,
  `16.0.0`, `7.0.0`, and `8.0.0`, respectively.
- The resolved external-anchor action publishes its fixed point and arch-side station; the former
  `anchorageGeometry` discriminator is unnecessary because prescribed-direction terminals no longer
  exist.
- Mesh-independence tests at 21, 41, and 81 voussoirs preserve the physical coordinates of stationed
  terminals, external branch endpoints, closed-loop return devices, and bonded effective intervals.
- The original nine-point block/prescribed-direction decision is retained in repository history at
  `e859daf`; this amended record deliberately supersedes it rather than providing compatibility
  aliases.
