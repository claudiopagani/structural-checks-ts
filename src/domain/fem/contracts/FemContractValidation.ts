// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
import type {
  FemAxes,
  FemDiagnostic,
  FemIdentified,
  FemJsonValue,
  FemUnitSystem,
  FemValidationResult,
  FemVector3,
} from "./FemContractTypes.js";

export const GLOBAL_FEM_CONTRACT_VERSION = 0 as const;

export const FEM_CONTRACT_SCHEMAS = Object.freeze({
  capabilities: "strutture-js/fem-capabilities",
  model: "strutture-js/global-fem-model",
  analysis: "strutture-js/global-fem-analysis",
  mapping: "strutture-js/fem-entity-mapping",
  result: "strutture-js/global-fem-result",
} as const);

export const FEM_ANALYSIS_CAPABILITY_KEYS = Object.freeze([
  "linearStatic",
  "secondOrder",
  "modal",
  "responseSpectrum",
  "nonlinearStatic",
  "timeHistory",
] as const);

export const FEM_ELEMENT_CAPABILITY_KEYS = Object.freeze([
  "line",
  "shell",
  "solid",
  "link",
] as const);

export const FEM_RESULT_CAPABILITY_KEYS = Object.freeze([
  "nodalDisplacements",
  "reactions",
  "lineElementActions",
  "shellResultants",
  "stresses",
  "strains",
  "modes",
  "sectionCuts",
  "storeyResults",
  "equilibriumResiduals",
] as const);

export const FEM_ANALYSIS_TYPES = Object.freeze([
  "linear-static",
  "second-order-static",
  "modal",
  "response-spectrum",
  "nonlinear-static",
  "time-history",
] as const);

export const FEM_RESULT_STATUS_VALUES = Object.freeze([
  "completed",
  "completed-with-warnings",
  "partial",
  "failed",
  "not-supported",
] as const);

export const GLOBAL_FEM_REQUIRED_UNIT_KEYS = Object.freeze([
  "length",
  "force",
  "mass",
  "time",
  "angle",
  "moment",
  "stress",
  "strain",
  "acceleration",
  "frequency",
  "lineForce",
  "lineMoment",
] as const);

type FemErrorList = FemDiagnostic[];
type FemStringList = readonly string[];
type FemRecord = Record<string, unknown>;
type FemNumberOptions = {
  readonly positive?: boolean;
  readonly nonNegative?: boolean;
  readonly integer?: boolean;
};
type FemValidationOptions = { readonly required?: boolean };

const AMBIGUOUS_UNIT_TOKENS = new Set([
  "",
  "-",
  "?",
  "default",
  "metric",
  "si",
  "unspecified",
  "unknown",
]);

export function diagnostic(code: string, path: string, message: string): FemDiagnostic {
  return { code, path, message };
}

export function addError(errors: FemErrorList, code: string, path: string, message: string): void {
  errors.push(diagnostic(code, path, message));
}

export function addWarning(
  warnings: FemErrorList,
  code: string,
  path: string,
  message: string,
): void {
  warnings.push(diagnostic(code, path, message));
}

export function isRecord(value: unknown): value is FemRecord;
export function isRecord(value: unknown): value is FemRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateRecord(
  value: unknown,
  path: string,
  errors: FemErrorList,
  { required = true }: FemValidationOptions = {},
): value is FemRecord {
  if (value == null && !required) return false;
  if (isRecord(value)) return true;

  addError(errors, "FEM_EXPECTED_OBJECT", path, `${path} must be a plain object.`);
  return false;
}

export function validateArray<T = unknown>(
  value: unknown,
  path: string,
  errors: FemErrorList,
  { required = true }: FemValidationOptions = {},
): value is readonly T[] {
  if (value == null && !required) return false;
  if (Array.isArray(value)) return true;

  addError(errors, "FEM_EXPECTED_ARRAY", path, `${path} must be an array.`);
  return false;
}

export function validateId(value: unknown, path: string, errors: FemErrorList): value is string {
  if (typeof value === "string" && value.trim().length > 0) return true;

  addError(errors, "FEM_INVALID_ID", path, `${path} must be a non-empty stable string identifier.`);
  return false;
}

export function validateString(
  value: unknown,
  path: string,
  errors: FemErrorList,
  { allowed = null }: { readonly allowed?: FemStringList | null } = {},
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    addError(errors, "FEM_INVALID_STRING", path, `${path} must be a non-empty string.`);
    return false;
  }

  if (allowed && !allowed.includes(value)) {
    addError(
      errors,
      "FEM_UNSUPPORTED_VALUE",
      path,
      `${path} must be one of: ${allowed.join(", ")}.`,
    );
    return false;
  }

  return true;
}

export function validateBoolean(
  value: unknown,
  path: string,
  errors: FemErrorList,
): value is boolean {
  if (typeof value === "boolean") return true;

  addError(errors, "FEM_EXPLICIT_BOOLEAN_REQUIRED", path, `${path} must be true or false.`);
  return false;
}

export function validateFinite(
  value: unknown,
  path: string,
  errors: FemErrorList,
  { positive = false, nonNegative = false, integer = false }: FemNumberOptions = {},
): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(errors, "FEM_NON_FINITE_NUMBER", path, `${path} must be finite.`);
    return false;
  }
  if (positive && value <= 0) {
    addError(errors, "FEM_POSITIVE_NUMBER_REQUIRED", path, `${path} must be positive.`);
    return false;
  }
  if (nonNegative && value < 0) {
    addError(errors, "FEM_NON_NEGATIVE_NUMBER_REQUIRED", path, `${path} must be non-negative.`);
    return false;
  }
  if (integer && !Number.isInteger(value)) {
    addError(errors, "FEM_INTEGER_REQUIRED", path, `${path} must be an integer.`);
    return false;
  }

  return true;
}

export function validateFiniteVector(
  value: unknown,
  path: string,
  errors: FemErrorList,
): value is FemVector3 {
  if (!validateRecord(value, path, errors)) return false;

  let valid = true;
  for (const component of ["x", "y", "z"] as const) {
    valid = validateFinite(value[component], `${path}.${component}`, errors) && valid;
  }
  return valid;
}

function vectorNorm(vector: FemVector3): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

function dot(left: FemVector3, right: FemVector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: FemVector3, right: FemVector3): FemVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function validateAxes(
  axes: unknown,
  path: string,
  errors: FemErrorList,
  { tolerance = 1e-8 }: { readonly tolerance?: number } = {},
): axes is FemAxes {
  if (!validateRecord(axes, path, errors)) return false;

  const x = axes.x;
  const y = axes.y;
  const z = axes.z;
  const validVectors = [
    validateFiniteVector(x, `${path}.x`, errors),
    validateFiniteVector(y, `${path}.y`, errors),
    validateFiniteVector(z, `${path}.z`, errors),
  ];

  if (validVectors.some((valid) => !valid) || !isVector3(x) || !isVector3(y) || !isVector3(z)) {
    return false;
  }
  const frame: FemAxes = { x, y, z };

  let valid = true;
  for (const axis of ["x", "y", "z"] as const) {
    const norm = vectorNorm(frame[axis]);
    if (Math.abs(norm - 1) > tolerance) {
      addError(
        errors,
        "FEM_AXIS_NOT_UNIT",
        `${path}.${axis}`,
        `${path}.${axis} must be a unit vector; received norm ${norm}.`,
      );
      valid = false;
    }
  }

  for (const [left, right] of [
    ["x", "y"],
    ["y", "z"],
    ["z", "x"],
  ] as const) {
    const scalarProduct = dot(frame[left], frame[right]);
    if (Math.abs(scalarProduct) > tolerance) {
      addError(
        errors,
        "FEM_AXES_NOT_ORTHOGONAL",
        path,
        `${path}.${left} and ${path}.${right} must be orthogonal.`,
      );
      valid = false;
    }
  }

  const handedness = dot(cross(frame.x, frame.y), frame.z);
  if (Math.abs(handedness - 1) > tolerance) {
    addError(
      errors,
      "FEM_AXES_NOT_RIGHT_HANDED",
      path,
      `${path} must be a non-degenerate right-handed orthonormal frame.`,
    );
    valid = false;
  }

  return valid;
}

function isVector3(value: unknown): value is FemVector3 {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.z === "number" &&
    Number.isFinite(value.z)
  );
}

export function validateUnits(
  units: unknown,
  path: string,
  errors: FemErrorList,
): units is FemUnitSystem {
  if (!validateRecord(units, path, errors)) return false;

  let valid = true;
  for (const key of GLOBAL_FEM_REQUIRED_UNIT_KEYS) {
    const unit = units[key];
    if (typeof unit !== "string" || AMBIGUOUS_UNIT_TOKENS.has(unit.trim().toLowerCase())) {
      addError(
        errors,
        "FEM_UNIT_MISSING_OR_AMBIGUOUS",
        `${path}.${key}`,
        `${path}.${key} must be an explicit, unambiguous unit symbol.`,
      );
      valid = false;
    }
  }
  return valid;
}

export function validateHeader<T extends object>(
  value: unknown,
  schema: string,
  errors: FemErrorList,
): value is T {
  if (!validateRecord(value, "$", errors)) return false;

  let valid = true;
  if (value.schema !== schema) {
    addError(errors, "FEM_SCHEMA_MISMATCH", "$.schema", `$.schema must be ${schema}.`);
    valid = false;
  }
  if (value.version !== GLOBAL_FEM_CONTRACT_VERSION) {
    addError(
      errors,
      "FEM_VERSION_MISMATCH",
      "$.version",
      `$.version must be the candidate schema version ${GLOBAL_FEM_CONTRACT_VERSION}.`,
    );
    valid = false;
  }
  return valid;
}

export function validateUniqueIds<T extends FemIdentified>(
  items: readonly T[] | null | undefined,
  path: string,
  errors: FemErrorList,
): Map<string, T>;
export function validateUniqueIds(
  items: readonly { readonly id: string }[] | null | undefined,
  path: string,
  errors: FemErrorList,
): Map<string, FemIdentified> {
  if (!Array.isArray(items)) return new Map<string, FemIdentified>();

  const index = new Map<string, { readonly id: string }>();
  items.forEach((item: { readonly id: string }, itemIndex: number) => {
    const itemPath = `${path}[${itemIndex}]`;
    const itemValue: unknown = item;
    if (!isRecord(itemValue)) {
      validateRecord(itemValue, itemPath, errors);
      return;
    }
    const itemId = item.id;
    if (!validateId(itemId, `${itemPath}.id`, errors)) return;

    if (index.has(itemId)) {
      addError(errors, "FEM_DUPLICATE_ID", `${itemPath}.id`, `Duplicate id ${itemId} in ${path}.`);
      return;
    }
    index.set(itemId, item);
  });
  return index;
}

export function validateIdArray(
  value: unknown,
  path: string,
  errors: FemErrorList,
  { minLength = 0 }: { readonly minLength?: number } = {},
): value is readonly string[] {
  if (!validateArray(value, path, errors)) return false;
  let valid = true;
  if (value.length < minLength) {
    addError(
      errors,
      "FEM_ARRAY_TOO_SHORT",
      path,
      `${path} must contain at least ${minLength} entries.`,
    );
    valid = false;
  }

  const seen = new Set<string>();
  value.forEach((id, index) => {
    if (!validateId(id, `${path}[${index}]`, errors)) {
      valid = false;
      return;
    }
    if (seen.has(id)) {
      addError(
        errors,
        "FEM_DUPLICATE_REFERENCE",
        `${path}[${index}]`,
        `${path} contains duplicate reference ${id}.`,
      );
      valid = false;
    }
    seen.add(id);
  });
  return valid;
}

export function validateReferences(
  ids: readonly unknown[] | null | undefined,
  targetIndex: ReadonlyMap<string, unknown>,
  path: string,
  errors: FemErrorList,
  targetLabel: string,
): void {
  if (!Array.isArray(ids)) return;
  ids.forEach((id, index) => {
    if (typeof id === "string" && !targetIndex.has(id)) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}[${index}]`,
        `${path}[${index}] references unknown ${targetLabel} ${id}.`,
      );
    }
  });
}

export function validateSerializable(
  value: unknown,
  path: string,
  errors: FemErrorList,
  ancestors: Set<object> = new Set<object>(),
): boolean {
  const valueType = typeof value;
  if (value === null || valueType === "string" || valueType === "boolean") return true;
  if (valueType === "number") {
    if (Number.isFinite(value)) return true;
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains a non-finite number.`);
    return false;
  }
  if (["undefined", "bigint", "function", "symbol"].includes(valueType)) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} is not JSON-serializable.`);
    return false;
  }
  if (typeof value !== "object" || value === null) return false;
  if (ancestors.has(value)) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains a circular reference.`);
    return false;
  }
  if (!Array.isArray(value) && !isRecord(value)) {
    addError(
      errors,
      "FEM_NOT_JSON_SERIALIZABLE",
      path,
      `${path} must contain only plain JSON values.`,
    );
    return false;
  }
  if (!Array.isArray(value) && Object.getOwnPropertySymbols(value).length > 0) {
    addError(errors, "FEM_NOT_JSON_SERIALIZABLE", path, `${path} contains symbol keys.`);
    return false;
  }

  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      valid = validateSerializable(entry, `${path}[${index}]`, errors, ancestors) && valid;
    });
  } else {
    for (const [key, entry] of Object.entries(value)) {
      valid = validateSerializable(entry, `${path}.${key}`, errors, ancestors) && valid;
    }
  }
  ancestors.delete(value);
  return valid;
}

function isJsonValue(value: unknown): value is FemJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export function cloneJson(value: unknown): FemJsonValue {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  if (!isJsonValue(cloned)) throw new Error("Expected a JSON-serializable value.");
  return cloned;
}

export function finalizeValidation<T>(
  value: unknown,
  errors: FemErrorList,
  warnings: FemErrorList,
): FemValidationResult<T> {
  const serializable = validateSerializable(value, "$", errors);
  return {
    ok: errors.length === 0,
    value: serializable ? (cloneJson(value) as T) : null,
    errors,
    warnings,
  };
}

export function withContractHeader(input: unknown, schema: string): FemRecord {
  return {
    ...(isRecord(input) ? input : {}),
    schema,
    version: GLOBAL_FEM_CONTRACT_VERSION,
  };
}

export function throwForInvalidContract<T>(label: string, validation: FemValidationResult<T>): T {
  if (validation.ok && validation.value !== null) return validation.value;

  const details = validation.errors
    .map((item) => `[${item.code}] ${item.path}: ${item.message}`)
    .join(" ");
  throw new Error(`Invalid ${label}: ${details}`);
}

export function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => sameJsonValue(entry, right[index]))
    );
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) => key === rightKeys[index] && sameJsonValue(left[key], right[key]),
      )
    );
  }
  return false;
}

export function indexById<T extends FemIdentified>(items: readonly T[] = []): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function vectorBetween(start: FemVector3, end: FemVector3): FemVector3 {
  return { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
}

export function normalized(vector: FemVector3): FemVector3 | null {
  const norm = vectorNorm(vector);
  if (!Number.isFinite(norm) || norm <= 0) return null;
  return { x: vector.x / norm, y: vector.y / norm, z: vector.z / norm };
}

export function dotProduct(left: FemVector3, right: FemVector3): number {
  return dot(left, right);
}

export function crossProduct(left: FemVector3, right: FemVector3): FemVector3 {
  return cross(left, right);
}
