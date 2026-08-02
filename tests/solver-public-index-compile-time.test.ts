import test from "node:test";

import { IllinoisRootSolver } from "../dist/index.js";
import type {
  IllinoisRootHistoryEntry,
  IllinoisRootResult,
  IllinoisRootSolverOptions,
  IllinoisSolveOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [AssertFalse<IsAny<typeof IllinoisRootSolver>>];
type PublicContracts = [
  IllinoisRootHistoryEntry,
  IllinoisRootResult,
  IllinoisRootSolverOptions,
  IllinoisSolveOptions,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("solver public index exposes a strict typed consumer contract", () => {
  useConsumerContracts(undefined);
  void IllinoisRootSolver;
});
