import test from "node:test";

import {
  FloorSlab,
  LayerLoad,
  LinearLoadFromLineWeight,
  LinearLoadFromVolumeWeight,
  NTC2018SlabLoadAnalysis,
  SlabLoad,
  SurfaceLoad,
  VariableLoad,
  WallLoad,
} from "../dist/index.js";
import type {
  FloorSlabOptions,
  LayerLoadOptions,
  LinearLoadFromLineWeightOptions,
  LinearLoadFromVolumeWeightOptions,
  NTC2018SlabLoadCoefficients,
  SlabLoadJson,
  SurfaceLoadOptions,
  VariableLoadJson,
  VariableLoadOptions,
  WallLoadOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof FloorSlab>>,
  AssertFalse<IsAny<typeof LayerLoad>>,
  AssertFalse<IsAny<typeof LinearLoadFromLineWeight>>,
  AssertFalse<IsAny<typeof LinearLoadFromVolumeWeight>>,
  AssertFalse<IsAny<typeof NTC2018SlabLoadAnalysis>>,
  AssertFalse<IsAny<typeof SlabLoad>>,
  AssertFalse<IsAny<typeof SurfaceLoad>>,
  AssertFalse<IsAny<typeof VariableLoad>>,
  AssertFalse<IsAny<typeof WallLoad>>,
];

const units = { force: "kN" as const, length: "m" as const };
const common = {
  description: "Solaio α",
  loadGroup: "G1",
  units,
} as const;
const slabOptions: FloorSlabOptions = { description: "Solaio β" };
const slabLoad = new SlabLoad(common);
const layerOptions: LayerLoadOptions = {
  ...common,
  density: 2.4,
  thickness: 0.2,
};
const lineOptions: LinearLoadFromLineWeightOptions = {
  ...common,
  lineWeight: 4,
  spacing: 0.5,
};
const volumeOptions: LinearLoadFromVolumeWeightOptions = {
  ...common,
  density: 2.4,
  area: 0.8,
  spacing: 2,
};
const surfaceOptions: SurfaceLoadOptions = {
  ...common,
  surfaceWeight: 3.2,
};
const wallOptions: WallLoadOptions = {
  ...common,
  density: 18,
  height: 3,
  thickness: 0.2,
  spacing: 4,
};
const variableOptions: VariableLoadOptions = {
  description: "Uso α",
  value: 2.5,
  psi0: 0.7,
  psi1: 0.5,
  psi2: 0.3,
  category: "uffici",
  units,
};

const variableLoad = new VariableLoad(variableOptions);

const loads = [
  slabLoad,
  new LayerLoad(layerOptions),
  new LinearLoadFromLineWeight(lineOptions),
  new LinearLoadFromVolumeWeight(volumeOptions),
  new SurfaceLoad(surfaceOptions),
  new WallLoad(wallOptions),
  variableLoad,
];
const floorSlab = new FloorSlab({ ...slabOptions, loads });
const coefficients: NTC2018SlabLoadCoefficients = { qUnfavourable: 1.5 };
const analysis = new NTC2018SlabLoadAnalysis(floorSlab);
const slabJson: SlabLoadJson = slabLoad.toJSON();
const variableJson: VariableLoadJson = variableLoad.toJSON();
const uls: Record<string, unknown> = analysis.calculateULS(coefficients);
const sle: Record<string, unknown> = analysis.calculateSLE();

void test("slab load hierarchy exposes strict typed consumer contracts", () => {
  void (null as unknown as PublicDeclarationsAreUseful);
  void slabJson;
  void variableJson;
  void uls;
  void sle;
});
