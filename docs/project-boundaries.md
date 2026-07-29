# Project boundaries

`structural-checks-ts` is a public, solver-neutral library for structural calculation and
verification. During migration it is a parity target for `strutture-js`, which remains canonical
until an explicit cutover.

## In scope

- reusable mathematical and structural algorithms;
- domain models for materials, geometry, actions, loads, and structural systems;
- normatively traceable verification functions;
- deterministic, solver-neutral application workflows;
- generic serializable analysis-result contracts;
- serializable results, warnings, assumptions, checks, and report DTOs;
- numerical tests, benchmarks, and validation campaigns proportionate to engineering risk.

## Out of scope

- UI, framework components, or page state;
- authentication, users, persistent projects, databases, or application storage;
- HTTP clients, queues, jobs, or network orchestration;
- analytics, telemetry, pricing, or commercial logic;
- product-specific CAD, preprocessing, or postprocessing;
- NextFEM, OOFEM, or other concrete solver adapters;
- credentials, deployment configuration, private plans, or product strategy.

A solver adapter may read native solver data, but it must live in a consumer or a dedicated
integration repository. This library accepts only generic, solver-neutral, serializable models and
analysis-result DTOs with explicit units, axes, signs, component order, sample locations,
combinations, coverage, and provenance.

## Dependency direction

The allowed direction is:

```text
applications -> norms -> domain
```

`domain` does not import `norms` or `applications`. `norms` does not import `applications`. Shared
result contracts may live under `core`; they must remain independent of product and solver types.

Consumers use only entry points declared by `package.json#exports`. A file under `src/` is not
public merely because it exists.
