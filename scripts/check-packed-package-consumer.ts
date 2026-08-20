import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
) as { name: string; private?: boolean; version: string; exports: Record<string, unknown> };

assert.equal(packageJson.name, "structural-checks-ts");
assert.equal(packageJson.version, "0.1.0");
assert.equal(packageJson.private, undefined);

const npmCliPath =
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

async function runNpm(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync(process.execPath, [npmCliPath, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

function packageImportSpecifiers(applicationDirectories: string[]): string[] {
  const subpaths = Object.keys(packageJson.exports)
    .filter((key) => key !== "./applications/*")
    .map((key) => (key === "." ? packageJson.name : `${packageJson.name}${key.slice(1)}`));
  return [
    ...subpaths,
    ...applicationDirectories.map((directory) => `${packageJson.name}/applications/${directory}`),
  ];
}

function parsePackOutput<T>(output: string): T {
  const jsonStart = output.indexOf("[");
  assert.ok(jsonStart >= 0, "npm pack did not return JSON output.");
  return JSON.parse(output.slice(jsonStart)) as T;
}

await runNpm(["run", "build"], repositoryRoot);

const applicationDirectories = (
  await readdir(path.join(repositoryRoot, "dist", "applications"), { withFileTypes: true })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const importSpecifiers = packageImportSpecifiers(applicationDirectories);
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "structural-checks-ts-pack-"));
const packDirectory = path.join(temporaryRoot, "pack");
const consumerDirectory = path.join(temporaryRoot, "consumer");
const consumerFile = path.join(consumerDirectory, "consumer.mjs");
const typeConsumerFile = path.join(consumerDirectory, "consumer.ts");

await mkdir(packDirectory, { recursive: true });
await mkdir(consumerDirectory, { recursive: true });

try {
  const dryRun = parsePackOutput<
    Array<{ name: string; version: string; files?: Array<{ path: string }> }>
  >(await runNpm(["pack", "--dry-run", "--json"], repositoryRoot));
  assert.equal(dryRun[0]?.name, packageJson.name);
  assert.equal(dryRun[0]?.version, packageJson.version);
  assert.ok((dryRun[0]?.files ?? []).some((file) => file.path === "dist/index.js"));

  await runNpm(["pack", "--json", "--pack-destination", packDirectory], repositoryRoot);
  const packedFiles = await readdir(packDirectory);
  const tarball = packedFiles.find((file) => file.endsWith(".tgz"));
  assert.ok(tarball, "npm pack did not produce a tarball.");

  await runNpm(["init", "--yes"], consumerDirectory);
  await runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-save",
      path.join(packDirectory, tarball),
    ],
    consumerDirectory,
  );

  const consumerSource = `
import assert from "node:assert/strict";
import { createUnitResolver } from "structural-checks-ts";
import { DenseLinearSolver } from "structural-checks-ts/domain/math";
import {
  analyzeMasonryArchEquilibrium,
  analyzeMasonryArchVerification,
  createMasonryArch,
  resolveArchReinforcements,
  resolveBondedLayerInterfaceSections,
} from "structural-checks-ts/applications/masonry-arches";

const resolver = createUnitResolver({ force: "kN", length: "m" });
assert.equal(resolver.moment(2), 2_000);
assert.equal(typeof DenseLinearSolver, "function");
const arch = createMasonryArch({
  id: "packed-consumer",
  units: { force: "kN", length: "m" },
  geometry: {
    kind: "simplified-symmetric",
    referenceCurve: "centerline",
    profile: { type: "circular" },
    span: 10,
    rise: 5,
    thickness: 1,
    outOfPlaneWidth: 1,
    voussoirCount: 21,
  },
  masonry: { unitWeight: 20 },
  interfaceLaw: {
    response: "rigid-plastic",
    normal: { type: "no-tension" },
    tangential: { type: "frictionless" },
  },
  loads: [{ id: "SW", type: "self-weight", loadCaseId: "G" }],
  reinforcements: [{
    id: "PT",
    side: "intrados",
    area: 0.001,
    elasticModulus: 200_000_000,
    initialForce: 100,
    topology: {
      type: "open",
      left: { type: "arch-anchor", station: 0 },
      right: { type: "arch-anchor", station: 1 },
      deviators: { type: "uniform-count", count: 1 },
    },
  }],
  bondedLayers: [{
    id: "FRCM",
    family: "frcm",
    side: "intrados",
    area: 0.01,
    elasticModulus: 100_000_000,
    tensileStrength: 1_000,
    startStation: 0.2,
    endStation: 0.8,
  }],
});
const tendon = resolveArchReinforcements(arch);
assert.equal(tendon.reinforcementState.length, 1);
assert.ok(tendon.reinforcementState[0].segments.length >= 2);
const bonded = resolveBondedLayerInterfaceSections(arch);
assert.ok(bonded.some((section) => section.contributions.length === 1));
const equilibrium = analyzeMasonryArchEquilibrium(arch, { loadFactorsByCaseId: { G: 1 } });
assert.equal(equilibrium.outputs.reinforcementState.length, 1);
const verification = analyzeMasonryArchVerification(arch, {
  units: { force: "kN", length: "m" },
  scalableLoadCaseIds: ["G"],
});
assert.equal(verification.outputs.route, "rigid-plastic-static");
assert.equal(verification.outputs.engineeringAssessment.status, "FAIL");

const specifiers = ${JSON.stringify(importSpecifiers)};
const modules = await Promise.all(specifiers.map((specifier) => import(specifier)));
assert.equal(modules.length, specifiers.length);
for (const module of modules) assert.ok(Object.keys(module).length > 0);
`;
  assert.doesNotMatch(consumerSource, /(?:^|[/\\])src(?:[/\\]|$)/);
  await writeFile(consumerFile, consumerSource, "utf8");
  await execFileAsync(process.execPath, [consumerFile], {
    cwd: consumerDirectory,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  const typeConsumerSource = `
import { createUnitResolver, type UnitSystem } from "structural-checks-ts";
import { type DenseLinearSolver } from "structural-checks-ts/domain/math";
import {
  createMasonryArch,
  resolveArchReinforcements,
  type MasonryArchModel,
} from "structural-checks-ts/applications/masonry-arches";

const units: UnitSystem = { force: "kN", length: "m" };
createUnitResolver(units).force(1);
const model: MasonryArchModel = createMasonryArch({
  id: "declaration-consumer",
  units,
  geometry: {
    kind: "simplified-symmetric",
    referenceCurve: "centerline",
    profile: { type: "circular" },
    span: 4,
    rise: 2,
    thickness: 0.4,
    outOfPlaneWidth: 1,
    voussoirCount: 9,
  },
  interfaceLaw: {
    response: "rigid-plastic",
    normal: { type: "no-tension" },
    tangential: { type: "frictionless" },
  },
});
resolveArchReinforcements(model);
const solverTypeCheck: DenseLinearSolver | undefined = undefined;
void solverTypeCheck;
`;
  assert.doesNotMatch(typeConsumerSource, /(?:^|[/\\])src(?:[/\\]|$)/);
  await writeFile(typeConsumerFile, typeConsumerSource, "utf8");
  await writeFile(
    path.join(consumerDirectory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        target: "ES2022",
      },
      files: ["consumer.ts"],
    }),
    "utf8",
  );
  const tscPath = path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
  await execFileAsync(process.execPath, [tscPath, "--project", "tsconfig.json"], {
    cwd: consumerDirectory,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  const installedPackageJson = JSON.parse(
    await readFile(
      path.join(consumerDirectory, "node_modules", packageJson.name, "package.json"),
      "utf8",
    ),
  ) as { exports: Record<string, unknown> };
  for (const value of Object.values(installedPackageJson.exports)) {
    const importTarget =
      typeof value === "string"
        ? value
        : value &&
            typeof value === "object" &&
            typeof (value as Record<string, unknown>).import === "string"
          ? (value as Record<string, string>).import
          : null;
    assert.ok(
      importTarget?.startsWith("./dist/"),
      `packed export must resolve through dist: ${importTarget}`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(
  `Packed consumer check passed (${importSpecifiers.length} public imports, runtime calls, and declarations).`,
);
