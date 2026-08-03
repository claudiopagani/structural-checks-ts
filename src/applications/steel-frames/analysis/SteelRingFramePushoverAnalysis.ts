import { round, uniqueStrings } from "../../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../../core/results/resultStatus.js";
import { createUnitResolver, type UnitSystem } from "../../../domain/units/UnitSystem.js";
import type { DisplacementControlPoint } from "../../../domain/fem/nonlinear/DisplacementControlNonlinearStaticSolver2D.js";
import {
  SteelDisplacementControlPushoverSolver2D,
  type SteelDisplacementControlPushoverSolveOptions,
  type SteelDisplacementControlPushoverSolveResult,
} from "./SteelDisplacementControlPushoverSolver2D.js";
import {
  SteelRingFrame2DBuilder,
  type SteelRingFrame2DBuilderResult,
} from "./SteelRingFrame2DBuilder.js";
import {
  SteelRingFramePushoverModel,
  type SteelRingFramePushoverModelOptions,
} from "../models/SteelRingFramePushoverModel.js";

const FEM_UNITS = Object.freeze({ force: "kN", length: "m" }) satisfies UnitSystem;
type JsonRecord = Record<string, unknown>;

export interface SteelRingFramePushoverAnalysisOptions {
  builder?: SteelRingFrameBuilderLike;
  solver?: SteelRingFramePushoverSolverLike;
}

export interface SteelRingFramePushoverAnalysisInput {
  model?: SteelRingFramePushoverModel | SteelRingFramePushoverModelOptions | null;
}

export interface SteelRingFramePushoverAnalysisPoint extends JsonRecord {
  step: number;
  iterationCount: number;
  controlDisplacement: unknown;
  baseShear: unknown;
  loadFactor: unknown;
  hingeCount: unknown;
}

export interface SteelRingFramePushoverAnalysisResult extends JsonRecord {
  status: string;
  summary: string;
  warnings: string[];
  assumptions: string[];
  outputs: {
    modelId: string | number | bigint;
    frameIdealization: SteelRingFrame2DBuilderResult["snapshot"];
    control: JsonRecord;
    capacityCurve: {
      units: { displacement: string; baseShear: string };
      points: SteelRingFramePushoverAnalysisPoint[];
      maxBaseShear: number;
      ultimateControlDisplacement: unknown;
    };
    hingeEvents: JsonRecord[];
    finalState: JsonRecord;
  };
  metadata: JsonRecord;
}

export interface SteelRingFrameBuilderLike {
  build(input: { model: SteelRingFramePushoverModel }): SteelRingFrame2DBuilderResult;
}

export interface SteelRingFramePushoverSolverLike {
  solve(
    options: SteelDisplacementControlPushoverSolveOptions,
  ): SteelDisplacementControlPushoverSolveResult;
}

function resolveModel(
  input: SteelRingFramePushoverModel | SteelRingFramePushoverModelOptions,
): SteelRingFramePushoverModel {
  return input instanceof SteelRingFramePushoverModel
    ? input
    : new SteelRingFramePushoverModel(input);
}

function roundConverted(value: unknown, converter: (numberValue: number) => number): unknown {
  return typeof value === "number" ? round(converter(value)) : round(value);
}

function enumerableEntries(value: unknown): [string, unknown][] {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return [];
  }

  return Object.keys(value).map((key): [string, unknown] => [key, Reflect.get(value, key)]);
}

function jsonValue(value: unknown): unknown {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const toJSON: unknown = Reflect.get(value, "toJSON");
    if (typeof toJSON === "function") {
      return Reflect.apply(toJSON, value, []);
    }
  }

  return value;
}

function pointToUserUnits(
  point: DisplacementControlPoint,
  resolver: ReturnType<typeof createUnitResolver>,
): SteelRingFramePushoverAnalysisPoint {
  return {
    step: point.step,
    iterationCount: point.iterationCount,
    controlDisplacement: roundConverted(point.controlDisplacement, resolver.length),
    baseShear: roundConverted(point.baseShear, resolver.force),
    loadFactor: round(point.loadFactor),
    hingeCount: point.hingeCount,
  };
}

function hingeEventToUserUnits(
  event: JsonRecord,
  resolver: ReturnType<typeof createUnitResolver>,
): JsonRecord {
  return {
    ...event,
    plasticMoment: roundConverted(event.plasticMoment, resolver.moment),
  };
}

export class SteelRingFramePushoverAnalysis {
  readonly builder: SteelRingFrameBuilderLike;
  readonly solver: SteelRingFramePushoverSolverLike;

  constructor({
    builder = new SteelRingFrame2DBuilder(),
    solver = new SteelDisplacementControlPushoverSolver2D(),
  }: SteelRingFramePushoverAnalysisOptions = {}) {
    this.builder = builder;
    this.solver = solver;
  }

  analyze({
    model,
  }: SteelRingFramePushoverAnalysisInput = {}): SteelRingFramePushoverAnalysisResult {
    const resolvedModel = resolveModel(model ?? { id: "" });
    const frame = this.builder.build({ model: resolvedModel });
    const toFem = createUnitResolver(resolvedModel.units, FEM_UNITS);
    const solverResult = this.solver.solve({
      frame,
      controlDisplacementIncrement: toFem.length(resolvedModel.solver.controlDisplacementIncrement),
      maxControlDisplacement: toFem.length(resolvedModel.solver.maxControlDisplacement),
      tolerance: resolvedModel.solver.tolerance,
      maxIterations: resolvedModel.solver.maxIterations,
      maxSteps: resolvedModel.solver.maxSteps,
      yieldTolerance: resolvedModel.solver.yieldTolerance,
    });
    const userUnits = resolvedModel.sourceUnits() ?? FEM_UNITS;
    const resolverToUser = createUnitResolver(FEM_UNITS, userUnits);
    const points = solverResult.points.map((point) => pointToUserUnits(point, resolverToUser));

    return {
      status: points.length > 1 ? RESULT_STATUS.OK : RESULT_STATUS.NOT_VERIFIED,
      summary:
        "Non-linear static displacement-controlled pushover analysis of a standalone steel ring frame completed.",
      warnings: uniqueStrings([...frame.warnings, ...solverResult.warnings]),
      assumptions: uniqueStrings([...frame.assumptions, ...solverResult.assumptions]),
      outputs: {
        modelId: resolvedModel.id,
        frameIdealization: frame.snapshot,
        control: {
          nodeId: frame.controlNode.id,
          dof: resolvedModel.loading.controlDof,
          units: userUnits.length,
          increment: round(
            resolverToUser.length(toFem.length(resolvedModel.solver.controlDisplacementIncrement)),
          ),
          maxDisplacement: round(
            resolverToUser.length(toFem.length(resolvedModel.solver.maxControlDisplacement)),
          ),
        },
        capacityCurve: {
          units: {
            displacement: userUnits.length,
            baseShear: userUnits.force,
          },
          points,
          maxBaseShear: points.reduce(
            (maxValue, point) =>
              Math.max(maxValue, typeof point.baseShear === "number" ? point.baseShear : 0),
            0,
          ),
          ultimateControlDisplacement: points.at(-1)?.controlDisplacement ?? 0,
        },
        hingeEvents: solverResult.hingeEvents.map((event) =>
          hingeEventToUserUnits(event, resolverToUser),
        ),
        finalState: {
          loadFactor: round(solverResult.finalLoadFactor),
          termination: solverResult.termination,
          hingeStatesByElementId: Object.fromEntries(
            enumerableEntries(solverResult.hingeStatesByElementId).map(([elementId, state]) => [
              elementId,
              jsonValue(state),
            ]),
          ),
        },
      },
      metadata: {
        analysisType: "steel-ring-frame-pushover",
        modelId: resolvedModel.id,
        baseCondition: resolvedModel.baseCondition,
        includeBottomBeam: resolvedModel.includeBottomBeam,
        memberOrientations: Object.fromEntries(
          Object.entries(resolvedModel.memberOrientations).map(([key, value]) => [
            key,
            { ...value },
          ]),
        ),
      },
    };
  }
}
