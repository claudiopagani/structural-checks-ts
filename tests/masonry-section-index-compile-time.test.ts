import test from "node:test";

import { MasonryFiberInterface2D } from "../dist/index.js";
import type {
  MasonryFiberCompressionMaterial,
  MasonryFiberDeformationInput,
  MasonryFiberInterface2DJson,
  MasonryFiberInterface2DOptions,
  MasonryFiberInterface2DState,
  MasonryFiberInternalFiber,
  MasonryFiberResponse,
  MasonryFiberResponseFiber,
  MasonryFiberResultantTarget,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [AssertFalse<IsAny<typeof MasonryFiberInterface2D>>];
type PublicContracts = [
  MasonryFiberCompressionMaterial,
  MasonryFiberDeformationInput,
  MasonryFiberInterface2DJson,
  MasonryFiberInterface2DOptions,
  MasonryFiberInterface2DState,
  MasonryFiberInternalFiber,
  MasonryFiberResponse,
  MasonryFiberResponseFiber,
  MasonryFiberResultantTarget,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("masonry section indexes expose strict typed consumer contracts", () => {
  useConsumerContracts(undefined);
  void MasonryFiberInterface2D;
});
