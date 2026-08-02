import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";
const sourceModulePath = path.join(sourceRoot, "src", "domain", "actions", "index.js");
const typescriptModulePath = path.join(repositoryRoot, "dist", "domain", "actions", "index.js");

interface RuntimeAction {
  readonly assignTo: (loadCase: unknown) => RuntimeAction;
  readonly getCombinationFactor: (kind?: string) => unknown;
  readonly getPartialFactor: (options?: unknown) => unknown;
  readonly toJSON: () => unknown;
}

type RuntimeActionConstructor = new (...arguments_: readonly unknown[]) => RuntimeAction;

interface RuntimeActionModule {
  readonly Action: RuntimeActionConstructor;
  readonly PermanentAction: RuntimeActionConstructor;
  readonly VariableAction: RuntimeActionConstructor;
  readonly ImposedAction: RuntimeActionConstructor;
  readonly TrafficAction: RuntimeActionConstructor;
  readonly ClimaticAction: RuntimeActionConstructor;
  readonly SnowAction: RuntimeActionConstructor;
  readonly WindAction: RuntimeActionConstructor;
  readonly ThermalAction: RuntimeActionConstructor;
  readonly AccidentalAction: RuntimeActionConstructor;
  readonly SeismicAction: RuntimeActionConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function assertRuntimeModule(value: unknown): asserts value is RuntimeActionModule {
  assert.ok(isRecord(value));
  for (const name of [
    "Action",
    "PermanentAction",
    "VariableAction",
    "ImposedAction",
    "TrafficAction",
    "ClimaticAction",
    "SnowAction",
    "WindAction",
    "ThermalAction",
    "AccidentalAction",
    "SeismicAction",
  ]) {
    assert.equal(typeof value[name], "function", `${name} must be exported`);
  }
}

function gitOutput(...arguments_: readonly string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...arguments_], { encoding: "utf8" }).trim();
}

function assertSourceBaseline(): void {
  assert.equal(gitOutput("rev-parse", "HEAD"), sourceRevision);
  assert.equal(gitOutput("status", "--porcelain"), "");
}

function codePoints(value: string): number[] {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) throw new Error("Expected a code point for every character.");
    return codePoint;
  });
}

function compareValues(source: unknown, typescript: unknown, label: string): void {
  const absoluteTolerance = 1e-12;
  const relativeTolerance = 1e-12;
  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      if (typeof left !== "number" || typeof right !== "number") return;
      const difference = Math.abs(left - right);
      const scale = Math.max(1, Math.abs(left), Math.abs(right));
      assert.ok(
        difference <= absoluteTolerance + relativeTolerance * scale,
        `${label}${valuePath}: numerical difference ${difference} exceeds tolerance`,
      );
      return;
    }
    if (typeof left === "string" || typeof right === "string") {
      assert.equal(typeof left, "string", `${label}${valuePath}`);
      assert.equal(typeof right, "string", `${label}${valuePath}`);
      if (typeof left !== "string" || typeof right !== "string") return;
      assert.equal(left, right, `${label}${valuePath}`);
      assert.deepEqual(
        codePoints(left),
        codePoints(right),
        `${label}${valuePath}: Unicode code points`,
      );
      return;
    }
    if (isUnknownArray(left) || isUnknownArray(right)) {
      assert.ok(isUnknownArray(left) && isUnknownArray(right), `${label}${valuePath}`);
      if (!isUnknownArray(left) || !isUnknownArray(right)) return;
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      if (!isRecord(left) || !isRecord(right)) return;
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      assert.deepEqual(leftKeys, rightKeys, `${label}${valuePath}.keys`);
      leftKeys.forEach((key) => compare(left[key], right[key], `${valuePath}.${key}`));
      return;
    }
    assert.deepEqual(left, right, `${label}${valuePath}`);
  };

  compare(source, typescript, "$");
  assert.equal(
    JSON.stringify(source),
    JSON.stringify(typescript),
    `${label}: exact serialized JSON`,
  );
}

function captureError(invoke: () => unknown): { readonly name: string; readonly message: string } {
  try {
    invoke();
  } catch (error) {
    return {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  throw new Error("Expected the independent JavaScript oracle call to fail.");
}

function mutateSerialized(value: unknown): void {
  assert.ok(isRecord(value));
  if (!isRecord(value)) return;

  const combinationFactors = value.combinationFactors;
  const partialFactors = value.partialFactors;
  const metadata = value.metadata;
  assert.ok(isRecord(combinationFactors));
  assert.ok(isRecord(partialFactors));
  assert.ok(isRecord(metadata));
  if (!isRecord(combinationFactors) || !isRecord(partialFactors) || !isRecord(metadata)) return;

  combinationFactors.psi0 = 99;
  metadata.source = "mutated serialized metadata";
  const firstSet = partialFactors.A1;
  assert.ok(isRecord(firstSet));
  if (isRecord(firstSet)) firstSet.unfavourable = 99;
}

const sourceModuleValue: unknown = await import(pathToFileURL(sourceModulePath).href);
const typescriptModuleValue: unknown = await import(pathToFileURL(typescriptModulePath).href);
assertRuntimeModule(sourceModuleValue);
assertRuntimeModule(typescriptModuleValue);
const sourceModule = sourceModuleValue;
const typescriptModule = typescriptModuleValue;

void test("domain action hierarchy matches the independently executed JavaScript oracle", () => {
  assertSourceBaseline();

  for (const name of [
    "Action",
    "PermanentAction",
    "VariableAction",
    "ImposedAction",
    "TrafficAction",
    "ClimaticAction",
    "SnowAction",
    "WindAction",
    "ThermalAction",
    "AccidentalAction",
    "SeismicAction",
  ] as const) {
    assert.notEqual(sourceModule[name], typescriptModule[name], `${name} must be independent`);
  }

  const commonOptions = {
    id: "action-Δ-01",
    name: "Azione § 7.4 – Δ",
    combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3, custom: 0.25 },
    partialFactors: {
      A1: { favourable: 0.8, unfavourable: 1.5 },
      A2: { favourable: 0, unfavourable: 1.3 },
    },
    metadata: {
      source: "Scheda d'azione § 7.4",
      unicode: "àèìòù € Δ",
      nested: { reference: "source-compatible metadata" },
    },
  };

  const scenarios: readonly [
    string,
    (module: RuntimeActionModule) => RuntimeAction,
    (module: RuntimeActionModule) => RuntimeAction,
  ][] = [
    [
      "permanent",
      (module) => new module.PermanentAction({ ...commonOptions, permanentClass: "G2" }),
      (module) => new module.PermanentAction({ ...commonOptions, permanentClass: "G2" }),
    ],
    [
      "variable",
      (module) =>
        new module.VariableAction({ ...commonOptions, category: "B", leadingEligible: false }),
      (module) =>
        new module.VariableAction({ ...commonOptions, category: "B", leadingEligible: false }),
    ],
    [
      "imposed",
      (module) => new module.ImposedAction({ ...commonOptions, category: "C" }),
      (module) => new module.ImposedAction({ ...commonOptions, category: "C" }),
    ],
    [
      "traffic",
      (module) => new module.TrafficAction({ ...commonOptions, category: "F" }),
      (module) => new module.TrafficAction({ ...commonOptions, category: "F" }),
    ],
    [
      "climatic",
      (module) => new module.ClimaticAction({ ...commonOptions, category: "climatic" }),
      (module) => new module.ClimaticAction({ ...commonOptions, category: "climatic" }),
    ],
    [
      "snow",
      (module) => new module.SnowAction({ ...commonOptions, category: "snow" }),
      (module) => new module.SnowAction({ ...commonOptions, category: "snow" }),
    ],
    [
      "wind",
      (module) => new module.WindAction({ ...commonOptions, category: "wind" }),
      (module) => new module.WindAction({ ...commonOptions, category: "wind" }),
    ],
    [
      "thermal",
      (module) => new module.ThermalAction({ ...commonOptions, category: "thermal" }),
      (module) => new module.ThermalAction({ ...commonOptions, category: "thermal" }),
    ],
    [
      "accidental",
      (module) => new module.AccidentalAction(commonOptions),
      (module) => new module.AccidentalAction(commonOptions),
    ],
    [
      "seismic",
      (module) => new module.SeismicAction(commonOptions),
      (module) => new module.SeismicAction(commonOptions),
    ],
  ];

  for (const [label, createSourceAction, createTypescriptAction] of scenarios) {
    const sourceAction = createSourceAction(sourceModule);
    const typescriptAction = createTypescriptAction(typescriptModule);
    const sourceSerialized = sourceAction.toJSON();
    const typescriptSerialized = typescriptAction.toJSON();
    compareValues(sourceSerialized, typescriptSerialized, `${label}.serialization`);
    compareValues(
      sourceAction.getCombinationFactor("psi0"),
      typescriptAction.getCombinationFactor("psi0"),
      `${label}.combination-factor`,
    );
    compareValues(
      sourceAction.getPartialFactor({ combinationSet: "A1", effect: "unfavourable" }),
      typescriptAction.getPartialFactor({ combinationSet: "A1", effect: "unfavourable" }),
      `${label}.partial-factor`,
    );

    const sourceAssigned = sourceAction.assignTo({ id: "load-case-Δ" });
    const typescriptAssigned = typescriptAction.assignTo({ id: "load-case-Δ" });
    assert.equal(sourceAssigned, sourceAction);
    assert.equal(typescriptAssigned, typescriptAction);
    compareValues(sourceAction.toJSON(), typescriptAction.toJSON(), `${label}.assigned`);

    mutateSerialized(sourceSerialized);
    mutateSerialized(typescriptSerialized);
    compareValues(sourceAction.toJSON(), typescriptAction.toJSON(), `${label}.clone-isolation`);
  }

  const sourceDefaultVariable = new sourceModule.VariableAction({ id: "variable-defaults" });
  const typescriptDefaultVariable = new typescriptModule.VariableAction({
    id: "variable-defaults",
  });
  compareValues(
    sourceDefaultVariable.toJSON(),
    typescriptDefaultVariable.toJSON(),
    "defaults.variable",
  );

  const sourceWind = new sourceModule.WindAction({ id: "wind-instanceof" });
  const typescriptWind = new typescriptModule.WindAction({ id: "wind-instanceof" });
  assert.equal(sourceWind instanceof sourceModule.WindAction, true);
  assert.equal(sourceWind instanceof sourceModule.ClimaticAction, true);
  assert.equal(sourceWind instanceof sourceModule.VariableAction, true);
  assert.equal(sourceWind instanceof sourceModule.Action, true);
  assert.equal(typescriptWind instanceof typescriptModule.WindAction, true);
  assert.equal(typescriptWind instanceof typescriptModule.ClimaticAction, true);
  assert.equal(typescriptWind instanceof typescriptModule.VariableAction, true);
  assert.equal(typescriptWind instanceof typescriptModule.Action, true);

  const errorCases: readonly [string, (module: RuntimeActionModule) => unknown][] = [
    ["abstract action", (module) => new module.Action({ id: "abstract", nature: "variable" })],
    ["missing action id", (module) => new module.VariableAction({ id: "" })],
    ["missing variable input", (module) => new module.VariableAction(undefined)],
    ["missing climatic id", (module) => new module.ClimaticAction()],
    ["missing imposed input", (module) => new module.ImposedAction(undefined)],
    [
      "unsupported combination factor",
      (module) => new module.VariableAction({ id: "errors" }).getCombinationFactor("psi9"),
    ],
    [
      "unsupported partial-factor set",
      (module) => new module.VariableAction({ id: "errors" }).getPartialFactor(),
    ],
    [
      "unsupported partial-factor effect",
      (module) =>
        new module.VariableAction({
          id: "errors",
          partialFactors: { A1: { favourable: 0.8 } },
        }).getPartialFactor({ effect: "unfavourable" }),
    ],
  ];

  for (const [label, invoke] of errorCases) {
    compareValues(
      captureError(() => invoke(sourceModule)),
      captureError(() => invoke(typescriptModule)),
      `errors.${label}`,
    );
  }
});
