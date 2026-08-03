import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const targetPackage = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as { name: string; exports: Record<string, unknown> };
const sourcePackage = JSON.parse(await readFile(path.join(sourceRoot, "package.json"), "utf8")) as {
  name: string;
  exports: Record<string, unknown>;
};

function exportTarget(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    const importTarget = (value as Record<string, unknown>).import;
    if (typeof importTarget === "string") return importTarget;
    const defaultTarget = (value as Record<string, unknown>).default;
    if (typeof defaultTarget === "string") return defaultTarget;
  }
  throw new Error("The source package export has no importable target.");
}

function targetSpecifier(subpath: string): string {
  return subpath === "." ? targetPackage.name : `${targetPackage.name}${subpath.slice(1)}`;
}

function sourceExportNames(subpath: string, module: Record<string, unknown>): string[] {
  const names = Object.keys(module);
  if (subpath === "./domain/geotechnics") {
    return names.filter(
      (name) =>
        !new Set([
          "AXIAL_PILE_CAPACITY_REFERENCE",
          "AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION",
          "AxialPileCapacityAnalysis",
        ]).has(name),
    );
  }
  return names;
}

function serializableValues(
  subpath: string,
  module: Record<string, unknown>,
): Record<string, unknown> {
  const values = Object.fromEntries(
    Object.entries(module).filter(([, value]) => typeof value !== "function"),
  );
  if (subpath === "./domain/geotechnics") {
    for (const name of [
      "AXIAL_PILE_CAPACITY_REFERENCE",
      "AXIAL_PILE_CAPACITY_RESULT_SCHEMA_VERSION",
    ]) {
      delete values[name];
    }
  }
  for (const [containerKey, compatibilityKey] of [
    ["NTC2018_RC_CHAPTER_4_REFERENCES", "serviceModularRatio"],
    ["NTC2018_RC_OUTSIDE_CORPUS_REFERENCES", "cosenzaCircularShear"],
  ] as const) {
    const container = values[containerKey];
    if (container && typeof container === "object") {
      values[containerKey] = Object.fromEntries(
        Object.entries(container).filter(([key]) => key !== compatibilityKey),
      );
    }
  }
  return values;
}

void test("every declared package entry point is importable and matches the source export surface", async () => {
  assert.deepEqual(Object.keys(targetPackage.exports), Object.keys(sourcePackage.exports));

  for (const subpath of Object.keys(sourcePackage.exports)) {
    if (subpath === "./applications/*") continue;
    const sourcePath = exportTarget(sourcePackage.exports[subpath]);
    const sourceModule = (await import(
      pathToFileURL(path.resolve(sourceRoot, sourcePath)).href
    )) as Record<string, unknown>;
    const targetModule = (await import(targetSpecifier(subpath))) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(targetModule),
      sourceExportNames(subpath, sourceModule),
      `entry point export names: ${subpath}`,
    );
    assert.deepEqual(
      serializableValues(subpath, targetModule),
      serializableValues(subpath, sourceModule),
      `entry point serializable values: ${subpath}`,
    );
  }
});

void test("the applications wildcard exposes every pinned application barrel and no extra barrel", async () => {
  const sourceApplicationDirectories = await (
    await import("node:fs/promises")
  ).readdir(path.join(sourceRoot, "src", "applications"), { withFileTypes: true });
  const directories = sourceApplicationDirectories
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const targetApplicationDirectories = await (
    await import("node:fs/promises")
  ).readdir(path.join(repositoryRoot, "src", "applications"), { withFileTypes: true });
  assert.deepEqual(
    targetApplicationDirectories
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    directories,
  );

  for (const directory of directories) {
    const sourceModule = (await import(
      pathToFileURL(path.join(sourceRoot, "src", "applications", directory, "index.js")).href
    )) as Record<string, unknown>;
    const targetModule = (await import(targetSpecifier(`./applications/${directory}`))) as Record<
      string,
      unknown
    >;
    assert.deepEqual(
      Object.keys(targetModule),
      Object.keys(sourceModule),
      `wildcard application export names: ${directory}`,
    );
  }
});
