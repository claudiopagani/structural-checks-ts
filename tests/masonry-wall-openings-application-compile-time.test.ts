import assert from "node:assert/strict";
import test from "node:test";

import {
  MasonryWallOpeningsApplication,
  MasonryWallOpeningsModel,
  type MasonryWallOpeningsApplicationInput,
  type MasonryWallOpeningsApplicationOptions,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

const units = { force: "N", length: "m" } as const;
const lambda = String.fromCodePoint(0x3bb);
const alignment = new MasonryWallOpeningsModel({
  id: "alignment-application-compile-time",
  label: `Alignment ${lambda}`,
  units,
  walls: [
    {
      id: `wall-${lambda}`,
      length: 1.2,
      height: 3,
      thickness: 0.3,
      material: {
        fm: 6e6,
        tau0: 4e5,
        fv0: 0,
        E: 1.8e9,
        G: 6e8,
        density: 18000,
        units,
      },
      verticalLineLoad: { G1: 5000 },
    },
  ],
});

const input: MasonryWallOpeningsApplicationInput = {
  id: alignment.id,
  label: alignment.label,
  units,
  walls: [],
  mode: "sanitize-only",
  model: alignment,
  metadata: { label: lambda },
};

const options: MasonryWallOpeningsApplicationOptions = {};
type ApplicationIsStrict = AssertFalse<IsAny<typeof MasonryWallOpeningsApplication>>;
type InputIsStrict = AssertFalse<IsAny<MasonryWallOpeningsApplicationInput>>;
type OptionsAreStrict = AssertFalse<IsAny<MasonryWallOpeningsApplicationOptions>>;

void test("masonry wall-opening application exposes strict consumers", () => {
  const applicationStrictProof: ApplicationIsStrict = false;
  const inputStrictProof: InputIsStrict = false;
  const optionsStrictProof: OptionsAreStrict = false;
  const application = new MasonryWallOpeningsApplication(options);
  const result = application.run(input);

  assert.equal(applicationStrictProof, false);
  assert.equal(inputStrictProof, false);
  assert.equal(optionsStrictProof, false);
  assert.equal(application.id, "masonry-wall-openings");
  assert.equal(result.applicationId, "masonry-wall-openings");
  assert.equal(result.status, "ok");
});
