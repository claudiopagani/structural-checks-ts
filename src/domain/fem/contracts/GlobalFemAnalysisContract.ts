// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.
import {
  FEM_ANALYSIS_TYPES,
  FEM_CONTRACT_SCHEMAS,
  FEM_RESULT_CAPABILITY_KEYS,
  addError,
  finalizeValidation,
  sameJsonValue,
  throwForInvalidContract,
  validateArray,
  validateBoolean,
  validateFinite,
  validateHeader,
  validateId,
  validateIdArray,
  validateRecord,
  validateReferences,
  validateString,
  validateUniqueIds,
  validateUnits,
  withContractHeader,
} from "./FemContractValidation.js";
import type {
  FemAnalysisCapabilityKey,
  FemCapabilitiesContract,
  FemCombination,
  FemDiagnostic,
  FemLoadCase,
  FemLoadPattern,
  FemMassSource,
  FemProcedure,
  FemSpectrum,
  FemTimeSeries,
  FemValidationResult,
  GlobalFemAnalysisContract,
  GlobalFemModelContract,
} from "./FemContractTypes.js";

const ANALYSIS_CAPABILITY_BY_TYPE: Readonly<
  Record<FemProcedure["type"], FemAnalysisCapabilityKey>
> = Object.freeze({
  "linear-static": "linearStatic",
  "second-order-static": "secondOrder",
  modal: "modal",
  "response-spectrum": "responseSpectrum",
  "nonlinear-static": "nonlinearStatic",
  "time-history": "timeHistory",
});

interface AnalysisIndices {
  readonly loadCases: Map<string, FemLoadCase>;
  readonly combinations: Map<string, FemCombination>;
  readonly massSources: Map<string, FemMassSource>;
  readonly spectra: Map<string, FemSpectrum>;
  readonly timeSeries: Map<string, FemTimeSeries>;
}

interface AnalysisOptions {
  readonly model: GlobalFemModelContract | null;
  readonly capabilities: FemCapabilitiesContract | null;
}

function validateLoadPatterns(
  loadPatterns: readonly FemLoadPattern[] | undefined,
  errors: FemDiagnostic[],
): Map<string, FemLoadPattern> {
  const index = validateUniqueIds(loadPatterns, "$.loadPatterns", errors);
  loadPatterns?.forEach((loadPattern, itemIndex) => {
    const path = `$.loadPatterns[${itemIndex}]`;
    validateString(loadPattern.nature, `${path}.nature`, errors);
    if (loadPattern.metadata != null) {
      validateRecord(loadPattern.metadata, `${path}.metadata`, errors);
    }
  });
  return index;
}

function validateLoadCases(
  loadCases: readonly FemLoadCase[] | undefined,
  loadPatternIndex: Map<string, FemLoadPattern>,
  errors: FemDiagnostic[],
): Map<string, FemLoadCase> {
  const index = validateUniqueIds(loadCases, "$.loadCases", errors);
  loadCases?.forEach((loadCase, itemIndex) => {
    const path = `$.loadCases[${itemIndex}]`;
    validateString(loadCase.nature, `${path}.nature`, errors);
    validateIdArray(loadCase.loadPatternIds, `${path}.loadPatternIds`, errors);
    validateReferences(
      loadCase.loadPatternIds,
      loadPatternIndex,
      `${path}.loadPatternIds`,
      errors,
      "load pattern",
    );
    validateFinite(loadCase.selfWeightFactor, `${path}.selfWeightFactor`, errors);
  });
  return index;
}

function validateCombinations(
  combinations: readonly FemCombination[] | undefined,
  loadCaseIndex: Map<string, FemLoadCase>,
  errors: FemDiagnostic[],
): Map<string, FemCombination> {
  const index = validateUniqueIds(combinations, "$.combinations", errors);
  combinations?.forEach((combination, itemIndex) => {
    const path = `$.combinations[${itemIndex}]`;
    validateString(combination.limitState, `${path}.limitState`, errors, {
      allowed: ["ultimate", "serviceability", "accidental", "seismic", "fatigue", "other"],
    });
    validateString(combination.nature, `${path}.nature`, errors);
    if (
      validateArray(combination.terms, `${path}.terms`, errors) &&
      combination.terms.length === 0
    ) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.terms`,
        `${path}.terms must contain at least one load case.`,
      );
    }
    combination.terms?.forEach((term, termIndex) => {
      const termPath = `${path}.terms[${termIndex}]`;
      if (!validateRecord(term, termPath, errors)) return;
      if (
        validateId(term.loadCaseId, `${termPath}.loadCaseId`, errors) &&
        !loadCaseIndex.has(term.loadCaseId)
      ) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${termPath}.loadCaseId`,
          `${termPath}.loadCaseId references unknown load case ${term.loadCaseId}.`,
        );
      }
      validateFinite(term.factor, `${termPath}.factor`, errors);
    });
  });
  return index;
}

function validateMassSources(
  massSources: readonly FemMassSource[] | undefined,
  loadCaseIndex: Map<string, FemLoadCase>,
  errors: FemDiagnostic[],
): Map<string, FemMassSource> {
  const index = validateUniqueIds(massSources, "$.massSources", errors);
  massSources?.forEach((massSource, itemIndex) => {
    const path = `$.massSources[${itemIndex}]`;
    if (
      validateArray(massSource.directions, `${path}.directions`, errors) &&
      massSource.directions.length === 0
    ) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.directions`,
        "Mass directions are required.",
      );
    }
    const directions = new Set();
    massSource.directions?.forEach((direction, directionIndex) => {
      validateString(direction, `${path}.directions[${directionIndex}]`, errors, {
        allowed: ["X", "Y", "Z"],
      });
      if (directions.has(direction)) {
        addError(
          errors,
          "FEM_DUPLICATE_REFERENCE",
          `${path}.directions[${directionIndex}]`,
          `${path}.directions contains duplicate direction ${direction}.`,
        );
      }
      directions.add(direction);
    });
    if (
      validateArray(massSource.contributions, `${path}.contributions`, errors) &&
      massSource.contributions.length === 0
    ) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.contributions`,
        "A mass source needs at least one contribution.",
      );
    }
    massSource.contributions?.forEach((contribution, contributionIndex) => {
      const contributionPath = `${path}.contributions[${contributionIndex}]`;
      if (!validateRecord(contribution, contributionPath, errors)) return;
      if (
        validateId(contribution.loadCaseId, `${contributionPath}.loadCaseId`, errors) &&
        !loadCaseIndex.has(contribution.loadCaseId)
      ) {
        addError(
          errors,
          "FEM_UNKNOWN_REFERENCE",
          `${contributionPath}.loadCaseId`,
          `${contributionPath}.loadCaseId references unknown load case ${contribution.loadCaseId}.`,
        );
      }
      validateFinite(contribution.factor, `${contributionPath}.factor`, errors, {
        nonNegative: true,
      });
    });
  });
  return index;
}

function validateSpectra(
  spectra: readonly FemSpectrum[] | undefined,
  errors: FemDiagnostic[],
): Map<string, FemSpectrum> {
  const index = validateUniqueIds(spectra, "$.spectra", errors);
  spectra?.forEach((spectrum, itemIndex) => {
    const path = `$.spectra[${itemIndex}]`;
    validateString(spectrum.direction, `${path}.direction`, errors, {
      allowed: ["X", "Y", "Z"],
    });
    validateFinite(spectrum.dampingRatio, `${path}.dampingRatio`, errors, {
      nonNegative: true,
    });
    if (validateArray(spectrum.points, `${path}.points`, errors) && spectrum.points.length < 2) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.points`,
        "A response spectrum requires at least two points.",
      );
    }
    spectrum.points?.forEach((point, pointIndex) => {
      const pointPath = `${path}.points[${pointIndex}]`;
      if (!validateRecord(point, pointPath, errors)) return;
      validateFinite(point.period, `${pointPath}.period`, errors, { nonNegative: true });
      validateFinite(point.acceleration, `${pointPath}.acceleration`, errors, {
        nonNegative: true,
      });
    });
  });
  return index;
}

function validateTimeSeries(
  timeSeries: readonly FemTimeSeries[] | undefined,
  errors: FemDiagnostic[],
): Map<string, FemTimeSeries> {
  const index = validateUniqueIds(timeSeries, "$.timeSeries", errors);
  timeSeries?.forEach((series, itemIndex) => {
    const path = `$.timeSeries[${itemIndex}]`;
    validateFinite(series.timeStep, `${path}.timeStep`, errors, { positive: true });
    if (validateArray(series.values, `${path}.values`, errors) && series.values.length < 2) {
      addError(
        errors,
        "FEM_ARRAY_TOO_SHORT",
        `${path}.values`,
        "A time series requires at least two values.",
      );
    }
    series.values?.forEach((value, valueIndex) => {
      validateFinite(value, `${path}.values[${valueIndex}]`, errors);
    });
  });
  return index;
}

function validateRequestedOutputs(
  outputs: readonly string[] | undefined,
  path: string,
  errors: FemDiagnostic[],
): void {
  if (!validateArray(outputs, path, errors)) return;
  if (outputs.length === 0) {
    addError(errors, "FEM_ARRAY_TOO_SHORT", path, `${path} must not be empty.`);
  }
  const seen = new Set();
  outputs.forEach((output, index) => {
    const outputPath = `${path}[${index}]`;
    if (
      !validateString(output, outputPath, errors, {
        allowed: FEM_RESULT_CAPABILITY_KEYS,
      })
    )
      return;
    if (seen.has(output)) {
      addError(
        errors,
        "FEM_DUPLICATE_REFERENCE",
        outputPath,
        `${path} contains duplicate output ${output}.`,
      );
    }
    seen.add(output);
  });
}

function validateAccidentalEccentricities(
  procedure: FemProcedure,
  path: string,
  model: GlobalFemModelContract | null,
  errors: FemDiagnostic[],
): void {
  if (
    !validateArray(procedure.accidentalEccentricities, `${path}.accidentalEccentricities`, errors)
  )
    return;
  procedure.accidentalEccentricities.forEach((eccentricity, eccentricityIndex) => {
    const eccentricityPath = `${path}.accidentalEccentricities[${eccentricityIndex}]`;
    if (!validateRecord(eccentricity, eccentricityPath, errors)) return;
    validateId(eccentricity.id, `${eccentricityPath}.id`, errors);
    validateString(eccentricity.direction, `${eccentricityPath}.direction`, errors, {
      allowed: ["X", "Y", "Z"],
    });
    validateFinite(eccentricity.offset, `${eccentricityPath}.offset`, errors);
    if (
      eccentricity.storeyId != null &&
      model &&
      !model.storeys.some((storey) => storey.id === eccentricity.storeyId)
    ) {
      addError(
        errors,
        "FEM_UNKNOWN_REFERENCE",
        `${eccentricityPath}.storeyId`,
        `${eccentricityPath}.storeyId references unknown storey ` + `${eccentricity.storeyId}.`,
      );
    }
  });
}

function validateStaticProcedure(
  procedure: FemProcedure,
  path: string,
  indices: AnalysisIndices,
  model: GlobalFemModelContract | null,
  errors: FemDiagnostic[],
): void {
  validateIdArray(procedure.loadCaseIds, `${path}.loadCaseIds`, errors, { minLength: 1 });
  validateReferences(
    procedure.loadCaseIds,
    indices.loadCases,
    `${path}.loadCaseIds`,
    errors,
    "load case",
  );
  validateIdArray(procedure.combinationIds, `${path}.combinationIds`, errors, {
    minLength: ["linear-static", "second-order-static"].includes(procedure.type) ? 1 : 0,
  });
  validateReferences(
    procedure.combinationIds,
    indices.combinations,
    `${path}.combinationIds`,
    errors,
    "combination",
  );

  if (validateRecord(procedure.secondOrder, `${path}.secondOrder`, errors)) {
    const enabledValid = validateBoolean(
      procedure.secondOrder.enabled,
      `${path}.secondOrder.enabled`,
      errors,
    );
    if (enabledValid && procedure.type === "linear-static" && procedure.secondOrder.enabled) {
      addError(
        errors,
        "FEM_ANALYSIS_SETTING_CONFLICT",
        `${path}.secondOrder.enabled`,
        "linear-static requires secondOrder.enabled=false; use second-order-static otherwise.",
      );
    }
    if (
      enabledValid &&
      procedure.type === "second-order-static" &&
      !procedure.secondOrder.enabled
    ) {
      addError(
        errors,
        "FEM_ANALYSIS_SETTING_CONFLICT",
        `${path}.secondOrder.enabled`,
        "second-order-static requires secondOrder.enabled=true.",
      );
    }
    if (procedure.secondOrder.enabled) {
      validateString(procedure.secondOrder.method, `${path}.secondOrder.method`, errors);
    } else if (procedure.secondOrder.method !== null) {
      addError(
        errors,
        "FEM_EXPLICIT_NULL_REQUIRED",
        `${path}.secondOrder.method`,
        "Disabled second-order effects require method=null.",
      );
    }
  }

  if (validateArray(procedure.stiffnessAssumptions, `${path}.stiffnessAssumptions`, errors)) {
    procedure.stiffnessAssumptions.forEach((assumption, assumptionIndex) => {
      const assumptionPath = `${path}.stiffnessAssumptions[${assumptionIndex}]`;
      if (!validateRecord(assumption, assumptionPath, errors)) return;
      validateId(assumption.id, `${assumptionPath}.id`, errors);
      validateString(assumption.scope, `${assumptionPath}.scope`, errors);
      validateString(assumption.property, `${assumptionPath}.property`, errors);
      validateFinite(assumption.factor, `${assumptionPath}.factor`, errors, { positive: true });
      validateString(assumption.description, `${assumptionPath}.description`, errors);
    });
  }

  validateAccidentalEccentricities(procedure, path, model, errors);
}

function validateModalProcedure(
  procedure: FemProcedure,
  path: string,
  indices: AnalysisIndices,
  errors: FemDiagnostic[],
): void {
  if (
    validateId(procedure.massSourceId, `${path}.massSourceId`, errors) &&
    !indices.massSources.has(procedure.massSourceId)
  ) {
    addError(
      errors,
      "FEM_UNKNOWN_REFERENCE",
      `${path}.massSourceId`,
      `${path}.massSourceId references unknown mass source ${procedure.massSourceId}.`,
    );
  }
  validateFinite(procedure.requestedModes, `${path}.requestedModes`, errors, {
    positive: true,
    integer: true,
  });
  if (
    validateArray(procedure.directions, `${path}.directions`, errors) &&
    procedure.directions.length === 0
  ) {
    addError(errors, "FEM_ARRAY_TOO_SHORT", `${path}.directions`, "Modal directions are required.");
  }
  const directions = new Set();
  procedure.directions?.forEach((direction, directionIndex) => {
    validateString(direction, `${path}.directions[${directionIndex}]`, errors, {
      allowed: ["X", "Y", "Z"],
    });
    if (directions.has(direction)) {
      addError(
        errors,
        "FEM_DUPLICATE_REFERENCE",
        `${path}.directions[${directionIndex}]`,
        `${path}.directions contains duplicate direction ${direction}.`,
      );
    }
    directions.add(direction);
  });
}

function validateProcedures(
  procedures: readonly FemProcedure[] | undefined,
  indices: AnalysisIndices,
  options: AnalysisOptions,
  errors: FemDiagnostic[],
): Map<string, FemProcedure> {
  const index = validateUniqueIds(procedures, "$.procedures", errors);
  procedures?.forEach((procedure, itemIndex) => {
    const path = `$.procedures[${itemIndex}]`;
    const declaredCapabilities = options.capabilities;
    const typeValid = validateString(procedure.type, `${path}.type`, errors, {
      allowed: FEM_ANALYSIS_TYPES,
    });
    validateRequestedOutputs(procedure.requestedOutputs, `${path}.requestedOutputs`, errors);

    if (typeValid && declaredCapabilities) {
      const capability = ANALYSIS_CAPABILITY_BY_TYPE[procedure.type];
      if (declaredCapabilities.analyses?.[capability] !== true) {
        addError(
          errors,
          "FEM_CAPABILITY_REQUIRED",
          `${path}.type`,
          `${procedure.type} requires analyses.${capability}=true.`,
        );
      }
    }
    if (declaredCapabilities) {
      procedure.requestedOutputs?.forEach((output, outputIndex) => {
        if (declaredCapabilities.results?.[output] !== true) {
          addError(
            errors,
            "FEM_CAPABILITY_REQUIRED",
            `${path}.requestedOutputs[${outputIndex}]`,
            `Requested output ${output} requires results.${output}=true.`,
          );
        }
      });
    }

    if (
      ["linear-static", "second-order-static", "nonlinear-static", "time-history"].includes(
        procedure.type,
      )
    ) {
      validateStaticProcedure(procedure, path, indices, options.model, errors);
    }
    if (["modal", "response-spectrum"].includes(procedure.type)) {
      validateModalProcedure(procedure, path, indices, errors);
    }
    if (procedure.type === "response-spectrum") {
      validateIdArray(procedure.spectrumIds, `${path}.spectrumIds`, errors, { minLength: 1 });
      validateReferences(
        procedure.spectrumIds,
        indices.spectra,
        `${path}.spectrumIds`,
        errors,
        "response spectrum",
      );
      validateString(procedure.modalCombinationMethod, `${path}.modalCombinationMethod`, errors, {
        allowed: ["cqc"],
      });
      validateString(
        procedure.componentCombinationRule,
        `${path}.componentCombinationRule`,
        errors,
        { allowed: ["100-30-30"] },
      );
      validateAccidentalEccentricities(procedure, path, options.model, errors);
    }
    if (["nonlinear-static", "time-history"].includes(procedure.type)) {
      validateFinite(procedure.requestedSteps, `${path}.requestedSteps`, errors, {
        positive: true,
        integer: true,
      });
    }
    if (procedure.type === "time-history") {
      validateIdArray(procedure.timeSeriesIds, `${path}.timeSeriesIds`, errors, { minLength: 1 });
      validateReferences(
        procedure.timeSeriesIds,
        indices.timeSeries,
        `${path}.timeSeriesIds`,
        errors,
        "time series",
      );
    }
  });
  return index;
}

export function validateGlobalFemAnalysisContract(
  input: unknown,
  {
    model = null,
    capabilities = null,
  }: {
    readonly model?: GlobalFemModelContract | null;
    readonly capabilities?: FemCapabilitiesContract | null;
  } = {},
): FemValidationResult<GlobalFemAnalysisContract> {
  const errors: FemDiagnostic[] = [];
  const warnings: FemDiagnostic[] = [];

  if (validateHeader<GlobalFemAnalysisContract>(input, FEM_CONTRACT_SCHEMAS.analysis, errors)) {
    validateId(input.id, "$.id", errors);
    validateId(input.hash, "$.hash", errors);
    validateId(input.modelId, "$.modelId", errors);
    validateId(input.modelHash, "$.modelHash", errors);
    validateUnits(input.units, "$.units", errors);

    for (const collection of ["loadPatterns", "loadCases", "combinations", "procedures"] as const) {
      validateArray(input[collection], `$.${collection}`, errors);
    }
    for (const collection of ["massSources", "spectra", "timeSeries"] as const) {
      validateArray(input[collection], `$.${collection}`, errors, { required: false });
    }

    if (model) {
      if (input.modelId !== model.id || input.modelHash !== model.hash) {
        addError(
          errors,
          "FEM_MODEL_ASSOCIATION_MISMATCH",
          "$.modelId",
          "Analysis modelId/modelHash do not match the supplied model.",
        );
      }
      if (!sameJsonValue(input.units, model.units)) {
        addError(
          errors,
          "FEM_UNIT_SYSTEM_MISMATCH",
          "$.units",
          "Analysis units must exactly match model units in schema v0.",
        );
      }
    }

    const loadPatterns = validateLoadPatterns(input.loadPatterns, errors);
    const loadCases = validateLoadCases(input.loadCases, loadPatterns, errors);
    const combinations = validateCombinations(input.combinations, loadCases, errors);
    const massSources = validateMassSources(input.massSources, loadCases, errors);
    const spectra = validateSpectra(input.spectra, errors);
    const timeSeries = validateTimeSeries(input.timeSeries, errors);
    validateProcedures(
      input.procedures,
      { loadCases, combinations, massSources, spectra, timeSeries },
      { model, capabilities },
      errors,
    );

    if (input.metadata != null) {
      validateRecord(input.metadata, "$.metadata", errors);
    }
  }

  return finalizeValidation(input, errors, warnings);
}

export function createGlobalFemAnalysisContract(
  input: unknown,
  options: Partial<AnalysisOptions> = {},
): GlobalFemAnalysisContract {
  const candidate = withContractHeader(input, FEM_CONTRACT_SCHEMAS.analysis);
  return throwForInvalidContract<GlobalFemAnalysisContract>(
    "GlobalFemAnalysisContract",
    validateGlobalFemAnalysisContract(candidate, options),
  );
}
