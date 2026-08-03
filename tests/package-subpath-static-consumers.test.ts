import assert from "node:assert/strict";
import test from "node:test";

import * as root from "structural-checks-ts-migration-workspace";
import * as applications from "structural-checks-ts-migration-workspace/applications";
import * as fem from "structural-checks-ts-migration-workspace/domain/fem";
import * as geotechnics from "structural-checks-ts-migration-workspace/domain/geotechnics";
import * as math from "structural-checks-ts-migration-workspace/domain/math";
import * as terrain from "structural-checks-ts-migration-workspace/domain/terrain";
import * as strutAndTie from "structural-checks-ts-migration-workspace/domain/strut-and-tie";
import * as soilTypes from "structural-checks-ts-migration-workspace/catalogs/soil-types";
import * as wallInterfaceTypes from "structural-checks-ts-migration-workspace/catalogs/wall-interface-types";
import * as steelProfiles from "structural-checks-ts-migration-workspace/catalogs/steel-profiles";
import * as en1992 from "structural-checks-ts-migration-workspace/norms/en1992";
import * as italianHistorical from "structural-checks-ts-migration-workspace/norms/italian-historical";
import * as ntc2018 from "structural-checks-ts-migration-workspace/norms/ntc2018";
import * as geotechnicalDeepFoundations from "structural-checks-ts-migration-workspace/applications/geotechnical-deep-foundations";
import * as geotechnicalEarthPressures from "structural-checks-ts-migration-workspace/applications/geotechnical-earth-pressures";
import * as geotechnicalEmbeddedRetainingWalls from "structural-checks-ts-migration-workspace/applications/geotechnical-embedded-retaining-walls";
import * as geotechnicalGroundAnchors from "structural-checks-ts-migration-workspace/applications/geotechnical-ground-anchors";
import * as geotechnicalLateralPiles from "structural-checks-ts-migration-workspace/applications/geotechnical-lateral-piles";
import * as geotechnicalRetainingWalls from "structural-checks-ts-migration-workspace/applications/geotechnical-retaining-walls";
import * as geotechnicalShallowFoundations from "structural-checks-ts-migration-workspace/applications/geotechnical-shallow-foundations";
import * as geotechnicalSlopeStability from "structural-checks-ts-migration-workspace/applications/geotechnical-slope-stability";
import * as globalFemPostprocessing from "structural-checks-ts-migration-workspace/applications/global-fem-postprocessing";
import * as masonryOutOfPlane from "structural-checks-ts-migration-workspace/applications/masonry-out-of-plane";
import * as masonryPiers from "structural-checks-ts-migration-workspace/applications/masonry-piers";
import * as masonryRingBeams from "structural-checks-ts-migration-workspace/applications/masonry-ring-beams";
import * as masonryWallOpenings from "structural-checks-ts-migration-workspace/applications/masonry-wall-openings";
import * as micropilesBroms from "structural-checks-ts-migration-workspace/applications/micropiles-broms";
import * as rcBuildingVerification from "structural-checks-ts-migration-workspace/applications/rc-building-verification";
import * as rcCrackedDeflection from "structural-checks-ts-migration-workspace/applications/rc-cracked-deflection";
import * as reinforcedConcreteBeamColumnJoints from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-beam-column-joints";
import * as reinforcedConcreteColumns from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-columns";
import * as reinforcedConcreteFoundationBeams from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-foundation-beams";
import * as reinforcedConcreteIsolatedFootings from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-isolated-footings";
import * as reinforcedConcretePlates from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-plates";
import * as reinforcedConcretePunching from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-punching";
import * as reinforcedConcreteSections from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-sections";
import * as reinforcedConcreteStrutAndTie from "structural-checks-ts-migration-workspace/applications/reinforced-concrete-strut-and-tie";
import * as singleBeamDesign from "structural-checks-ts-migration-workspace/applications/single-beam-design";
import * as steelFrames from "structural-checks-ts-migration-workspace/applications/steel-frames";
import * as timberBeams from "structural-checks-ts-migration-workspace/applications/timber-beams";
import * as timberConcreteCompositeBeams from "structural-checks-ts-migration-workspace/applications/timber-concrete-composite-beams";
import * as timberXlamCompositeBeams from "structural-checks-ts-migration-workspace/applications/timber-xlam-composite-beams";
import * as xlamBeams from "structural-checks-ts-migration-workspace/applications/xlam-beams";
import * as xlamPanelsOutOfPlane from "structural-checks-ts-migration-workspace/applications/xlam-panels-out-of-plane";

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
});
