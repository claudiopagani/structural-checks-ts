/* eslint-disable @typescript-eslint/no-floating-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceIndex = await import(pathToFileURL(path.join(sourceRoot, "src", "index.js")).href);
const sourceApplications = await import(
  pathToFileURL(path.join(sourceRoot, "src", "applications", "index.js")).href
);
const targetIndex = await import(pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href);
const targetApplications = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "applications", "index.js")).href
);
const sourceRuntime = sourceIndex as unknown as Record<string, unknown>;
const targetRuntime = targetIndex as unknown as Record<string, unknown>;

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

test("root and applications runtime exports match the pinned JavaScript package", () => {
  assert.deepEqual(sortedKeys(targetIndex), sortedKeys(sourceIndex));
  assert.deepEqual(sortedKeys(targetApplications), sortedKeys(sourceApplications));
  assert.equal(Object.keys(targetIndex).length, 841);
  assert.equal(Object.keys(targetApplications).length, 309);
});

test("application catalog, default registry ordering, manifests, and schema values match", () => {
  assert.deepEqual(targetIndex.APPLICATION_CATALOG, sourceIndex.APPLICATION_CATALOG);

  const sourceRegistry = sourceApplications.createDefaultApplicationRegistry();
  const targetRegistry = targetApplications.createDefaultApplicationRegistry();
  assert.deepEqual(
    targetRegistry.list().map((application: { id: string }) => application.id),
    sourceRegistry.list().map((application: { id: string }) => application.id),
  );
  assert.deepEqual(targetRegistry.listManifests(), sourceRegistry.listManifests());

  const schemaNames = Object.keys(sourceRuntime).filter((name) =>
    /(?:SCHEMA|VERSION|STATE_VERSION|CONTRACT_VERSION)/i.test(name),
  );
  for (const name of schemaNames) {
    assert.deepEqual(
      targetRuntime[name],
      sourceRuntime[name],
      `serialized schema/version: ${name}`,
    );
  }

  const sourceApplication = new sourceApplications.TimberXlamCompositeBeamApplication();
  const targetApplication = new targetApplications.TimberXlamCompositeBeamApplication();
  assert.deepEqual(targetApplication.getManifest(), sourceApplication.getManifest());
});
