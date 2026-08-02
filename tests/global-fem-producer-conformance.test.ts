// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  GLOBAL_FEM_POSTPROCESSING_PROFILES,
  GlobalFemPostProcessingApplication,
  RcBuildingVerificationApplication,
} from "../dist/index.js";
import type { GlobalFemDemandSet, GlobalFemPostProcessingInput } from "../dist/index.js";
import type { MutableGlobalFemBuildingFixture } from "./fixtures/globalFemBuildingFixtureAdapter.js";

interface RuntimeFixtureAdapter {
  readonly createGlobalFemBuildingFixture: () => MutableGlobalFemBuildingFixture;
  readonly configureCompleteRcBuildingFixture: (
    fixture: MutableGlobalFemBuildingFixture,
  ) => MutableGlobalFemBuildingFixture;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runtimeFixtureAdapter(value: unknown): RuntimeFixtureAdapter {
  assert.ok(isRecord(value));
  assert.equal(typeof value.createGlobalFemBuildingFixture, "function");
  assert.equal(typeof value.configureCompleteRcBuildingFixture, "function");
  return {
    createGlobalFemBuildingFixture:
      value.createGlobalFemBuildingFixture as () => MutableGlobalFemBuildingFixture,
    configureCompleteRcBuildingFixture: value.configureCompleteRcBuildingFixture as (
      fixture: MutableGlobalFemBuildingFixture,
    ) => MutableGlobalFemBuildingFixture,
  };
}

const fixtureAdapter = runtimeFixtureAdapter(
  await import(
    pathToFileURL(
      path.resolve(import.meta.dirname, "fixtures", "globalFemBuildingFixtureAdapter.ts"),
    ).href
  ),
);
const createGlobalFemBuildingFixture = (): MutableGlobalFemBuildingFixture =>
  fixtureAdapter.createGlobalFemBuildingFixture();
const configureCompleteRcBuildingFixture = (
  fixture: MutableGlobalFemBuildingFixture,
): MutableGlobalFemBuildingFixture => fixtureAdapter.configureCompleteRcBuildingFixture(fixture);

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fixtureForProducer(id: string, name: string, version: string) {
  const fixture = createGlobalFemBuildingFixture();
  fixture.capabilities.id = `${id}-capabilities`;
  fixture.capabilities.solver = { id, name, version };
  fixture.result.id = `${id}-result`;
  fixture.result.capabilitiesId = fixture.capabilities.id;
  fixture.result.provenance.solver = copy(fixture.capabilities.solver);
  return fixture;
}

function normalizedDemandSemantics(demandSet: unknown): unknown {
  const normalized = copy(demandSet) as Record<string, unknown>;
  delete normalized.resultId;
  delete normalized.provenance;
  return normalized;
}

function demandSetFrom(result: { readonly outputs: Record<string, unknown> }): GlobalFemDemandSet {
  const demandSet = result.outputs.demands;
  assert.ok(isRecord(demandSet));
  assert.equal(demandSet.schema, "strutture-js/global-fem-demand-set");
  return demandSet as unknown as GlobalFemDemandSet;
}

function arrayOutput(value: unknown): readonly unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function runApplication(application: GlobalFemPostProcessingApplication, input: unknown) {
  return application.run(input as GlobalFemPostProcessingInput);
}

void test("two independent FEM producers yield identical postprocessing semantics", () => {
  const producerA = fixtureForProducer("contract-producer-a", "Contract Producer A", "1.0");
  const producerB = fixtureForProducer("contract-producer-b", "Contract Producer B", "9.4");
  const application = new GlobalFemPostProcessingApplication();
  const first = runApplication(application, {
    ...producerA,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });
  const second = runApplication(application, {
    ...producerB,
    profile: GLOBAL_FEM_POSTPROCESSING_PROFILES.CONFIRMED,
  });

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.deepEqual(
    normalizedDemandSemantics(demandSetFrom(first)),
    normalizedDemandSemantics(demandSetFrom(second)),
  );
  assert.equal(demandSetFrom(first).provenance.solver.id, "contract-producer-a");
  assert.equal(demandSetFrom(second).provenance.solver.id, "contract-producer-b");
});

void test("two FEM producers yield the same complete RC building decision", () => {
  const producerA = configureCompleteRcBuildingFixture(
    fixtureForProducer("contract-producer-a", "Contract Producer A", "1.0"),
  );
  const producerB = configureCompleteRcBuildingFixture(
    fixtureForProducer("contract-producer-b", "Contract Producer B", "9.4"),
  );
  const application = new RcBuildingVerificationApplication();
  const first = application.run(producerA);
  const second = application.run(producerB);
  const normalizedFirst = normalizeProducerMetadata(first.outputs);
  const normalizedSecond = normalizeProducerMetadata(second.outputs);

  assert.equal(first.status, second.status);
  assert.equal(arrayOutput(first.outputs.blockedAssessments).length, 0);
  assert.equal(arrayOutput(second.outputs.blockedAssessments).length, 0);
  assert.deepEqual(normalizedFirst, normalizedSecond);
});

function normalizeProducerMetadata<T extends { readonly globalFemDemandSet: unknown }>(
  output: T,
): Omit<T, "globalFemDemandSet"> & { readonly globalFemDemandSet: Record<string, unknown> } {
  const demandSet = output.globalFemDemandSet;
  assert.ok(isRecord(demandSet));
  const { resultId: _resultId, provenance: _provenance, ...globalFemDemandSet } = demandSet;
  void _resultId;
  void _provenance;
  return { ...output, globalFemDemandSet };
}
