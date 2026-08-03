import test from "node:test";

import { FloorSlab, NTC2018SlabLoadAnalysis } from "../dist/index.js";
import type { NTC2018SlabLoadAnalysisOptions, NTC2018SlabLoadCoefficients } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof NTC2018SlabLoadAnalysis>>,
  AssertFalse<IsAny<typeof FloorSlab>>,
];
type ConsumerContracts = [
  ...PublicDeclarationsAreUseful,
  NTC2018SlabLoadAnalysisOptions,
  NTC2018SlabLoadCoefficients,
];

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 slab-load analysis re-export exposes strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const floorSlab = new FloorSlab({ description: "Solaio μ", loads: [] });
  const analysis = new NTC2018SlabLoadAnalysis(floorSlab);
  const coefficients: NTC2018SlabLoadCoefficients = { qUnfavourable: 1.35 };
  const options: NTC2018SlabLoadAnalysisOptions = { floorSlab };

  void analysis.calculateULS(coefficients);
  void analysis.calculateSLE();
  void options;
});
