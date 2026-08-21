# structural-checks-ts

`structural-checks-ts` is an open-source, solver-neutral structural-engineering library for
TypeScript. It provides serializable calculation models, engineering checks, and numerical tools as
ES modules with TypeScript declarations.

## Install

```sh
npm install structural-checks-ts
```

Import general library functions from the package root:

```ts
import { createUnitResolver, RectangularSection } from "structural-checks-ts";

const units = createUnitResolver({ force: "kN", length: "m" });
const section = new RectangularSection({ width: 0.3, height: 0.5, units: { length: "m" } });

console.log(units.force(1), section.area);
```

Use documented subpaths for focused modules:

```ts
import {
  analyzeMasonryArchEquilibrium,
  createMasonryArch,
} from "structural-checks-ts/applications/masonry-arches";
```

## Scope

The public surface includes structural result and unit contracts, materials, section geometry,
catalogs, numerical tools, solver-neutral FEM contracts, and calculation modules for
reinforced-concrete, masonry, steel, timber and composite members, foundations, and geotechnical
problems. Norm-specific modules include implemented NTC 2018, EN 1992, and Italian historical-code
calculations with structured references where available.

The advanced masonry-arch module models two-dimensional rigid-voussoir circular and elliptical
arches. Its implemented scope includes rigid-plastic and deformable interfaces, assigned-state and
path analyses, station-based intrados devices and arch anchors, bonded effective intervals, and
unilateral extrados cable contact with migrating tangency from fixed global external endpoints.
Tendon device results are mechanical actions only: local anchor/deviator design, bond-development
mechanics, and construction detailing are outside the model. See
[the masonry-arch model documentation](docs/masonry-arch-analysis.md) for assumptions and limits.

## Status and support

This is a pre-1.0 library. Public APIs may change in documented minor releases while the model
matures. The package is ESM-only and supports the Node versions declared in `package.json`; the
public calculation boundary is also checked for Web Worker bundling.

Structural engineering software does not replace qualified professional judgment. Users are
responsible for validating inputs, applicability, units, assumptions, results, and governing rules
for each project. Passing tests or resolving normative references is not a claim of regulatory,
legal, or professional conformity.

The project is licensed under
[GNU LGPL 2.1 or later](https://github.com/claudiopagani/structural-checks-ts/blob/master/LICENSE).
Source, issues, and release history are hosted on
[GitHub](https://github.com/claudiopagani/structural-checks-ts).
