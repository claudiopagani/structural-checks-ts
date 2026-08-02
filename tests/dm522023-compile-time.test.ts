import test from "node:test";

import {
  DM522023_AMENDMENTS,
  DM522023_REFERENCES,
  describeDM522023Amendment,
} from "../dist/index.js";
import type {
  Dm522023AmendmentDescription,
  Dm522023Amendments,
  Dm522023Reference,
  Dm522023TemporarySuspension,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof DM522023_AMENDMENTS>>,
  AssertFalse<IsAny<typeof DM522023_REFERENCES>>,
  AssertFalse<IsAny<typeof describeDM522023Amendment>>,
];
type PublicContracts = [
  Dm522023AmendmentDescription,
  Dm522023Amendments,
  Dm522023Reference,
  Dm522023TemporarySuspension,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("D.M. 52/2023 exports expose strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  void DM522023_AMENDMENTS;
  void DM522023_REFERENCES;
  void describeDM522023Amendment;
});
