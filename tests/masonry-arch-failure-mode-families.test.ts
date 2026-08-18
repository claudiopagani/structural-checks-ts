import assert from "node:assert/strict";
import test from "node:test";

import {
  masonryArchFailureModeFromKinds,
  type MasonryArchEngineeringCriterionKind,
} from "structural-checks-ts-migration-workspace/applications/masonry-arches";

/**
 * The global failure mode classifies physical mechanism families, not the number of failed
 * criteria. Several stages of one family (reinforcement yielding, tensile rupture, bonded-layer
 * capacity) resolve to the family's most advanced mode, while distinct families resolve to
 * `mixed`. `equilibrium-infeasible` and kinds without a physical family remain `undetermined`.
 */

function mode(kinds: readonly MasonryArchEngineeringCriterionKind[]): string {
  return masonryArchFailureModeFromKinds(kinds);
}

void test("A. bare reinforcement yielding classifies as reinforcement-yield", () => {
  assert.equal(mode(["reinforcement-yielded"]), "reinforcement-yield");
});

void test("B. bare reinforcement rupture classifies as reinforcement-failure", () => {
  assert.equal(mode(["reinforcement-rupture"]), "reinforcement-failure");
});

void test("C. yielding plus rupture of one reinforcement system is not mixed", () => {
  assert.equal(mode(["reinforcement-yielded", "reinforcement-rupture"]), "reinforcement-failure");
});

void test("D. yielding plus bonded-layer capacity is not mixed", () => {
  assert.equal(
    mode(["reinforcement-yielded", "bonded-layer-capacity-reached"]),
    "reinforcement-failure",
  );
});

void test("E. compression-strength-reached plus crushing is not mixed", () => {
  assert.equal(mode(["compression-strength-reached", "crushing"]), "masonry-crushing");
});

void test("F. sliding plus crushing are distinct families and mix", () => {
  assert.equal(mode(["plastic-sliding", "crushing"]), "mixed");
});

void test("G. reinforcement rupture plus crushing are distinct families and mix", () => {
  assert.equal(mode(["reinforcement-rupture", "crushing"]), "mixed");
});

void test("single-family kinds resolve to their own modes", () => {
  assert.equal(mode(["plastic-sliding"]), "sliding");
  assert.equal(mode(["compression-strength-reached"]), "masonry-crushing");
  assert.equal(mode(["crushing"]), "masonry-crushing");
  assert.equal(mode(["extrados-contact-invalid"]), "instability");
  assert.equal(mode(["bonded-layer-capacity-reached"]), "reinforcement-failure");
});

void test("duplicate criteria of one family do not change the family mode", () => {
  assert.equal(
    mode(["reinforcement-rupture", "reinforcement-rupture", "reinforcement-yielded"]),
    "reinforcement-failure",
  );
  assert.equal(mode(["crushing", "compression-strength-reached", "crushing"]), "masonry-crushing");
});

void test("kinds without a physical family classify as undetermined", () => {
  assert.equal(mode(["equilibrium-infeasible"]), "undetermined");
  assert.equal(mode([]), "undetermined");
});

void test("reinforcement failure plus instability are distinct families and mix", () => {
  assert.equal(mode(["reinforcement-rupture", "extrados-contact-invalid"]), "mixed");
});
