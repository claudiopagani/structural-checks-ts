import test from "node:test";

import { createNTC2018BeamCombinations } from "../dist/index.js";
import type {
  CreateNTC2018BeamCombinationsOptions,
  NTC2018BeamCombination,
  NTC2018BeamCombinationInput,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [AssertFalse<IsAny<typeof createNTC2018BeamCombinations>>];
type ConsumerContracts = PublicDeclarationsAreUseful &
  [CreateNTC2018BeamCombinationsOptions, NTC2018BeamCombination, NTC2018BeamCombinationInput];

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 beam combinations expose strict consumer contracts", () => {
  useConsumerContracts(undefined);
  const load: NTC2018BeamCombinationInput = {
    id: "g1",
    loadCaseId: "G1",
    nature: "permanent",
    permanentClass: "G1",
  };
  const options: CreateNTC2018BeamCombinationsOptions = {
    loads: [load],
    types: ["ULS"],
    idPrefix: "beam",
  };
  const combinations: NTC2018BeamCombination[] = createNTC2018BeamCombinations(options);

  void combinations;
});
