import test from "node:test";

import {
  coulombActiveEarthPressureCoefficient,
  coulombPassiveEarthPressureCoefficient,
  jakyAtRestCoefficient,
  mononobeOkabeActiveEarthPressureCoefficient,
  rankineEarthPressureCoefficients,
  type CoulombEarthPressureCoefficient,
  type MononobeOkabeActiveEarthPressureCoefficient,
  type RankineEarthPressureCoefficients,
} from "../dist/index.js";

const rankine: RankineEarthPressureCoefficients = rankineEarthPressureCoefficients({
  frictionAngle: Math.PI / 6,
});
const atRest = jakyAtRestCoefficient({ frictionAngle: Math.PI / 6 });
const active: CoulombEarthPressureCoefficient = coulombActiveEarthPressureCoefficient({
  frictionAngle: Math.PI / 6,
  interfaceFrictionAngle: Math.PI / 36,
});
const passive: CoulombEarthPressureCoefficient = coulombPassiveEarthPressureCoefficient({
  frictionAngle: Math.PI / 6,
});
const seismic: MononobeOkabeActiveEarthPressureCoefficient =
  mononobeOkabeActiveEarthPressureCoefficient({
    frictionAngle: Math.PI / 6,
    horizontalSeismicCoefficient: 0.1,
  });

void test("earth-pressure coefficient utilities expose strict typed consumer contracts", () => {
  void rankine.active;
  void atRest.coefficient;
  void active.coefficient;
  void passive.warnings;
  void seismic.equivalentCoefficient;
});
