import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryEquivalentFramePushoverInternalForces,
  createMasonryEquivalentFrameContributorDefinition,
  type CreateMasonryEquivalentFrameContributorDefinitionInput,
  type MasonryEquivalentFrameContributorDefinition,
  type MasonryEquivalentFramePushoverInternalForcesOptions,
} from "../dist/applications/masonry-wall-openings/analysis/MasonryEquivalentFramePushoverInternalForces.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;
type InternalDeclarationsAreStrict = [
  AssertFalse<IsAny<typeof MasonryEquivalentFramePushoverInternalForces>>,
  AssertFalse<IsAny<typeof createMasonryEquivalentFrameContributorDefinition>>,
  AssertFalse<IsAny<CreateMasonryEquivalentFrameContributorDefinitionInput>>,
  AssertFalse<IsAny<MasonryEquivalentFrameContributorDefinition>>,
  AssertFalse<IsAny<MasonryEquivalentFramePushoverInternalForcesOptions>>,
];

function useInternalDeclarations(value: InternalDeclarationsAreStrict | undefined): void {
  void value;
}

void test("equivalent-frame pushover internal forces expose strict typed contracts", () => {
  useInternalDeclarations(undefined);
  const input: CreateMasonryEquivalentFrameContributorDefinitionInput = {
    alignment: { units: { force: "kN", length: "m" } },
    pier: {
      id: "pier-typed",
      wallId: "wall-typed",
      ultimateDisplacement: 0.01,
      mechanics: { flexural: { MRd: 12 }, bedJointSliding: { V: 8 } },
    },
    topRotation: "free",
  };
  const definition = createMasonryEquivalentFrameContributorDefinition(input);
  const options: MasonryEquivalentFramePushoverInternalForcesOptions = {
    contributorsByElementId: { "pier-element": definition },
  };
  const evaluator = new MasonryEquivalentFramePushoverInternalForces(options);

  assert.equal(definition.pierId, "pier-typed");
  assert.equal(definition.capacitiesByPosition.start?.value, 12);
  assert.equal(evaluator.contributorsByElementId["pier-element"], definition);
});
