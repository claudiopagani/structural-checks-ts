import test from "node:test";

import {
  CIRC2019_RC_REFERENCES,
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
  NTC2018_NORMATIVE_CORPUS,
  NTC2018_RC_CHAPTER_4_REFERENCES,
  NTC2018_RC_CHAPTER_7_4_REFERENCES,
  NTC2018_RC_OUTSIDE_CORPUS_REFERENCES,
} from "../dist/index.js";
import type { Ntc2018NormativeCorpus, Ntc2018NormativeReferenceCatalog } from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof CIRC2019_RC_REFERENCES>>,
  AssertFalse<IsAny<typeof NORMATIVE_REFERENCE_RELATIONS>>,
  AssertFalse<IsAny<typeof NORMATIVE_REFERENCE_RESOLUTION_STATUS>>,
  AssertFalse<IsAny<typeof NTC2018_NORMATIVE_CORPUS>>,
  AssertFalse<IsAny<typeof NTC2018_RC_CHAPTER_4_REFERENCES>>,
  AssertFalse<IsAny<typeof NTC2018_RC_CHAPTER_7_4_REFERENCES>>,
  AssertFalse<IsAny<typeof NTC2018_RC_OUTSIDE_CORPUS_REFERENCES>>,
];
type PublicContracts = [
  Ntc2018NormativeCorpus,
  Ntc2018NormativeReferenceCatalog,
  typeof CIRC2019_RC_REFERENCES extends Ntc2018NormativeReferenceCatalog ? true : false,
  typeof NTC2018_RC_CHAPTER_4_REFERENCES extends Ntc2018NormativeReferenceCatalog ? true : false,
  typeof NTC2018_RC_CHAPTER_7_4_REFERENCES extends Ntc2018NormativeReferenceCatalog ? true : false,
  typeof NTC2018_RC_OUTSIDE_CORPUS_REFERENCES extends Ntc2018NormativeReferenceCatalog
    ? true
    : false,
];
type ConsumerContracts = PublicDeclarationsAreUseful & PublicContracts;

function useConsumerContracts(value: ConsumerContracts | undefined): void {
  void value;
}

void test("NTC 2018 normative-reference exports expose strict contracts", () => {
  useConsumerContracts(undefined);
  void CIRC2019_RC_REFERENCES;
  void NORMATIVE_REFERENCE_RELATIONS;
  void NORMATIVE_REFERENCE_RESOLUTION_STATUS;
  void NTC2018_NORMATIVE_CORPUS;
  void NTC2018_RC_CHAPTER_4_REFERENCES;
  void NTC2018_RC_CHAPTER_7_4_REFERENCES;
  void NTC2018_RC_OUTSIDE_CORPUS_REFERENCES;
});
