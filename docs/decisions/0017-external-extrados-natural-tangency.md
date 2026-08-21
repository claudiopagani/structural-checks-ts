# Decision 0017 — External extrados cables use natural migrating tangency

- Status: implemented
- Scope: `applications/masonry-arches` extrados external-cable input, contact mechanics, and results
- Classification: new corrective solver-neutral work; no normative conformity is claimed
- Supersedes: the extrados external-terminal mechanics released in 0.1.0 and recorded in Decision
  0016

## Context

Version 0.1.0 represented each extrados external endpoint by both a fixed global point and a fixed
arch-side station. Resolution inserted an `arch-side-terminal` device at that station, excluded the
external free branch from the contact-envelope search, and applied `F = T_out t_out - T_in t_in` at
the imposed direction change. Unless the external branch happened to be tangent, this was a
concentrated saddle/deviator action attached to the arch. That is not the intended flexible,
frictionless external cable and could create an artificial large kink.

## Decision

1. An intrados external tendon retains `{ type: "external-anchor", station, point }`: `station` is
   the physical arch-side transfer/deviator point.
2. An extrados external cable uses `{ type: "external-anchor", point }`. It has no arch-side
   transfer device, contact station, saddle, or compatibility alias.
3. Only the external anchor point is fixed in the global frame. A reference tangency station,
   tangent angle, and branch length are pure geometry helpers used to construct that point.
4. The reference and current taut envelopes are solved independently between the actual endpoints.
   An external endpoint opens the contact search to the physically eligible extrados; an arch-anchor
   station remains a fixed endpoint and bounds that side of the search.
5. The cable is tension-only, has uniform tension, and uses complete-path compatibility
   `max(0, T0 + EA (L_current - L_reference) / L_reference)`. Migrating contact changes the free
   branches and current path length; it never moves an external anchor.
6. Smooth contact entry/exit solves the bracketed scalar equation `cross(P(s) - A, t(s)) = 0` on
   each rigidly moved voussoir boundary segment, with the appropriate dot-product direction check.
   The refined root, not a coarse contact sample, defines a smooth boundary.
7. The deformed extrados is piecewise smooth. When adjacent moved voussoir endpoints or tangents are
   discontinuous, the taut envelope may select a physical joint/corner contact with a finite
   concentrated contact action. That action is `joint-contact`, never a device force.
8. A cable may detach completely and span its two endpoints directly. The current contact interval
   and contact-force list are then empty; tension-only compatibility still applies.
9. Results publish `contactBoundary.reference` and `contactBoundary.current`. Each non-null interval
   gives start/end normalized physical extrados side-arc material stations, reference-curve
   stations, points, and `smooth-tangency | joint-contact | arch-anchor` kinds. A current station is
   expressed on the reference side coordinate so it identifies the current contacted material.
10. `extrados-contact-active-set-changed` remains an observable event. Normal migration or
    detachment is not failure, collapse, capacity, or numerical failure.

No supported extrados mode represents an external anchor followed by a terminal saddle/deviator and
then cable contact. A future physical saddle would require a separate explicit feature and model.

## Consequences

- Package version advances from 0.1.0 to 0.2.0.
- Model schema advances from 7.0.0 to 8.0.0 because the public extrados external-anchor input loses
  `station` and the normalized termination union is split from intrados.
- Equilibrium, limit, path, and verification result schemas advance from 9.0.0, 10.0.0, 16.0.0, and
  7.0.0 to 10.0.0, 11.0.0, 17.0.0, and 8.0.0. Their embedded reinforcement state gains
  reference/current contact boundaries, extrados external-anchor actions no longer expose an
  arch-side station, and inactive contact samples are no longer fabricated as force rows.
- The comparison result schema remains 8.0.0 because its published aggregate shape is unchanged.
- `arch-side-terminal` remains in the global device vocabulary solely for the real intrados external
  transfer device.
- Independent circle/ellipse oracles, migration, corner contact, full detachment, compatibility,
  free-body, and segment-count convergence regressions protect the corrected mechanics.

## Intentional limitations

The extrados envelope retains the documented x-monotone taut-cable assumption. It models no cable
bending stiffness, friction, local anchor or deviator resistance, anchorage compliance, dynamic
snap-through, or contact outside the supported circular/elliptical simplified-symmetric geometry.
