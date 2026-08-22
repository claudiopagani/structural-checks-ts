# Changelog

All notable public changes are recorded here.

## 0.2.1

- Dramatically accelerated nonlinear analysis of masonry arches with discrete extrados tendons and
  unilateral contact, fixing severe convergence and performance degradation for active prestressed
  extrados tendons.
- Cached immutable reference stationing and constructed the reinforcement finite-difference tangent
  on the fixed current contact active set. Ordinary nonlinear residual evaluations still recompute
  the full exact unilateral-contact solution.
- This backward-compatible numerical and performance correction does not change the mechanical
  model, public API, schemas, DTOs, engineering-status semantics, or contact capabilities. Migrating
  contact, smooth tangency, joint/corner contact, full detachment, and complete-path compatibility
  remain operative.

## 0.2.0

- Corrected external extrados cables so external anchors are fixed global endpoints and the cable
  enters or leaves masonry naturally through the unilateral-contact solution.
- Removed externally anchored extrados terminal stations as kinematic constraints and removed the
  artificial extrados terminal saddle/device force semantics.
- Added reference/current contact-boundary results; smooth tangency is continuously refined, contact
  may migrate to another masonry material station, moved joints may carry corner contact, and full
  detachment is supported.
- Added public geometry helpers for extrados station-to-tangent, reference tangency plus branch
  length to fixed anchor point, and side-specific tangent-angle inversion for circular and
  elliptical profiles.

## 0.1.0

Initial public npm release of the solver-neutral TypeScript library.

- Structural result contracts, units, materials, section geometry, catalogs, and numerical tools.
- Reinforced-concrete section, member, plate, punching, wall, foundation, and detailing checks.
- Masonry, steel, timber, composite, geotechnical, and solver-neutral FEM calculation modules.
- NTC 2018, EN 1992, and Italian historical-code modules with structured normative references where
  implemented.
- Advanced two-dimensional rigid-voussoir masonry-arch analysis with rigid-plastic and deformable
  interfaces, load paths, discrete tendons, bonded layers, unilateral extrados contact, and typed
  engineering assessments. This module has documented modeling assumptions and limitations; the
  release does not claim normative certification.
- ESM output, TypeScript declarations, embedded-source maps, Web Worker bundle verification, and
  public package subpaths.
