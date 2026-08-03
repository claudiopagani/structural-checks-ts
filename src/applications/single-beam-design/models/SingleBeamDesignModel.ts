export interface SingleBeamDesignUnitSystem {
  force: string;
  length: string;
}

export type SingleBeamDesignMetadata = Record<string, unknown>;

export interface SingleBeamAnalysisInputDto extends Record<string, unknown> {
  id?: string;
  units?: SingleBeamDesignUnitSystem;
  geometry?: Record<string, unknown>;
  supports?: unknown;
  loads?: unknown;
  combinations?: unknown;
  discretization?: Record<string, unknown>;
  verificationStations?: unknown;
  sectionRotation?: Record<string, unknown>;
}

export interface SingleBeamDesignModelInput {
  id?: string;
  title?: string | null;
  description?: string;
  units?: SingleBeamDesignUnitSystem | null;
  beamInput?: SingleBeamAnalysisInputDto | null;
  section?: unknown;
  material?: unknown;
  verification?: unknown;
  report?: Record<string, unknown> | null;
  metadata?: SingleBeamDesignMetadata | null;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
  );
}

function propertyValue(value: unknown, key: string): unknown {
  if (isObjectLike(value)) {
    return value[key];
  }

  if (key !== "constructor") {
    return undefined;
  }

  switch (typeof value) {
    case "string":
      return String;
    case "number":
      return Number;
    case "boolean":
      return Boolean;
    case "bigint":
      return BigInt;
    case "symbol":
      return Symbol;
    default:
      return undefined;
  }
}

function constructorName(value: unknown, fallback: string): unknown {
  const constructor = propertyValue(value, "constructor");
  return propertyValue(constructor, "name") ?? fallback;
}

function constructorNameOrNull(value: unknown): unknown {
  const constructor = propertyValue(value, "constructor");
  return propertyValue(constructor, "name") ?? null;
}

function functionName(value: unknown): unknown {
  return propertyValue(value, "name") || null;
}

function invokeToJSON(value: object): { found: boolean; result: unknown } {
  const candidate = propertyValue(value, "toJSON");
  if (typeof candidate !== "function") {
    return { found: false, result: undefined };
  }

  return {
    found: true,
    result: Reflect.apply(candidate, value, []),
  };
}

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return {
      type: "function",
      name: functionName(value),
    };
  }

  if (typeof value !== "object") {
    if (typeof value === "bigint" || typeof value === "symbol") {
      return String(value);
    }
    return value;
  }

  if (seen.has(value)) {
    return {
      type: "circular-reference",
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen));
  }

  if (!isPlainObject(value)) {
    const toJSON = invokeToJSON(value);
    if (toJSON.found) {
      return toSerializable(toJSON.result, seen);
    }
  }

  const output: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = toSerializable(item, seen);
  }

  return output;
}

function toSerializableRecord(value: unknown): Record<string, unknown> {
  const serialized = toSerializable(value);
  return isObjectLike(serialized) && !Array.isArray(serialized) ? serialized : {};
}

function describeProvider(provider: unknown): Record<string, unknown> | null {
  if (!provider) {
    return null;
  }

  return {
    type: constructorName(provider, "SectionProvider"),
    metadata: toSerializable(propertyValue(provider, "metadata") ?? null),
  };
}

function serializeBeamInput(input: SingleBeamAnalysisInputDto = {}): Record<string, unknown> {
  const { sectionProvider, elementClass, linearSolver, ...serializableInput } = input;

  return {
    ...toSerializableRecord(serializableInput),
    sectionProvider: describeProvider(sectionProvider),
    elementClass: propertyValue(elementClass, "name") ?? null,
    linearSolver: constructorNameOrNull(linearSolver),
  };
}

function serializeVerification(verification: unknown): Record<string, unknown> | null {
  if (!verification) {
    return null;
  }

  if (typeof verification === "function") {
    return {
      type: "function",
      name: functionName(verification),
    };
  }

  const verifier = propertyValue(verification, "verifier") ?? verification;

  return {
    type: constructorName(verifier, "Verifier"),
    input: toSerializable(propertyValue(verification, "input") ?? null),
    metadata: toSerializable(propertyValue(verification, "metadata") ?? null),
  };
}

export class SingleBeamDesignModel {
  id: string;
  title: string;
  description: string;
  units: SingleBeamDesignUnitSystem | null;
  beamInput: SingleBeamAnalysisInputDto;
  section: unknown;
  material: unknown;
  verification: unknown;
  report: Record<string, unknown>;
  metadata: SingleBeamDesignMetadata;

  constructor({
    id,
    title = null,
    description = "",
    units = null,
    beamInput = null,
    section = null,
    material = null,
    verification = null,
    report = {},
    metadata = {},
  }: SingleBeamDesignModelInput = {}) {
    if (!id) {
      throw new Error("SingleBeamDesignModel requires an id.");
    }

    if (!beamInput) {
      throw new Error("SingleBeamDesignModel requires a beamInput.");
    }

    this.id = id;
    this.title = title ?? id;
    this.description = description;
    this.units = units ?? beamInput.units ?? null;
    this.beamInput = {
      id,
      ...beamInput,
    };
    this.section = section;
    this.material = material;
    this.verification = verification;
    this.report = { ...report };
    this.metadata = { ...metadata };
  }

  toAnalysisInput(): SingleBeamAnalysisInputDto {
    return {
      ...this.beamInput,
      id: this.beamInput.id ?? this.id,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      units: toSerializable(this.units),
      beamInput: serializeBeamInput(this.beamInput),
      section: toSerializable(this.section),
      material: toSerializable(this.material),
      verification: serializeVerification(this.verification),
      report: toSerializable(this.report),
      metadata: toSerializable(this.metadata),
    };
  }
}
