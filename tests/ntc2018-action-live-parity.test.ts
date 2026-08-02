import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = process.env.STRUTTURE_JS_BASELINE_PATH
  ? path.resolve(process.env.STRUTTURE_JS_BASELINE_PATH)
  : path.resolve(repositoryRoot, "..", "strutture-js");
const sourceRevision = "6f33baead8b88166c4b2cf94af41763412e3c751";

interface RuntimeAction {
  readonly getCombinationFactor: (kind?: string) => unknown;
  readonly getPartialFactor: (options?: unknown) => unknown;
  readonly toJSON: () => unknown;
}

type RuntimeActionConstructor = new (options?: unknown) => RuntimeAction;

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

interface RuntimeFactoryModule {
  readonly getNTC2018ActionCombinationFactors: (category: unknown) => unknown;
  readonly getNTC2018ActionPartialFactors: (options: unknown) => unknown;
  readonly getNTC2018LoadDurationClass: (actionKey: unknown) => unknown;
  readonly getNTC2018LoadDurationDefinition: (durationClass: unknown) => unknown;
  readonly resolveNTC2018GoverningLoadDuration: (actions?: unknown) => unknown;
  readonly getNTC2018TimberKmod: (options: unknown) => unknown;
  readonly createNTC2018PermanentAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018VariableAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018SnowAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018WindAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018ThermalAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018AccidentalAction: (options: unknown) => RuntimeAction;
  readonly createNTC2018SeismicAction: (options: unknown) => RuntimeAction;
}

interface RuntimeParameterModule {
  readonly NTC2018_ACTION_COMBINATION_FACTORS: unknown;
  readonly NTC2018_ACTION_PARTIAL_FACTORS: unknown;
  readonly NTC2018_CASE_BY_CASE_COMBINATION_CATEGORIES: unknown;
  readonly NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION: unknown;
  readonly NTC2018_LOAD_DURATION_CLASSES: unknown;
  readonly NTC2018_TIMBER_KMOD: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertRuntimeActionModule(value: unknown): asserts value is RuntimeActionModule {
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

function assertRuntimeFactoryModule(value: unknown): asserts value is RuntimeFactoryModule {
  assert.ok(isRecord(value));
  for (const name of [
    "getNTC2018ActionCombinationFactors",
    "getNTC2018ActionPartialFactors",
    "getNTC2018LoadDurationClass",
    "getNTC2018LoadDurationDefinition",
    "resolveNTC2018GoverningLoadDuration",
    "getNTC2018TimberKmod",
    "createNTC2018PermanentAction",
    "createNTC2018VariableAction",
    "createNTC2018SnowAction",
    "createNTC2018WindAction",
    "createNTC2018ThermalAction",
    "createNTC2018AccidentalAction",
    "createNTC2018SeismicAction",
  ]) {
    assert.equal(typeof value[name], "function", `${name} must be exported`);
  }
}

function assertRuntimeParameterModule(value: unknown): asserts value is RuntimeParameterModule {
  assert.ok(isRecord(value));
  for (const name of [
    "NTC2018_ACTION_COMBINATION_FACTORS",
    "NTC2018_ACTION_PARTIAL_FACTORS",
    "NTC2018_CASE_BY_CASE_COMBINATION_CATEGORIES",
    "NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION",
    "NTC2018_LOAD_DURATION_CLASSES",
    "NTC2018_TIMBER_KMOD",
  ]) {
    assert.ok(Object.hasOwn(value, name), `${name} must be exported`);
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
  const compare = (left: unknown, right: unknown, valuePath: string): void => {
    if (typeof left === "number" || typeof right === "number") {
      assert.equal(typeof left, "number", `${label}${valuePath}`);
      assert.equal(typeof right, "number", `${label}${valuePath}`);
      if (typeof left !== "number" || typeof right !== "number") return;
      assert.equal(left, right, `${label}${valuePath}`);
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
    if (Array.isArray(left) || Array.isArray(right)) {
      assert.ok(Array.isArray(left) && Array.isArray(right), `${label}${valuePath}`);
      if (!Array.isArray(left) || !Array.isArray(right)) return;
      assert.equal(left.length, right.length, `${label}${valuePath}.length`);
      left.forEach((entry, index) => compare(entry, right[index], `${valuePath}[${index}]`));
      return;
    }
    if (isRecord(left) || isRecord(right)) {
      assert.ok(isRecord(left) && isRecord(right), `${label}${valuePath}`);
      if (!isRecord(left) || !isRecord(right)) return;
      assert.deepEqual(
        Object.keys(left).sort(),
        Object.keys(right).sort(),
        `${label}${valuePath}.keys`,
      );
      for (const key of Object.keys(left)) compare(left[key], right[key], `${valuePath}.${key}`);
      return;
    }
    assert.deepEqual(left, right, `${label}${valuePath}`);
  };

  compare(source, typescript, "$");
  assert.equal(JSON.stringify(source), JSON.stringify(typescript), `${label}: exact JSON`);
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

function compareErrors(
  label: string,
  sourceInvoke: () => unknown,
  typescriptInvoke: () => unknown,
): void {
  compareValues(captureError(sourceInvoke), captureError(typescriptInvoke), `errors.${label}`);
}

function mutateNestedFactor(value: unknown): void {
  assert.ok(isRecord(value));
  if (!isRecord(value)) return;
  const a1 = value.A1;
  assert.ok(isRecord(a1));
  if (isRecord(a1)) a1.unfavourable = 99;
}

const sourceActionModuleValue: unknown = await import(
  pathToFileURL(path.join(sourceRoot, "src", "domain", "actions", "index.js")).href
);
const typescriptActionModuleValue: unknown = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "domain", "actions", "index.js")).href
);
const sourceFactoryModuleValue: unknown = await import(
  pathToFileURL(
    path.join(sourceRoot, "src", "norms", "ntc2018", "actions", "createNTC2018Action.js"),
  ).href
);
const typescriptFactoryModuleValue: unknown = await import(
  pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href
);
const sourceParameterModuleValue: unknown = await import(
  pathToFileURL(
    path.join(sourceRoot, "src", "norms", "ntc2018", "actions", "ntc2018ActionParameters.js"),
  ).href
);
const typescriptParameterModuleValue: unknown = await import(
  pathToFileURL(
    path.join(repositoryRoot, "dist", "norms", "ntc2018", "actions", "ntc2018ActionParameters.js"),
  ).href
);

assertRuntimeActionModule(sourceActionModuleValue);
assertRuntimeActionModule(typescriptActionModuleValue);
assertRuntimeFactoryModule(sourceFactoryModuleValue);
assertRuntimeFactoryModule(typescriptFactoryModuleValue);
assertRuntimeParameterModule(typescriptFactoryModuleValue);
assertRuntimeParameterModule(sourceParameterModuleValue);
assertRuntimeParameterModule(typescriptParameterModuleValue);

const sourceActionModule = sourceActionModuleValue;
const typescriptActionModule = typescriptActionModuleValue;
const sourceFactoryModule = sourceFactoryModuleValue;
const typescriptFactoryModule = typescriptFactoryModuleValue;
const sourceParameterModule = sourceParameterModuleValue;
const typescriptParameterModule = typescriptParameterModuleValue;

void test("NTC 2018 parameter catalogs match exact live JavaScript values", () => {
  assertSourceBaseline();

  for (const name of [
    "NTC2018_ACTION_COMBINATION_FACTORS",
    "NTC2018_ACTION_PARTIAL_FACTORS",
    "NTC2018_CASE_BY_CASE_COMBINATION_CATEGORIES",
    "NTC2018_DEFAULT_DURATION_CLASS_BY_ACTION",
    "NTC2018_LOAD_DURATION_CLASSES",
    "NTC2018_TIMBER_KMOD",
  ] as const) {
    compareValues(sourceParameterModule[name], typescriptParameterModule[name], name);
    compareValues(
      sourceParameterModule[name],
      typescriptFactoryModule[name],
      `${name}.root-export`,
    );
  }

  const sourceCombination = sourceFactoryModule.getNTC2018ActionCombinationFactors("E");
  const typescriptCombination = typescriptFactoryModule.getNTC2018ActionCombinationFactors("E");
  compareValues(sourceCombination, typescriptCombination, "combination-clone");
  if (isRecord(sourceCombination)) sourceCombination.psi0 = 0;
  if (isRecord(typescriptCombination)) typescriptCombination.psi0 = 0;
  compareValues(
    sourceParameterModule.NTC2018_ACTION_COMBINATION_FACTORS,
    typescriptParameterModule.NTC2018_ACTION_COMBINATION_FACTORS,
    "combination-table-after-clone",
  );

  const sourcePartial = sourceFactoryModule.getNTC2018ActionPartialFactors({
    nature: "variable",
    family: "wind",
  });
  const typescriptPartial = typescriptFactoryModule.getNTC2018ActionPartialFactors({
    nature: "variable",
    family: "wind",
  });
  compareValues(sourcePartial, typescriptPartial, "partial-clone");
  mutateNestedFactor(sourcePartial);
  mutateNestedFactor(typescriptPartial);
  compareValues(
    sourceParameterModule.NTC2018_ACTION_PARTIAL_FACTORS,
    typescriptParameterModule.NTC2018_ACTION_PARTIAL_FACTORS,
    "partial-table-after-clone",
  );
});

void test("NTC 2018 action factories match independent serialization and inheritance", () => {
  const commonMetadata = {
    source: "Scheda d'azione § 7.4 – Δ",
    unicode: "àèìòù € Δ",
    nested: { reference: "source-compatible metadata" },
  };
  const scenarios: readonly [
    string,
    (module: RuntimeFactoryModule) => RuntimeAction,
    (module: RuntimeFactoryModule) => RuntimeAction,
  ][] = [
    [
      "permanent",
      (module) =>
        module.createNTC2018PermanentAction({
          id: "ACT-G2",
          name: "Azione permanente § Δ",
          permanentClass: "G2",
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018PermanentAction({
          id: "ACT-G2",
          name: "Azione permanente § Δ",
          permanentClass: "G2",
          metadata: commonMetadata,
        }),
    ],
    [
      "imposed",
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QB",
          category: "B",
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QB",
          category: "B",
          metadata: commonMetadata,
        }),
    ],
    [
      "traffic",
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QF",
          category: "F",
          family: "traffic",
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QF",
          category: "F",
          family: "traffic",
          metadata: commonMetadata,
        }),
    ],
    [
      "snow-high",
      (module) =>
        module.createNTC2018SnowAction({
          id: "ACT-SNOW",
          highAltitude: true,
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018SnowAction({
          id: "ACT-SNOW",
          highAltitude: true,
          metadata: commonMetadata,
        }),
    ],
    [
      "wind",
      (module) => module.createNTC2018WindAction({ id: "ACT-W", metadata: commonMetadata }),
      (module) => module.createNTC2018WindAction({ id: "ACT-W", metadata: commonMetadata }),
    ],
    [
      "thermal",
      (module) => module.createNTC2018ThermalAction({ id: "ACT-T", metadata: commonMetadata }),
      (module) => module.createNTC2018ThermalAction({ id: "ACT-T", metadata: commonMetadata }),
    ],
    [
      "accidental",
      (module) => module.createNTC2018AccidentalAction({ id: "ACT-A", metadata: commonMetadata }),
      (module) => module.createNTC2018AccidentalAction({ id: "ACT-A", metadata: commonMetadata }),
    ],
    [
      "seismic",
      (module) => module.createNTC2018SeismicAction({ id: "ACT-E", metadata: commonMetadata }),
      (module) => module.createNTC2018SeismicAction({ id: "ACT-E", metadata: commonMetadata }),
    ],
    [
      "case-by-case",
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QI",
          category: "I",
          loadDurationClass: "short",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "Project load specification § Δ" },
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-QI",
          category: "I",
          loadDurationClass: "short",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "Project load specification § Δ" },
          metadata: commonMetadata,
        }),
    ],
    [
      "generic-climatic-family",
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-CUSTOM",
          category: "C",
          family: "climatic",
          metadata: commonMetadata,
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "ACT-CUSTOM",
          category: "C",
          family: "climatic",
          metadata: commonMetadata,
        }),
    ],
  ];

  for (const [label, createSourceAction, createTypescriptAction] of scenarios) {
    const sourceAction = createSourceAction(sourceFactoryModule);
    const typescriptAction = createTypescriptAction(typescriptFactoryModule);
    assert.equal(sourceAction.constructor.name, typescriptAction.constructor.name, label);
    compareValues(sourceAction.toJSON(), typescriptAction.toJSON(), `${label}.json`);
    assert.equal(
      JSON.stringify(sourceAction.toJSON()),
      JSON.stringify(typescriptAction.toJSON()),
      `${label}.exact-json`,
    );
  }

  const sourceWind = sourceFactoryModule.createNTC2018WindAction({ id: "ACT-W-INSTANCE" });
  const typescriptWind = typescriptFactoryModule.createNTC2018WindAction({
    id: "ACT-W-INSTANCE",
  });
  assert.equal(sourceWind instanceof sourceActionModule.WindAction, true);
  assert.equal(sourceWind instanceof sourceActionModule.ClimaticAction, true);
  assert.equal(sourceWind instanceof sourceActionModule.VariableAction, true);
  assert.equal(sourceWind instanceof sourceActionModule.Action, true);
  assert.equal(typescriptWind instanceof typescriptActionModule.WindAction, true);
  assert.equal(typescriptWind instanceof typescriptActionModule.ClimaticAction, true);
  assert.equal(typescriptWind instanceof typescriptActionModule.VariableAction, true);
  assert.equal(typescriptWind instanceof typescriptActionModule.Action, true);
});

void test("NTC 2018 action helper values and errors match exactly", () => {
  const helperCases: readonly [
    string,
    (module: RuntimeFactoryModule) => unknown,
    (module: RuntimeFactoryModule) => unknown,
  ][] = [
    [
      "duration-class",
      (module) => module.getNTC2018LoadDurationClass("WIND"),
      (module) => module.getNTC2018LoadDurationClass("WIND"),
    ],
    [
      "duration-definition",
      (module) => module.getNTC2018LoadDurationDefinition("short"),
      (module) => module.getNTC2018LoadDurationDefinition("short"),
    ],
    [
      "governing-duration",
      (module) =>
        module.resolveNTC2018GoverningLoadDuration([
          { loadDurationClass: "permanent" },
          { loadDurationClass: "short" },
          { loadDurationClass: "instantaneous" },
        ]),
      (module) =>
        module.resolveNTC2018GoverningLoadDuration([
          { loadDurationClass: "permanent" },
          { loadDurationClass: "short" },
          { loadDurationClass: "instantaneous" },
        ]),
    ],
    [
      "default-governing-duration",
      (module) => module.resolveNTC2018GoverningLoadDuration(null),
      (module) => module.resolveNTC2018GoverningLoadDuration(null),
    ],
    [
      "timber-kmod",
      (module) =>
        module.getNTC2018TimberKmod({
          materialType: "solid_timber",
          serviceClass: 2,
          loadDurationClass: "medium",
        }),
      (module) =>
        module.getNTC2018TimberKmod({
          materialType: "solid_timber",
          serviceClass: 2,
          loadDurationClass: "medium",
        }),
    ],
  ];

  for (const [label, sourceCall, typescriptCall] of helperCases) {
    compareValues(sourceCall(sourceFactoryModule), typescriptCall(typescriptFactoryModule), label);
  }

  const errorCases: readonly [
    string,
    (module: RuntimeFactoryModule) => unknown,
    (module: RuntimeFactoryModule) => unknown,
  ][] = [
    [
      "unsupported-category",
      (module) => module.getNTC2018ActionCombinationFactors("UNKNOWN"),
      (module) => module.getNTC2018ActionCombinationFactors("UNKNOWN"),
    ],
    [
      "unsupported-permanent-class",
      (module) =>
        module.getNTC2018ActionPartialFactors({ nature: "permanent", permanentClass: "G3" }),
      (module) =>
        module.getNTC2018ActionPartialFactors({ nature: "permanent", permanentClass: "G3" }),
    ],
    [
      "unsupported-family",
      (module) => module.getNTC2018ActionPartialFactors({ nature: "variable", family: "unknown" }),
      (module) => module.getNTC2018ActionPartialFactors({ nature: "variable", family: "unknown" }),
    ],
    [
      "unsupported-action-key",
      (module) => module.getNTC2018LoadDurationClass("UNKNOWN"),
      (module) => module.getNTC2018LoadDurationClass("UNKNOWN"),
    ],
    [
      "unsupported-duration-class",
      (module) => module.getNTC2018LoadDurationDefinition("unknown"),
      (module) => module.getNTC2018LoadDurationDefinition("unknown"),
    ],
    [
      "unsupported-timber-material",
      (module) =>
        module.getNTC2018TimberKmod({ materialType: "unknown", loadDurationClass: "short" }),
      (module) =>
        module.getNTC2018TimberKmod({ materialType: "unknown", loadDurationClass: "short" }),
    ],
    [
      "unsupported-timber-service-class",
      (module) => module.getNTC2018TimberKmod({ serviceClass: 4, loadDurationClass: "short" }),
      (module) => module.getNTC2018TimberKmod({ serviceClass: 4, loadDurationClass: "short" }),
    ],
    [
      "unsupported-timber-duration",
      (module) => module.getNTC2018TimberKmod({ loadDurationClass: "unknown" }),
      (module) => module.getNTC2018TimberKmod({ loadDurationClass: "unknown" }),
    ],
    [
      "case-by-case-source-required",
      (module) =>
        module.createNTC2018VariableAction({ id: "QI", category: "I", loadDurationClass: "short" }),
      (module) =>
        module.createNTC2018VariableAction({ id: "QI", category: "I", loadDurationClass: "short" }),
    ],
    [
      "case-by-case-duration-required",
      (module) =>
        module.createNTC2018VariableAction({
          id: "QI",
          category: "I",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "QI",
          category: "I",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
    ],
    [
      "invalid-case-by-case-factor",
      (module) =>
        module.createNTC2018VariableAction({
          id: "QI",
          category: "I",
          loadDurationClass: "short",
          combinationFactors: { psi0: 1.1, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "QI",
          category: "I",
          loadDurationClass: "short",
          combinationFactors: { psi0: 1.1, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
    ],
    [
      "explicit-factors-for-catalog-category",
      (module) =>
        module.createNTC2018VariableAction({
          id: "QB",
          category: "B",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
      (module) =>
        module.createNTC2018VariableAction({
          id: "QB",
          category: "B",
          combinationFactors: { psi0: 0.7, psi1: 0.5, psi2: 0.3 },
          combinationFactorsSource: { reference: "LOAD-001" },
        }),
    ],
    [
      "missing-variable-category",
      (module) => module.createNTC2018VariableAction({ id: "missing-category" }),
      (module) => module.createNTC2018VariableAction({ id: "missing-category" }),
    ],
    [
      "missing-permanent-id",
      (module) => module.createNTC2018PermanentAction({ id: "" }),
      (module) => module.createNTC2018PermanentAction({ id: "" }),
    ],
    [
      "invalid-governing-duration",
      (module) => module.resolveNTC2018GoverningLoadDuration([{ loadDurationClass: "unknown" }]),
      (module) => module.resolveNTC2018GoverningLoadDuration([{ loadDurationClass: "unknown" }]),
    ],
  ];

  for (const [label, sourceCall, typescriptCall] of errorCases) {
    compareErrors(
      label,
      () => sourceCall(sourceFactoryModule),
      () => typescriptCall(typescriptFactoryModule),
    );
  }

  const actionErrorCases: readonly [
    string,
    (module: RuntimeActionModule) => unknown,
    (module: RuntimeActionModule) => unknown,
  ][] = [
    [
      "action-combination-factor",
      (module) => new module.VariableAction({ id: "errors" }).getCombinationFactor("psi9"),
      (module) => new module.VariableAction({ id: "errors" }).getCombinationFactor("psi9"),
    ],
    [
      "action-partial-factor",
      (module) => new module.VariableAction({ id: "errors" }).getPartialFactor(),
      (module) => new module.VariableAction({ id: "errors" }).getPartialFactor(),
    ],
  ];

  for (const [label, sourceCall, typescriptCall] of actionErrorCases) {
    compareErrors(
      label,
      () => sourceCall(sourceActionModule),
      () => typescriptCall(typescriptActionModule),
    );
  }
});
