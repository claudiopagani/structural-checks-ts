// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
import {
  FEM_CONTRACT_SCHEMAS,
  FEM_RESULT_CAPABILITY_KEYS,
  FEM_RESULT_STATUS_VALUES,
  addError,
  finalizeValidation,
  indexById,
  sameJsonValue,
  throwForInvalidContract,
  validateArray,
  validateBoolean,
  validateFinite,
  validateFiniteVector,
  validateHeader,
  validateId,
  validateRecord,
  validateString,
  validateUniqueIds,
  validateUnits,
  withContractHeader,
} from "./FemContractValidation.js";
import type {
  FemCapabilitiesContract,
  FemConvergenceEntry,
  FemDiagnostic,
  FemEquilibriumResidual,
  FemLineElementActionResult,
  FemModeResult,
  FemProcedure,
  FemResultCollections,
  FemResultCaseReference,
  FemResultLocation,
  FemPartialCoverage,
  FemSectionCutResult,
  FemShellResultantResult,
  FemStoreyResult,
  FemTensorResult,
  FemValidationResult,
  FemVector3,
  FemProvenance,
  FemResultCapabilityKey,
  FemResultCapabilities,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
  GlobalFemResultContract,
  FemEntityMappingContract,
} from "./FemContractTypes.js";

const RESULT_COLLECTION_BY_OUTPUT: Readonly<
  Record<FemResultCapabilityKey, FemResultCapabilityKey>
> = Object.freeze({
  nodalDisplacements: "nodalDisplacements",
  reactions: "reactions",
  lineElementActions: "lineElementActions",
  shellResultants: "shellResultants",
  stresses: "stresses",
  strains: "strains",
  modes: "modes",
  sectionCuts: "sectionCuts",
  storeyResults: "storeyResults",
  equilibriumResiduals: "equilibriumResiduals",
});
const LINE_ACTION_COMPONENTS = ["N", "Vy", "Vz", "T", "My", "Mz"];
const SHELL_RESULTANT_COMPONENTS = ["Nx", "Ny", "Nxy", "Mx", "My", "Mxy", "Vx", "Vy"];
const SIX_COMPONENTS = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"];

function validateResultCollections(results: FemResultCollections, errors: FemDiagnostic[]): void {
  if (!validateRecord(results, "$.results", errors)) return;
  for (const name of [...Object.values(RESULT_COLLECTION_BY_OUTPUT), "envelopes"]) {
    validateArray(results[name], `$.results.${name}`, errors, { required: false });
  }
}

function validateSignConventions(
  signConventions: Record<string, string>,
  results: FemResultCollections,
  capabilities: FemCapabilitiesContract | null,
  errors: FemDiagnostic[],
): void {
  if (!validateRecord(signConventions, "$.signConventions", errors)) return;

  const required = new Set<string>();
  const available: Partial<FemResultCapabilities> = capabilities?.results ?? {};
  if (
    available.nodalDisplacements ||
    available.modes ||
    results?.nodalDisplacements?.length ||
    results?.modes?.length
  ) {
    required.add("translations");
    required.add("rotations");
  }
  if (available.reactions || results?.reactions?.length) required.add("reactions");
  if (available.lineElementActions || results?.lineElementActions?.length) {
    required.add("lineActions");
  }
  if (
    available.shellResultants ||
    available.stresses ||
    available.strains ||
    results?.shellResultants?.length ||
    results?.stresses?.length ||
    results?.strains?.length
  ) {
    required.add("shellResultants");
  }
  if (available.sectionCuts || results?.sectionCuts?.length) required.add("sectionCuts");

  for (const key of required) {
    validateString(signConventions[key], `$.signConventions.${key}`, errors);
  }
}

function validateProvenance(
  provenance: FemProvenance,
  input: GlobalFemResultContract,
  context: { readonly capabilities: FemCapabilitiesContract | null },
  errors: FemDiagnostic[],
): void {
  if (!validateRecord(provenance, "$.provenance", errors)) return;
  if (validateRecord(provenance.solver, "$.provenance.solver", errors)) {
    validateId(provenance.solver.id, "$.provenance.solver.id", errors);
    validateString(provenance.solver.name, "$.provenance.solver.name", errors);
    validateString(provenance.solver.version, "$.provenance.solver.version", errors);
  }
  if (validateRecord(provenance.model, "$.provenance.model", errors)) {
    validateId(provenance.model.id, "$.provenance.model.id", errors);
    validateId(provenance.model.hash, "$.provenance.model.hash", errors);
    if (provenance.model.id !== input.modelId || provenance.model.hash !== input.modelHash) {
      addError(
        errors,
        "FEM_PROVENANCE_MISMATCH",
        "$.provenance.model",
        "Provenance model id/hash must match the result association.",
      );
    }
  }
  if (validateRecord(provenance.analysis, "$.provenance.analysis", errors)) {
    validateId(provenance.analysis.id, "$.provenance.analysis.id", errors);
    validateId(provenance.analysis.hash, "$.provenance.analysis.hash", errors);
    if (
      provenance.analysis.id !== input.analysisId ||
      provenance.analysis.hash !== input.analysisHash
    ) {
      addError(
        errors,
        "FEM_PROVENANCE_MISMATCH",
        "$.provenance.analysis",
        "Provenance analysis id/hash must match the result association.",
      );
    }
  }
  if (context.capabilities && provenance.solver.id !== context.capabilities.solver?.id) {
    addError(
      errors,
      "FEM_PROVENANCE_MISMATCH",
      "$.provenance.solver.id",
      "Provenance solver id must match the capability manifest solver id.",
    );
  }
}

function validateConvergence(
  convergence: readonly FemConvergenceEntry[] | undefined,
  procedureIndex: Map<string, FemProcedure> | null,
  errors: FemDiagnostic[],
): void {
  if (!validateArray(convergence, "$.convergence", errors)) return;
  const seen = new Set();
  convergence.forEach((entry, itemIndex) => {
    const path = `$.convergence[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    if (validateId(entry.procedureId, `${path}.procedureId`, errors)) {
      if (seen.has(entry.procedureId)) {
        addError(
          errors,
          "FEM_DUPLICATE_REFERENCE",
          `${path}.procedureId`,
          `Convergence for procedure ${entry.procedureId} is repeated.`,
        );
      }
      seen.add(entry.procedureId);
      if (procedureIndex && !procedureIndex.has(entry.procedureId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.procedureId`,
          `${path}.procedureId references unknown procedure ${entry.procedureId}.`,
        );
      }
    }
    validateBoolean(entry.converged, `${path}.converged`, errors);
    validateFinite(entry.iterations, `${path}.iterations`, errors, {
      nonNegative: true,
      integer: true,
    });
    validateFinite(entry.residualNorm, `${path}.residualNorm`, errors, {
      nonNegative: true,
    });
    validateFinite(entry.tolerance, `${path}.tolerance`, errors, { nonNegative: true });
    if (validateArray(entry.diagnostics, `${path}.diagnostics`, errors)) {
      entry.diagnostics.forEach((message, messageIndex) => {
        validateString(message, `${path}.diagnostics[${messageIndex}]`, errors);
      });
    }
  });
}

function validateProcedureReference(
  entry: FemResultCaseReferenceLike,
  path: string,
  procedureIndex: Map<string, FemProcedure> | null,
  errors: FemDiagnostic[],
  allowedTypes: readonly FemProcedure["type"][] | null = null,
): FemProcedure | null {
  if (!validateId(entry.procedureId, `${path}.procedureId`, errors)) return null;
  const procedure = procedureIndex?.get(entry.procedureId);
  if (procedureIndex && !procedure) {
    addError(
      errors,
      "FEM_UNKNOWN_REFERENCE",
      `${path}.procedureId`,
      `${path}.procedureId references unknown procedure ${entry.procedureId}.`,
    );
    return null;
  }
  if (procedure && allowedTypes && !allowedTypes.includes(procedure.type)) {
    addError(
      errors,
      "FEM_RESULT_PROCEDURE_MISMATCH",
      `${path}.procedureId`,
      `${path} is not valid for procedure type ${procedure.type}.`,
    );
  }
  return procedure ?? null;
}

interface ResultIndices {
  readonly procedures: Map<string, FemProcedure> | null;
  readonly loadCases: Map<string, { readonly id: string }> | null;
  readonly combinations: Map<string, { readonly id: string }> | null;
  readonly nodes: Map<string, { readonly id: string; readonly coordinates: FemVector3 }> | null;
  readonly lineElements: Map<
    string,
    { readonly id: string; readonly nodeIds: readonly string[] }
  > | null;
  readonly shellElements: Map<string, { readonly id: string }> | null;
  readonly sectionCuts: Map<string, { readonly id: string }> | null;
  readonly storeys: Map<string, { readonly id: string }> | null;
  readonly diaphragms: Map<string, { readonly id: string }> | null;
}

interface FemResultCaseReferenceLike extends FemResultCaseReference {
  readonly procedureId: string;
}

interface FemNodalResultLike extends FemResultCaseReferenceLike {
  readonly nodeId: string;
  readonly coordinateSystem: string;
  readonly translations?: FemVector3;
  readonly rotations?: FemVector3;
  readonly forces?: FemVector3;
  readonly moments?: FemVector3;
}

function validateStaticCaseReference(
  entry: FemResultCaseReferenceLike,
  path: string,
  indices: ResultIndices,
  errors: FemDiagnostic[],
  procedure: FemProcedure | null = null,
): void {
  const hasLoadCase = entry.loadCaseId != null;
  const hasCombination = entry.combinationId != null;
  if (hasLoadCase === hasCombination) {
    addError(
      errors,
      "FEM_RESULT_CASE_AMBIGUOUS",
      path,
      `${path} must declare exactly one of loadCaseId or combinationId.`,
    );
    return;
  }
  const key = hasLoadCase ? "loadCaseId" : "combinationId";
  const target = hasLoadCase ? indices.loadCases : indices.combinations;
  const label = hasLoadCase ? "load case" : "combination";
  const reference = entry[key];
  if (validateId(reference, `${path}.${key}`, errors) && target && !target.has(reference)) {
    addError(
      errors,
      "FEM_UNKNOWN_REFERENCE",
      `${path}.${key}`,
      `${path}.${key} references unknown ${label} ${reference}.`,
    );
  }
  if (procedure && ["nonlinear-static", "time-history"].includes(procedure.type)) {
    validateFinite(entry.step, `${path}.step`, errors, { nonNegative: true, integer: true });
  }
  if (procedure?.type === "time-history") {
    validateFinite(entry.time, `${path}.time`, errors, { nonNegative: true });
  }
}

function validateVectorComponents(
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: FemDiagnostic[],
): void {
  if (!validateRecord(value, path, errors)) return;
  keys.forEach((key) => validateFinite(value[key], `${path}.${key}`, errors));
}

function validateNodalResults(
  items: readonly FemNodalResultLike[] | undefined,
  path: string,
  indices: ResultIndices,
  errors: FemDiagnostic[],
  { reactions = false }: { readonly reactions?: boolean } = {},
): void {
  items?.forEach((entry, itemIndex) => {
    const itemPath = `${path}[${itemIndex}]`;
    if (!validateRecord(entry, itemPath, errors)) return;
    const procedure = validateProcedureReference(entry, itemPath, indices.procedures, errors, [
      "linear-static",
      "second-order-static",
      "nonlinear-static",
      "time-history",
      "response-spectrum",
    ]);
    validateStaticCaseReference(entry, itemPath, indices, errors, procedure);
    if (
      validateId(entry.nodeId, `${itemPath}.nodeId`, errors) &&
      indices.nodes &&
      !indices.nodes.has(entry.nodeId)
    ) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${itemPath}.nodeId`,
        `${itemPath}.nodeId references unknown node ${entry.nodeId}.`,
      );
    }
    validateString(entry.coordinateSystem, `${itemPath}.coordinateSystem`, errors, {
      allowed: ["global"],
    });
    if (reactions) {
      validateVectorComponents(entry.forces, ["x", "y", "z"], `${itemPath}.forces`, errors);
      validateVectorComponents(entry.moments, ["x", "y", "z"], `${itemPath}.moments`, errors);
    } else {
      validateVectorComponents(
        entry.translations,
        ["x", "y", "z"],
        `${itemPath}.translations`,
        errors,
      );
      validateVectorComponents(entry.rotations, ["x", "y", "z"], `${itemPath}.rotations`, errors);
    }
  });
}

function lineElementLength(
  element: { readonly nodeIds: readonly string[] } | undefined,
  nodeIndex: Map<string, { readonly coordinates: FemVector3 }> | null,
): number | null {
  if (!element || !nodeIndex) return null;
  const startId = element.nodeIds[0];
  const endId = element.nodeIds[1];
  if (startId === undefined || endId === undefined) return null;
  const start = nodeIndex.get(startId)?.coordinates;
  const end = nodeIndex.get(endId)?.coordinates;
  if (!start || !end) return null;
  return Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2 + (end.z - start.z) ** 2);
}

function validateLineElementActions(
  items: readonly FemLineElementActionResult[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): Set<string> {
  const coveredElements = new Set<string>();
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.lineElementActions[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    const procedure = validateProcedureReference(entry, path, indices.procedures, errors, [
      "linear-static",
      "second-order-static",
      "nonlinear-static",
      "time-history",
      "response-spectrum",
    ]);
    validateStaticCaseReference(entry, path, indices, errors, procedure);
    if (validateId(entry.lineElementId, `${path}.lineElementId`, errors)) {
      coveredElements.add(entry.lineElementId);
      if (indices.lineElements && !indices.lineElements.has(entry.lineElementId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.lineElementId`,
          `${path}.lineElementId references unknown line element ${entry.lineElementId}.`,
        );
      }
    }
    validateString(entry.coordinateSystem, `${path}.coordinateSystem`, errors, {
      allowed: ["element-local"],
    });
    if (validateArray(entry.stations, `${path}.stations`, errors) && entry.stations.length < 2) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.stations`,
        "Line-element actions require at least two stations.",
      );
    }

    const element = indices.lineElements?.get(entry.lineElementId);
    const length = lineElementLength(element, indices.nodes);
    let previousXi = -Infinity;
    entry.stations?.forEach((station, stationIndex) => {
      const stationPath = `${path}.stations[${stationIndex}]`;
      if (!validateRecord(station, stationPath, errors)) return;
      const xiValid = validateFinite(station.xi, `${stationPath}.xi`, errors);
      const positionValid = validateFinite(station.position, `${stationPath}.position`, errors, {
        nonNegative: true,
      });
      if (xiValid && (station.xi < 0 || station.xi > 1)) {
        addError(
          errors,
          "FEM_STATION_OUT_OF_RANGE",
          `${stationPath}.xi`,
          `${stationPath}.xi must lie in [0, 1].`,
        );
      }
      if (xiValid && station.xi < previousXi) {
        addError(
          errors,
          "FEM_STATIONS_NOT_ORDERED",
          `${stationPath}.xi`,
          "Line-element stations must be ordered by non-decreasing xi.",
        );
      }
      if (xiValid) previousXi = station.xi;
      if (
        xiValid &&
        positionValid &&
        length !== null &&
        Number.isFinite(length) &&
        Math.abs(station.position - station.xi * length) > Math.max(1e-9, length * 1e-8)
      ) {
        addError(
          errors,
          "FEM_STATION_POSITION_MISMATCH",
          `${stationPath}.position`,
          `${stationPath}.position does not match xi times the element length.`,
        );
      }
      validateString(station.side, `${stationPath}.side`, errors, {
        allowed: ["single", "before", "after"],
      });
      validateVectorComponents(
        station.actions,
        LINE_ACTION_COMPONENTS,
        `${stationPath}.actions`,
        errors,
      );
    });
  });
  return coveredElements;
}

function validateLocation(
  location: FemResultLocation,
  path: string,
  errors: FemDiagnostic[],
): void {
  if (!validateRecord(location, path, errors)) return;
  validateString(location.kind, `${path}.kind`, errors, {
    allowed: ["centroid", "element-average", "node", "integration-point", "coordinate"],
  });
  validateFiniteVector(location.position, `${path}.position`, errors);
  if (
    location.kind === "element-average" &&
    validateRecord(location.averaging, `${path}.averaging`, errors)
  ) {
    validateString(location.averaging.method, `${path}.averaging.method`, errors, {
      allowed: ["arithmetic-mean"],
    });
    validateString(location.averaging.source, `${path}.averaging.source`, errors, {
      allowed: ["nodal-smoothed"],
    });
    validateFinite(location.averaging.sampleCount, `${path}.averaging.sampleCount`, errors, {
      positive: true,
      integer: true,
    });
  }
  if (location.kind === "node") validateId(location.nodeId, `${path}.nodeId`, errors);
  if (location.kind === "integration-point") {
    validateId(location.integrationPointId, `${path}.integrationPointId`, errors);
  }
}

function validateShellResultants(
  items: readonly FemShellResultantResult[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): Set<string> {
  const coveredElements = new Set<string>();
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.shellResultants[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    const procedure = validateProcedureReference(entry, path, indices.procedures, errors, [
      "linear-static",
      "second-order-static",
      "nonlinear-static",
      "time-history",
      "response-spectrum",
    ]);
    validateStaticCaseReference(entry, path, indices, errors, procedure);
    if (validateId(entry.shellElementId, `${path}.shellElementId`, errors)) {
      coveredElements.add(entry.shellElementId);
      if (indices.shellElements && !indices.shellElements.has(entry.shellElementId)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.shellElementId`,
          `${path}.shellElementId references unknown shell element ${entry.shellElementId}.`,
        );
      }
    }
    validateString(entry.coordinateSystem, `${path}.coordinateSystem`, errors, {
      allowed: ["element-local"],
    });
    validateString(entry.face, `${path}.face`, errors, {
      allowed: ["mid-surface", "positive-local-z", "negative-local-z"],
    });
    validateLocation(entry.location, `${path}.location`, errors);
    validateVectorComponents(
      entry.components,
      SHELL_RESULTANT_COMPONENTS,
      `${path}.components`,
      errors,
    );
  });
  return coveredElements;
}

function validateTensorResults(
  items: readonly FemTensorResult[] | undefined,
  path: string,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): void {
  items?.forEach((entry, itemIndex) => {
    const itemPath = `${path}[${itemIndex}]`;
    if (!validateRecord(entry, itemPath, errors)) return;
    const procedure = validateProcedureReference(entry, itemPath, indices.procedures, errors);
    validateStaticCaseReference(entry, itemPath, indices, errors, procedure);
    validateString(entry.entityType, `${itemPath}.entityType`, errors, {
      allowed: ["line-element", "shell-element", "solid-element"],
    });
    validateId(entry.entityId, `${itemPath}.entityId`, errors);
    validateString(entry.coordinateSystem, `${itemPath}.coordinateSystem`, errors);
    validateString(entry.face, `${itemPath}.face`, errors);
    validateLocation(entry.location, `${itemPath}.location`, errors);
    if (
      validateRecord(entry.components, `${itemPath}.components`, errors) &&
      Object.keys(entry.components).length === 0
    ) {
      addError(
        errors,
        "FEM_EMPTY_COMPONENT_SET",
        `${itemPath}.components`,
        `${itemPath}.components must not be empty.`,
      );
    }
    for (const [key, value] of Object.entries(entry.components ?? {})) {
      validateFinite(value, `${itemPath}.components.${key}`, errors);
    }
  });
}

function validateSectionCutResults(
  items: readonly FemSectionCutResult[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): void {
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.sectionCuts[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    const procedure = validateProcedureReference(entry, path, indices.procedures, errors);
    validateStaticCaseReference(entry, path, indices, errors, procedure);
    if (
      validateId(entry.sectionCutId, `${path}.sectionCutId`, errors) &&
      indices.sectionCuts &&
      !indices.sectionCuts.has(entry.sectionCutId)
    ) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${path}.sectionCutId`,
        `${path}.sectionCutId references unknown section cut ${entry.sectionCutId}.`,
      );
    }
    validateString(entry.coordinateSystem, `${path}.coordinateSystem`, errors, {
      allowed: ["section-cut-local"],
    });
    validateFiniteVector(entry.position, `${path}.position`, errors);
    validateVectorComponents(entry.resultants, SIX_COMPONENTS, `${path}.resultants`, errors);
  });
}

function validateModalMap(
  map: Record<string, number> | undefined,
  directions: readonly string[] | undefined,
  path: string,
  errors: FemDiagnostic[],
  {
    ratio = false,
    nonNegative = false,
  }: { readonly ratio?: boolean; readonly nonNegative?: boolean } = {},
): void {
  if (!validateRecord(map, path, errors)) return;
  directions?.forEach((direction) => {
    const valid = validateFinite(map[direction], `${path}.${direction}`, errors, {
      nonNegative: ratio || nonNegative,
    });
    const mappedValue = map[direction];
    if (valid && ratio && mappedValue !== undefined && mappedValue > 1 + 1e-12) {
      addError(
        errors,
        "FEM_RATIO_OUT_OF_RANGE",
        `${path}.${direction}`,
        `${path}.${direction} must not exceed 1.`,
      );
    }
  });
}

function validateModes(
  items: readonly FemModeResult[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): Map<string, number> {
  const countByProcedure = new Map<string, number>();
  const keys = new Set();
  items?.forEach((mode, itemIndex) => {
    const path = `$.results.modes[${itemIndex}]`;
    if (!validateRecord(mode, path, errors)) return;
    const procedure = validateProcedureReference(mode, path, indices.procedures, errors, [
      "modal",
      "response-spectrum",
    ]);
    const modeValid = validateFinite(mode.modeNumber, `${path}.modeNumber`, errors, {
      positive: true,
      integer: true,
    });
    const key = `${mode.procedureId}:${mode.modeNumber}`;
    if (modeValid && keys.has(key)) {
      addError(errors, "FEM_DUPLICATE_MODE", `${path}.modeNumber`, `Duplicate mode ${key}.`);
    }
    keys.add(key);
    countByProcedure.set(mode.procedureId, (countByProcedure.get(mode.procedureId) ?? 0) + 1);
    const periodValid = validateFinite(mode.period, `${path}.period`, errors, { positive: true });
    const frequencyValid = validateFinite(mode.frequency, `${path}.frequency`, errors, {
      positive: true,
    });
    if (periodValid && frequencyValid && Math.abs(mode.period * mode.frequency - 1) > 1e-6) {
      addError(
        errors,
        "FEM_MODAL_PERIOD_FREQUENCY_MISMATCH",
        path,
        `${path}.period and frequency must be reciprocal.`,
      );
    }
    validateFinite(mode.eigenvalue, `${path}.eigenvalue`, errors, { positive: true });
    if (
      validateArray(mode.modalShape, `${path}.modalShape`, errors) &&
      mode.modalShape.length === 0
    ) {
      addError(errors, "FEM_ARRAY_TOO_SHORT", `${path}.modalShape`, "A modal shape is required.");
    }
    const shapeNodes = new Set();
    mode.modalShape?.forEach((shape, shapeIndex) => {
      const shapePath = `${path}.modalShape[${shapeIndex}]`;
      if (!validateRecord(shape, shapePath, errors)) return;
      if (validateId(shape.nodeId, `${shapePath}.nodeId`, errors)) {
        if (shapeNodes.has(shape.nodeId)) {
          addError(
            errors,
            "FEM_DUPLICATE_REFERENCE",
            `${shapePath}.nodeId`,
            `Node ${shape.nodeId} is repeated in modal shape ${key}.`,
          );
        }
        shapeNodes.add(shape.nodeId);
        if (indices.nodes && !indices.nodes.has(shape.nodeId)) {
          addError(
            errors,
            "FEM_UNKNOWN_REFERENCE",
            `${shapePath}.nodeId`,
            `${shapePath}.nodeId references unknown node ${shape.nodeId}.`,
          );
        }
      }
      validateVectorComponents(
        shape.translations,
        ["x", "y", "z"],
        `${shapePath}.translations`,
        errors,
      );
      validateVectorComponents(shape.rotations, ["x", "y", "z"], `${shapePath}.rotations`, errors);
    });
    const directions = procedure?.directions ?? Object.keys(mode.participationFactors ?? {});
    validateModalMap(mode.participationFactors, directions, `${path}.participationFactors`, errors);
    validateModalMap(mode.participatingMasses, directions, `${path}.participatingMasses`, errors, {
      nonNegative: true,
    });
    validateModalMap(
      mode.participatingMassRatios,
      directions,
      `${path}.participatingMassRatios`,
      errors,
      { ratio: true },
    );
  });
  return countByProcedure;
}

function validateStoreyResults(
  items: readonly FemStoreyResult[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): void {
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.storeyResults[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    const procedure = validateProcedureReference(entry, path, indices.procedures, errors);
    validateStaticCaseReference(entry, path, indices, errors, procedure);
    for (const { key, target, label } of [
      { key: "storeyId" as const, target: indices.storeys, label: "storey" },
      { key: "diaphragmId" as const, target: indices.diaphragms, label: "diaphragm" },
    ]) {
      const reference = entry[key];
      if (validateId(reference, `${path}.${key}`, errors) && target && !target.has(reference)) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${path}.${key}`,
          `${path}.${key} references unknown ${label} ${reference}.`,
        );
      }
    }
    validateFiniteVector(entry.centerOfMass, `${path}.centerOfMass`, errors);
    validateFiniteVector(entry.centerOfRigidity, `${path}.centerOfRigidity`, errors);
    validateVectorComponents(entry.translations, ["x", "y", "z"], `${path}.translations`, errors);
    validateVectorComponents(entry.rotations, ["x", "y", "z"], `${path}.rotations`, errors);
    validateVectorComponents(entry.driftRatios, ["X", "Y"], `${path}.driftRatios`, errors);
    validateVectorComponents(entry.resultants, SIX_COMPONENTS, `${path}.resultants`, errors);
    if (validateRecord(entry.torsionalMetrics, `${path}.torsionalMetrics`, errors)) {
      for (const [key, value] of Object.entries(entry.torsionalMetrics)) {
        validateFinite(value, `${path}.torsionalMetrics.${key}`, errors);
      }
    }
  });
}

function validateEquilibriumResiduals(
  items: readonly FemEquilibriumResidual[] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): void {
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.equilibriumResiduals[${itemIndex}]`;
    if (!validateRecord(entry, path, errors)) return;
    const procedure = validateProcedureReference(entry, path, indices.procedures, errors);
    validateStaticCaseReference(entry, path, indices, errors, procedure);
    validateVectorComponents(entry.forces, ["x", "y", "z"], `${path}.forces`, errors);
    validateVectorComponents(entry.moments, ["x", "y", "z"], `${path}.moments`, errors);
    validateFinite(entry.normalizedResidual, `${path}.normalizedResidual`, errors, {
      nonNegative: true,
    });
  });
}

function validateEnvelopes(
  items: readonly FemResultCollections["envelopes"][number][] | undefined,
  indices: ResultIndices,
  errors: FemDiagnostic[],
): void {
  validateUniqueIds(items, "$.results.envelopes", errors);
  items?.forEach((entry, itemIndex) => {
    const path = `$.results.envelopes[${itemIndex}]`;
    validateString(entry.quantity, `${path}.quantity`, errors);
    if (validateRecord(entry.target, `${path}.target`, errors)) {
      validateString(entry.target.entityType, `${path}.target.entityType`, errors);
      validateId(entry.target.entityId, `${path}.target.entityId`, errors);
    }
    if (
      validateArray(entry.governing, `${path}.governing`, errors) &&
      entry.governing.length === 0
    ) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.governing`,
        "Envelope governing data are required.",
      );
    }
    entry.governing?.forEach((governing, governingIndex) => {
      const governingPath = `${path}.governing[${governingIndex}]`;
      if (!validateRecord(governing, governingPath, errors)) return;
      if (
        validateId(governing.combinationId, `${governingPath}.combinationId`, errors) &&
        indices.combinations &&
        !indices.combinations.has(governing.combinationId)
      ) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${governingPath}.combinationId`,
          `${governingPath}.combinationId references unknown combination ${governing.combinationId}.`,
        );
      }
      validateFinite(governing.value, `${governingPath}.value`, errors);
    });
  });
}

function validateCapabilityCompleteness(
  input: GlobalFemResultContract,
  context: {
    readonly capabilities: FemCapabilitiesContract | null;
    readonly analysis: GlobalFemAnalysisContract | null;
    readonly model: GlobalFemModelContract | null;
  },
  coverage: FemPartialCoverage,
  modeCounts: Map<string, number>,
  errors: FemDiagnostic[],
): void {
  const { capabilities, analysis, model } = context;
  if (!capabilities || !analysis || !input.results) return;

  for (const capability of FEM_RESULT_CAPABILITY_KEYS) {
    const collection = RESULT_COLLECTION_BY_OUTPUT[capability];
    if (capabilities.results?.[capability] === false && input.results[collection]?.length > 0) {
      addError(
        errors,
        "FEM_UNDECLARED_RESULT_CAPABILITY",
        `$.results.${collection}`,
        `Results are present although results.${capability}=false.`,
      );
    }
  }

  if (["failed", "not-supported"].includes(input.status)) return;

  const requests = new Map<FemResultCapabilityKey, FemProcedure[]>();
  analysis.procedures.forEach((procedure) => {
    procedure.requestedOutputs.forEach((output) => {
      const procedures = requests.get(output);
      if (procedures) procedures.push(procedure);
      else requests.set(output, [procedure]);
    });
  });
  for (const [output, procedures] of requests) {
    const collection = RESULT_COLLECTION_BY_OUTPUT[output];
    if (capabilities.results?.[output] !== true) {
      addError(
        errors,
        "FEM_CAPABILITY_REQUIRED",
        `$.results.${collection}`,
        `Requested output ${output} is not declared available.`,
      );
    } else if (input.results[collection]?.length === 0) {
      addError(
        errors,
        "FEM_DECLARED_RESULT_MISSING",
        `$.results.${collection}`,
        `Requested and available output ${output} is missing.`,
      );
    }

    if (output === "modes") {
      procedures.forEach((procedure) => {
        if (
          procedure.requestedModes !== undefined &&
          (modeCounts.get(procedure.id) ?? 0) < procedure.requestedModes
        ) {
          addError(
            errors,
            "FEM_DECLARED_RESULT_MISSING",
            "$.results.modes",
            `Procedure ${procedure.id} requested ${procedure.requestedModes} modes.`,
          );
        }
      });
    }
  }

  if (model && requests.has("lineElementActions")) {
    model.lineElements.forEach((element) => {
      if (!coverage.lineElements.has(element.id)) {
        addError(
          errors,
          "FEM_RESULT_COVERAGE_INCOMPLETE",
          "$.results.lineElementActions",
          `No line-element action result exists for ${element.id}.`,
        );
      }
    });
  }
  if (model && requests.has("shellResultants")) {
    model.shellElements.forEach((element) => {
      if (!coverage.shellElements.has(element.id)) {
        addError(
          errors,
          "FEM_RESULT_COVERAGE_INCOMPLETE",
          "$.results.shellResultants",
          `No shell resultant exists for ${element.id}.`,
        );
      }
    });
  }
}

export function validateGlobalFemResultContract(
  input: unknown,
  {
    model = null,
    analysis = null,
    capabilities = null,
    mapping = null,
  }: {
    readonly model?: GlobalFemModelContract | null;
    readonly analysis?: GlobalFemAnalysisContract | null;
    readonly capabilities?: FemCapabilitiesContract | null;
    readonly mapping?: FemEntityMappingContract | null;
  } = {},
): FemValidationResult<GlobalFemResultContract> {
  const errors: FemDiagnostic[] = [];
  const warnings: FemDiagnostic[] = [];

  if (validateHeader<GlobalFemResultContract>(input, FEM_CONTRACT_SCHEMAS.result, errors)) {
    validateId(input.id, "$.id", errors);
    validateId(input.modelId, "$.modelId", errors);
    validateId(input.modelHash, "$.modelHash", errors);
    validateId(input.analysisId, "$.analysisId", errors);
    validateId(input.analysisHash, "$.analysisHash", errors);
    validateId(input.capabilitiesId, "$.capabilitiesId", errors);
    validateString(input.status, "$.status", errors, { allowed: FEM_RESULT_STATUS_VALUES });
    validateUnits(input.units, "$.units", errors);
    validateSignConventions(input.signConventions, input.results, capabilities, errors);
    validateResultCollections(input.results, errors);

    if (model) {
      if (input.modelId !== model.id || input.modelHash !== model.hash) {
        addError(
          errors,
          "FEM_MODEL_ASSOCIATION_MISMATCH",
          "$.modelId",
          "Result modelId/modelHash do not match the supplied model.",
        );
      }
      if (!sameJsonValue(input.units, model.units)) {
        addError(
          errors,
          "FEM_UNIT_SYSTEM_MISMATCH",
          "$.units",
          "Result units must exactly match model units in schema v0.",
        );
      }
    }
    if (analysis) {
      if (input.analysisId !== analysis.id || input.analysisHash !== analysis.hash) {
        addError(
          errors,
          "FEM_ANALYSIS_ASSOCIATION_MISMATCH",
          "$.analysisId",
          "Result analysisId/analysisHash do not match the supplied analysis.",
        );
      }
      if (!sameJsonValue(input.units, analysis.units)) {
        addError(
          errors,
          "FEM_UNIT_SYSTEM_MISMATCH",
          "$.units",
          "Result units must exactly match analysis units in schema v0.",
        );
      }
    }
    if (capabilities && input.capabilitiesId !== capabilities.id) {
      addError(
        errors,
        "FEM_CAPABILITIES_ASSOCIATION_MISMATCH",
        "$.capabilitiesId",
        "Result capabilitiesId does not match the supplied capability manifest.",
      );
    }
    if (mapping && model && (mapping.modelId !== model.id || mapping.modelHash !== model.hash)) {
      addError(
        errors,
        "FEM_MODEL_ASSOCIATION_MISMATCH",
        "$.modelId",
        "Supplied mapping is not associated with the supplied model.",
      );
    }

    const indices = {
      procedures: analysis ? indexById(analysis.procedures) : null,
      loadCases: analysis ? indexById(analysis.loadCases) : null,
      combinations: analysis ? indexById(analysis.combinations) : null,
      nodes: model ? indexById(model.nodes) : null,
      lineElements: model ? indexById(model.lineElements) : null,
      shellElements: model ? indexById(model.shellElements) : null,
      sectionCuts: model ? indexById(model.sectionCuts) : null,
      storeys: model ? indexById(model.storeys) : null,
      diaphragms: model ? indexById(model.diaphragms) : null,
    };

    validateProvenance(input.provenance, input, { capabilities }, errors);
    validateConvergence(input.convergence, indices.procedures, errors);
    validateNodalResults(
      input.results?.nodalDisplacements,
      "$.results.nodalDisplacements",
      indices,
      errors,
    );
    validateNodalResults(input.results?.reactions, "$.results.reactions", indices, errors, {
      reactions: true,
    });
    const lineElements = validateLineElementActions(
      input.results?.lineElementActions,
      indices,
      errors,
    );
    const shellElements = validateShellResultants(input.results?.shellResultants, indices, errors);
    validateTensorResults(input.results?.stresses, "$.results.stresses", indices, errors);
    validateTensorResults(input.results?.strains, "$.results.strains", indices, errors);
    validateSectionCutResults(input.results?.sectionCuts, indices, errors);
    const modeCounts = validateModes(input.results?.modes, indices, errors);
    validateStoreyResults(input.results?.storeyResults, indices, errors);
    validateEquilibriumResiduals(input.results?.equilibriumResiduals, indices, errors);
    validateEnvelopes(input.results?.envelopes, indices, errors);
    validateCapabilityCompleteness(
      input,
      { model, analysis, capabilities },
      { lineElements, shellElements },
      modeCounts,
      errors,
    );

    if (input.qualityIndicators != null) {
      if (validateRecord(input.qualityIndicators, "$.qualityIndicators", errors)) {
        for (const [key, value] of Object.entries(input.qualityIndicators)) {
          validateFinite(value, `$.qualityIndicators.${key}`, errors, { nonNegative: true });
        }
      }
    }
    if (input.metadata != null) {
      validateRecord(input.metadata, "$.metadata", errors);
    }
  }

  return finalizeValidation(input, errors, warnings);
}

export function createGlobalFemResultContract(
  input: unknown,
  options: {
    readonly model?: GlobalFemModelContract | null;
    readonly analysis?: GlobalFemAnalysisContract | null;
    readonly capabilities?: FemCapabilitiesContract | null;
    readonly mapping?: FemEntityMappingContract | null;
  } = {},
): GlobalFemResultContract {
  const candidate = withContractHeader(input, FEM_CONTRACT_SCHEMAS.result);
  return throwForInvalidContract<GlobalFemResultContract>(
    "GlobalFemResultContract",
    validateGlobalFemResultContract(candidate, options),
  );
}
