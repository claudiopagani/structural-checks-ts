import { LinearStaticSolver2D, type LinearSolverLike } from "../fem/LinearStaticSolver2D.js";
import {
  SingleBeamModel,
  createBeamAnalysisContext,
  groupLoadsByCase,
  loadsForCombination,
  normalizeCombinations,
  type NormalizedBeamLoad,
} from "./SingleBeamInput.js";
import { createEnvelopes } from "./SingleBeamEnvelopes.js";
import { SingleBeamFemBuilder } from "./SingleBeamFemBuilder.js";
import {
  sampleBeamResult,
  sectionRotationWarnings,
  type SingleBeamResult,
} from "./SingleBeamResults.js";

export { BEAM_SUPPORT_PRESETS, resolveBeamSupportPreset } from "./SingleBeamInput.js";
export { SingleBeamFemBuilder } from "./SingleBeamFemBuilder.js";
export { SingleBeamModel } from "./SingleBeamInput.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" });

function stringifyValue(value: unknown, fallback: string): string {
  if (value == null) {
    return fallback;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return Object.prototype.toString.call(value);
}

export interface SingleBeamAnalysisOptions {
  femBuilder?: SingleBeamFemBuilder;
  linearSolver?: LinearSolverLike | null;
}

export interface SingleBeamAnalysisOutput extends Record<string, unknown> {
  id: string;
  units: SingleBeamModel["units"];
  analysisModel: string;
  loadCases: Record<string, SingleBeamResult>;
  combinations: Record<
    string,
    SingleBeamResult & { factors: Record<string, number | undefined>; name: string }
  >;
  envelopes: ReturnType<typeof createEnvelopes>;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export class SingleBeamAnalysis {
  readonly femBuilder: SingleBeamFemBuilder;
  readonly linearSolver: LinearSolverLike | null;

  constructor({
    femBuilder = new SingleBeamFemBuilder(),
    linearSolver = null,
  }: SingleBeamAnalysisOptions = {}) {
    this.femBuilder = femBuilder;
    this.linearSolver = linearSolver;
  }

  analyze(
    input: SingleBeamModel | ConstructorParameters<typeof SingleBeamModel>[0] = {
      id: "single-beam",
      units: { force: "kN", length: "m" },
      geometry: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    },
  ): SingleBeamAnalysisOutput {
    const model = input instanceof SingleBeamModel ? input : new SingleBeamModel(input);
    const loadCaseGroups = groupLoadsByCase(model.loads);
    const loadCases: Record<string, SingleBeamResult> = {};

    for (const [loadCaseId, loads] of loadCaseGroups.entries()) {
      loadCases[loadCaseId] = this.solve(model, loads, {
        loadCaseId,
        resultType: "load-case",
      });
    }

    const combinations: Record<
      string,
      SingleBeamResult & { factors: Record<string, number | undefined>; name: string }
    > = {};
    const combinationDefinitions = normalizeCombinations(model.combinations, [
      ...loadCaseGroups.keys(),
    ]);

    for (const combination of combinationDefinitions) {
      combinations[combination.id] = {
        ...this.solve(model, loadsForCombination(model.loads, combination.factors), {
          combinationId: combination.id,
          resultType: "combination",
          factors: combination.factors,
          ...combination.metadata,
        }),
        factors: { ...combination.factors },
        name: combination.name,
      };
    }

    return {
      id: model.id,
      units: model.units,
      analysisModel: model.analysisModel,
      loadCases,
      combinations,
      envelopes: createEnvelopes(loadCases, combinations),
      warnings: sectionRotationWarnings(model.sectionRotation),
      metadata: {
        ...model.metadata,
        generatedBy: "SingleBeamAnalysis",
      },
    };
  }

  solve(
    model: SingleBeamModel,
    loads: readonly NormalizedBeamLoad[],
    context: Record<string, unknown>,
  ): SingleBeamResult {
    const analysisContext = createBeamAnalysisContext(model, loads, context);
    const femModel = this.femBuilder.build(model, {
      loads,
      context: analysisContext,
    });
    const solver =
      this.linearSolver === null
        ? new LinearStaticSolver2D()
        : new LinearStaticSolver2D({ linearSolver: this.linearSolver });
    const solution = solver.solve(femModel, {
      includeDiagnostics: false,
    });

    return {
      id: stringifyValue(context.loadCaseId ?? context.combinationId, model.id),
      resultType: typeof context.resultType === "string" ? context.resultType : undefined,
      loads: loads.map((load) => ({
        id: load.id,
        actionType: load.actionType,
        loadCaseId: load.loadCaseId,
        loadDurationClass: load.loadDurationClass ?? null,
        factor: load.factor ?? 1,
      })),
      context: {
        resultType: analysisContext.resultType,
        limitState: analysisContext.limitState ?? null,
        combinationType: analysisContext.combinationType ?? null,
        serviceCombination: analysisContext.serviceCombination ?? null,
        leadingLoadCaseId: analysisContext.leadingLoadCaseId ?? null,
        leadingActionId: analysisContext.leadingActionId ?? null,
        leadingVariableCategory: analysisContext.leadingVariableCategory ?? null,
        accompanyingLoadCaseIds: [
          ...((analysisContext.accompanyingLoadCaseIds as string[] | undefined) ?? []),
        ],
        loadCaseFactors: { ...analysisContext.loadCaseFactors },
        activeLoads: analysisContext.activeLoads.map((load) => ({ ...load })),
        governingLoadDurationClass: analysisContext.governingLoadDurationClass,
        governingLoad: analysisContext.governingLoad ? { ...analysisContext.governingLoad } : null,
        sectionRotation: { ...model.sectionRotation },
      },
      ...sampleBeamResult({
        model,
        femModel,
        solution,
        sectionProperties: femModel.sectionProperties,
        femUnits: FEM_UNITS,
      }),
    } as unknown as SingleBeamResult;
  }
}
