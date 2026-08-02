import test from "node:test";

import {
  FloorSlab,
  LayerLoad,
  LinearLoadFromLineWeight,
  LinearLoadFromVolumeWeight,
  NTC2018SlabLoadAnalysis,
  PunchingActionState,
  PunchingConnectionModel,
  PunchingControlPerimeter,
  SlabLoad,
  SurfaceLoad,
  VariableLoad,
  WallLoad,
  resolvePunchingTransferFromJointActions,
} from "../dist/index.js";
import type {
  FloorSlabOptions,
  LayerLoadOptions,
  LinearLoadFromLineWeightOptions,
  LinearLoadFromVolumeWeightOptions,
  NTC2018SlabLoadAnalysisOptions,
  NTC2018SlabLoadCoefficients,
  SlabLoadJson,
  SlabLoadOptions,
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
  AssertFalse<IsAny<typeof PunchingActionState>>,
  AssertFalse<IsAny<typeof PunchingConnectionModel>>,
  AssertFalse<IsAny<typeof PunchingControlPerimeter>>,
  AssertFalse<IsAny<typeof SlabLoad>>,
  AssertFalse<IsAny<typeof SurfaceLoad>>,
  AssertFalse<IsAny<typeof VariableLoad>>,
  AssertFalse<IsAny<typeof WallLoad>>,
  AssertFalse<IsAny<typeof resolvePunchingTransferFromJointActions>>,
];
type PublicContracts = [
  FloorSlabOptions,
  LayerLoadOptions,
  LinearLoadFromLineWeightOptions,
  LinearLoadFromVolumeWeightOptions,
  NTC2018SlabLoadAnalysisOptions,
  NTC2018SlabLoadCoefficients,
  SlabLoadJson,
  SlabLoadOptions,
  VariableLoadJson,
  VariableLoadOptions,
  WallLoadOptions,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("slab public indexes expose strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  void FloorSlab;
  void LayerLoad;
  void LinearLoadFromLineWeight;
  void LinearLoadFromVolumeWeight;
  void NTC2018SlabLoadAnalysis;
  void PunchingActionState;
  void PunchingConnectionModel;
  void PunchingControlPerimeter;
  void SlabLoad;
  void SurfaceLoad;
  void VariableLoad;
  void WallLoad;
  void resolvePunchingTransferFromJointActions;
});
