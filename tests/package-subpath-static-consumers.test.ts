import assert from "node:assert/strict";
import test from "node:test";

import * as root from "structural-checks-ts";
import * as applications from "structural-checks-ts/applications";
import * as fem from "structural-checks-ts/domain/fem";
import * as geotechnics from "structural-checks-ts/domain/geotechnics";
import * as math from "structural-checks-ts/domain/math";
import * as terrain from "structural-checks-ts/domain/terrain";
import * as strutAndTie from "structural-checks-ts/domain/strut-and-tie";
import * as soilTypes from "structural-checks-ts/catalogs/soil-types";
import * as wallInterfaceTypes from "structural-checks-ts/catalogs/wall-interface-types";
import * as steelProfiles from "structural-checks-ts/catalogs/steel-profiles";
import * as en1992 from "structural-checks-ts/norms/en1992";
import * as italianHistorical from "structural-checks-ts/norms/italian-historical";
import * as ntc2018 from "structural-checks-ts/norms/ntc2018";
import * as geotechnicalDeepFoundations from "structural-checks-ts/applications/geotechnical-deep-foundations";
import * as geotechnicalEarthPressures from "structural-checks-ts/applications/geotechnical-earth-pressures";
import * as geotechnicalEmbeddedRetainingWalls from "structural-checks-ts/applications/geotechnical-embedded-retaining-walls";
import * as geotechnicalGroundAnchors from "structural-checks-ts/applications/geotechnical-ground-anchors";
import * as geotechnicalLateralPiles from "structural-checks-ts/applications/geotechnical-lateral-piles";
import * as geotechnicalRetainingWalls from "structural-checks-ts/applications/geotechnical-retaining-walls";
import * as geotechnicalShallowFoundations from "structural-checks-ts/applications/geotechnical-shallow-foundations";
import * as geotechnicalSlopeStability from "structural-checks-ts/applications/geotechnical-slope-stability";
import * as globalFemPostprocessing from "structural-checks-ts/applications/global-fem-postprocessing";
import * as masonryOutOfPlane from "structural-checks-ts/applications/masonry-out-of-plane";
import * as masonryArches from "structural-checks-ts/applications/masonry-arches";
import * as masonryPiers from "structural-checks-ts/applications/masonry-piers";
import * as masonryRingBeams from "structural-checks-ts/applications/masonry-ring-beams";
import * as masonryWallOpenings from "structural-checks-ts/applications/masonry-wall-openings";
import * as micropilesBroms from "structural-checks-ts/applications/micropiles-broms";
import * as rcBuildingVerification from "structural-checks-ts/applications/rc-building-verification";
import * as rcCrackedDeflection from "structural-checks-ts/applications/rc-cracked-deflection";
import * as reinforcedConcreteBeamColumnJoints from "structural-checks-ts/applications/reinforced-concrete-beam-column-joints";
import * as reinforcedConcreteColumns from "structural-checks-ts/applications/reinforced-concrete-columns";
import * as reinforcedConcreteFoundationBeams from "structural-checks-ts/applications/reinforced-concrete-foundation-beams";
import * as reinforcedConcreteIsolatedFootings from "structural-checks-ts/applications/reinforced-concrete-isolated-footings";
import * as reinforcedConcretePlates from "structural-checks-ts/applications/reinforced-concrete-plates";
import * as reinforcedConcretePunching from "structural-checks-ts/applications/reinforced-concrete-punching";
import * as reinforcedConcreteSections from "structural-checks-ts/applications/reinforced-concrete-sections";
import * as reinforcedConcreteStrutAndTie from "structural-checks-ts/applications/reinforced-concrete-strut-and-tie";
import * as singleBeamDesign from "structural-checks-ts/applications/single-beam-design";
import * as steelFrames from "structural-checks-ts/applications/steel-frames";
import * as timberBeams from "structural-checks-ts/applications/timber-beams";
import * as timberConcreteCompositeBeams from "structural-checks-ts/applications/timber-concrete-composite-beams";
import * as timberXlamCompositeBeams from "structural-checks-ts/applications/timber-xlam-composite-beams";
import * as xlamBeams from "structural-checks-ts/applications/xlam-beams";
import * as xlamPanelsOutOfPlane from "structural-checks-ts/applications/xlam-panels-out-of-plane";

const entryPointModules = [
  root,
  applications,
  fem,
  geotechnics,
  math,
  terrain,
  strutAndTie,
  soilTypes,
  wallInterfaceTypes,
  steelProfiles,
  en1992,
  italianHistorical,
  ntc2018,
  geotechnicalDeepFoundations,
  geotechnicalEarthPressures,
  geotechnicalEmbeddedRetainingWalls,
  geotechnicalGroundAnchors,
  geotechnicalLateralPiles,
  geotechnicalRetainingWalls,
  geotechnicalShallowFoundations,
  geotechnicalSlopeStability,
  globalFemPostprocessing,
  masonryArches,
  masonryOutOfPlane,
  masonryPiers,
  masonryRingBeams,
  masonryWallOpenings,
  micropilesBroms,
  rcBuildingVerification,
  rcCrackedDeflection,
  reinforcedConcreteBeamColumnJoints,
  reinforcedConcreteColumns,
  reinforcedConcreteFoundationBeams,
  reinforcedConcreteIsolatedFootings,
  reinforcedConcretePlates,
  reinforcedConcretePunching,
  reinforcedConcreteSections,
  reinforcedConcreteStrutAndTie,
  singleBeamDesign,
  steelFrames,
  timberBeams,
  timberConcreteCompositeBeams,
  timberXlamCompositeBeams,
  xlamBeams,
  xlamPanelsOutOfPlane,
];

void test("all public package subpaths and wildcard application barrels compile and import", () => {
  for (const module of entryPointModules) {
    assert.ok(Object.keys(module).length > 0);
  }
  assert.equal(typeof masonryArches.analyzeMasonryArchEquilibrium, "function");
  assert.equal(typeof masonryArches.analyzeMasonryArchLimit, "function");
  assert.equal(typeof masonryArches.analyzeMasonryArchPath, "function");
  assert.equal(typeof masonryArches.compareMasonryArchModels, "function");
  assert.equal(typeof root.rectangularNoTensionCompressionDomain2D, "function");
});
