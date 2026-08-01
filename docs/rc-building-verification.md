# Solver-neutral RC building verification

The RC-building boundary consumes serializable FEM contracts produced by an external analysis
project. It does not contain a FEM solver and does not provide a NextFEM, OOFEM, or other solver
adapter.

`RcBuildingVerificationApplication` validates the shared capabilities, model, analysis, result, and
entity-mapping contracts, then coordinates classification, demand extraction, readiness, NTC 2018
building kernels, and the explicit consumer-provided member and system verifiers.

Every concurrent FEM action state is retained with its original units, coordinate system, axes,
signs, combination/reference, station or location, and provenance. Resistance-axis projection is
performed only from an explicit declared mapping. Missing components, result families, mappings,
combinations, design inputs, or verifier status do not become zeroes or successful checks.

The complete fixture boundary covers member, joint, wall, slab, punching, diaphragm, foundation,
capacity-design, displacement/P-Delta, regularity, and linear-dynamic processing. Member and system
resistance data, sections, materials, reinforcement, and verifier callbacks remain consumer inputs;
the library does not generate them.

The application can produce a complete executable result for the declared fixture boundary, but
`metadata.normativeConformityClaimed` remains `false`. Coverage and design-basis audits distinguish
implemented software behavior from normative traceability and do not make legal, regulatory, or
professional conformity claims.

The boundary and its exact source provenance are recorded in migration slices 0028-0035. The
behavioral authority is `strutture-js` revision `6f33baead8b88166c4b2cf94af41763412e3c751`; the
normative corpus revision is `41da3faa489600173106935bbcf726119300e48d`.
