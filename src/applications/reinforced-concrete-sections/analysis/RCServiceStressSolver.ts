import type { ConstitutiveLaw } from "../../../domain/constitutive-laws/types.js";
import type {
  ReferencePoint,
  ReinforcedConcreteSection,
} from "../../../domain/geometry/ReinforcedConcreteSection.js";
import { solveLinearSystem3x3 } from "../../../domain/math/arrayLinearAlgebra.js";
import { StrainField, createAffineStrainField } from "./StrainField.js";
import { RCSectionStateIntegrator } from "./RCSectionStateIntegrator.js";
import type { AffineStrainField, SectionFiber, SectionState, StrainFieldLike } from "./types.js";

export interface RCServiceStressSolverOptions {
  sectionIntegrator?: RCSectionStateIntegrator;
  tolerance?: number;
  maxIterations?: number;
  finiteDifferenceStep?: number;
}

export interface RCServiceStressActions {
  nEd?: number | undefined;
  axialForce?: number | undefined;
  mEd?: number | undefined;
  mxEd?: number | undefined;
  myEd?: number | undefined;
}

export interface RCServiceStressInitialGuess {
  eps0?: number;
  kappaY?: number;
  kappaZ?: number;
}

export interface RCServiceStressSolveOptions {
  section: ReinforcedConcreteSection;
  concreteFibers: SectionFiber[];
  concreteLaw: ConstitutiveLaw;
  steelLaw: ConstitutiveLaw;
  actions: RCServiceStressActions;
  referencePoint?: ReferencePoint | null;
  initialGuess?: RCServiceStressInitialGuess;
}

export interface RCServiceStressHistoryEntry {
  iteration: number;
  eps0: number;
  kappaY: number;
  kappaZ: number;
  norm: number;
  damping?: number;
}

export interface RCServiceStressResidual {
  n: number;
  mx: number;
  my: number;
}

export interface RCServiceStressResult {
  converged: boolean;
  analysisMode?: "uniaxial";
  iterations: number;
  strainField: StrainField;
  state: SectionState;
  residual: RCServiceStressResidual;
  history: RCServiceStressHistoryEntry[];
}

interface Resultants {
  N: number;
  Mx: number;
  My: number;
}

interface Evaluation {
  strainField: StrainFieldLike;
  state: Resultants | SectionState;
  residual: number[];
  norm: number;
}

function vectorValue(vector: readonly number[], index: number): number {
  const value = vector[index];
  if (value === undefined) {
    throw new Error("RCServiceStressSolver internal vector value is unavailable.");
  }
  return value;
}

function matrixRow(matrix: number[][], index: number): number[] {
  const row = matrix[index];
  if (row === undefined) {
    throw new Error("RCServiceStressSolver internal matrix row is unavailable.");
  }
  return row;
}

function residualNorm(residual: readonly number[]): number {
  return Math.sqrt(
    vectorValue(residual, 0) ** 2 + vectorValue(residual, 1) ** 2 + vectorValue(residual, 2) ** 2,
  );
}

function residualNormUniaxial(residual: readonly number[]): number {
  return Math.hypot(vectorValue(residual, 0), vectorValue(residual, 1));
}

function solveLinearSystem2x2(matrix: number[][], rightHandSide: number[]): [number, number] {
  const a = vectorValue(matrixRow(matrix, 0), 0);
  const b = vectorValue(matrixRow(matrix, 0), 1);
  const c = vectorValue(matrixRow(matrix, 1), 0);
  const d = vectorValue(matrixRow(matrix, 1), 1);
  const e = vectorValue(rightHandSide, 0);
  const f = vectorValue(rightHandSide, 1);
  const determinant = a * d - b * c;
  const scale = Math.max(Math.abs(a * d), Math.abs(b * c), 1);

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON * scale) {
    throw new Error("Cannot solve singular 2x2 linear system.");
  }

  return [(e * d - b * f) / determinant, (a * f - e * c) / determinant];
}

function resolveActions(actions: RCServiceStressActions): {
  nEd: number;
  mxEd: number;
  myEd: number;
} {
  const nEd = actions?.nEd ?? actions?.axialForce;
  const mxEd = actions?.mxEd ?? actions?.mEd ?? 0;
  const myEd = actions?.myEd ?? 0;

  if (!Number.isFinite(nEd) || !Number.isFinite(mxEd) || !Number.isFinite(myEd)) {
    throw new Error("RCServiceStressSolver requires finite actions nEd/mxEd/myEd values.");
  }

  return {
    nEd: nEd as number,
    mxEd,
    myEd,
  };
}

function validateSectionInput({
  section,
  concreteFibers,
}: Pick<RCServiceStressSolveOptions, "section" | "concreteFibers">): void {
  if (!section?.concreteSection) {
    throw new Error("RCServiceStressSolver requires a reinforced concrete section.");
  }

  if (!Array.isArray(concreteFibers) || concreteFibers.length === 0) {
    throw new Error("RCServiceStressSolver requires a non-empty concreteFibers array.");
  }
}

export class RCServiceStressSolver {
  readonly sectionIntegrator: RCSectionStateIntegrator;
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly finiteDifferenceStep: number;

  constructor({
    sectionIntegrator = new RCSectionStateIntegrator(),
    tolerance = 1e-3,
    maxIterations = 40,
    finiteDifferenceStep = 1e-8,
  }: RCServiceStressSolverOptions = {}) {
    this.sectionIntegrator = sectionIntegrator;
    this.tolerance = tolerance;
    this.maxIterations = maxIterations;
    this.finiteDifferenceStep = finiteDifferenceStep;
  }

  solve({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    actions,
    referencePoint = null,
    initialGuess = {},
  }: RCServiceStressSolveOptions): RCServiceStressResult {
    validateSectionInput({ section, concreteFibers });
    const { nEd, mxEd, myEd } = resolveActions(actions);
    const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateResultants =
      typeof this.sectionIntegrator.createResultantEvaluator === "function"
        ? this.sectionIntegrator.createResultantEvaluator({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            referencePoint: resolvedReferencePoint,
            includeConcreteTension: false,
          })
        : null;
    let variables = [initialGuess.eps0 ?? 0, initialGuess.kappaY ?? 0, initialGuess.kappaZ ?? 0];

    const evaluate = (values: number[], { includeResponseDetails = false } = {}): Evaluation => {
      const coefficients: AffineStrainField = {
        eps0: vectorValue(values, 0),
        kappaY: vectorValue(values, 1),
        kappaZ: vectorValue(values, 2),
      };
      const strainField = includeResponseDetails
        ? new StrainField(coefficients)
        : createAffineStrainField(coefficients);
      const state =
        !includeResponseDetails && evaluateResultants
          ? evaluateResultants(strainField)
          : this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension: false,
              includeResponseDetails,
            });
      const residual = [state.N - nEd, state.Mx - mxEd, state.My - myEd];

      return {
        strainField,
        state,
        residual,
        norm: residualNorm(residual),
      };
    };

    let current = evaluate(variables);
    const history: RCServiceStressHistoryEntry[] = [
      {
        iteration: 0,
        eps0: vectorValue(variables, 0),
        kappaY: vectorValue(variables, 1),
        kappaZ: vectorValue(variables, 2),
        norm: current.norm,
      },
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      if (current.norm <= this.tolerance) {
        const detailed = evaluate(variables, {
          includeResponseDetails: true,
        });

        return {
          converged: true,
          iterations: iteration - 1,
          strainField: detailed.strainField as StrainField,
          state: detailed.state as SectionState,
          residual: {
            n: vectorValue(detailed.residual, 0),
            mx: vectorValue(detailed.residual, 1),
            my: vectorValue(detailed.residual, 2),
          },
          history,
        };
      }

      const base = variables;
      const jacobian: number[][] = [[], [], []];

      for (let column = 0; column < 3; column += 1) {
        const perturbed = [...base];
        perturbed[column] = vectorValue(perturbed, column) + this.finiteDifferenceStep;
        const evaluated = evaluate(perturbed);

        for (let row = 0; row < 3; row += 1) {
          matrixRow(jacobian, row)[column] =
            (vectorValue(evaluated.residual, row) - vectorValue(current.residual, row)) /
            this.finiteDifferenceStep;
        }
      }

      const increment = solveLinearSystem3x3(
        jacobian,
        current.residual.map((value) => -value),
      );
      let accepted = false;
      let damping = 1;
      let candidate = current;

      while (damping >= 1 / 64) {
        const trialVariables = base.map(
          (value, index) => value + damping * vectorValue(increment, index),
        );
        const trial = evaluate(trialVariables);

        if (trial.norm < current.norm) {
          variables = trialVariables;
          candidate = trial;
          accepted = true;
          history.push({
            iteration,
            eps0: vectorValue(variables, 0),
            kappaY: vectorValue(variables, 1),
            kappaZ: vectorValue(variables, 2),
            norm: candidate.norm,
            damping,
          });
          break;
        }

        damping /= 2;
      }

      if (!accepted) {
        break;
      }

      current = candidate;
    }

    const detailed = evaluate(variables, {
      includeResponseDetails: true,
    });

    return {
      converged: current.norm <= this.tolerance,
      iterations: history.length - 1,
      strainField: detailed.strainField as StrainField,
      state: detailed.state as SectionState,
      residual: {
        n: vectorValue(detailed.residual, 0),
        mx: vectorValue(detailed.residual, 1),
        my: vectorValue(detailed.residual, 2),
      },
      history,
    };
  }

  solveUniaxial({
    section,
    concreteFibers,
    concreteLaw,
    steelLaw,
    actions,
    referencePoint = null,
    initialGuess = {},
  }: RCServiceStressSolveOptions): RCServiceStressResult {
    validateSectionInput({ section, concreteFibers });
    const { nEd, mxEd, myEd } = resolveActions(actions);

    if (Math.abs(myEd) > this.tolerance) {
      throw new Error("RCServiceStressSolver uniaxial analysis requires myEd equal to zero.");
    }

    const resolvedReferencePoint = referencePoint ?? section.getReferencePoint("concrete-centroid");
    const evaluateResultants =
      typeof this.sectionIntegrator.createResultantEvaluator === "function"
        ? this.sectionIntegrator.createResultantEvaluator({
            section,
            concreteFibers,
            concreteLaw,
            steelLaw,
            referencePoint: resolvedReferencePoint,
            includeConcreteTension: false,
          })
        : null;
    let variables = [initialGuess.eps0 ?? 0, initialGuess.kappaZ ?? 0];

    const evaluate = (values: number[], { includeResponseDetails = false } = {}): Evaluation => {
      const coefficients: AffineStrainField = {
        eps0: vectorValue(values, 0),
        kappaY: 0,
        kappaZ: vectorValue(values, 1),
      };
      const strainField = includeResponseDetails
        ? new StrainField(coefficients)
        : createAffineStrainField(coefficients);
      const state =
        !includeResponseDetails && evaluateResultants
          ? evaluateResultants(strainField)
          : this.sectionIntegrator.evaluate({
              section,
              concreteFibers,
              concreteLaw,
              steelLaw,
              strainField,
              referencePoint: resolvedReferencePoint,
              includeConcreteTension: false,
              includeResponseDetails,
            });
      const residual = [state.N - nEd, state.Mx - mxEd];

      return {
        strainField,
        state,
        residual,
        norm: residualNormUniaxial(residual),
      };
    };

    let current = evaluate(variables);
    const history: RCServiceStressHistoryEntry[] = [
      {
        iteration: 0,
        eps0: vectorValue(variables, 0),
        kappaY: 0,
        kappaZ: vectorValue(variables, 1),
        norm: current.norm,
      },
    ];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      if (current.norm <= this.tolerance) {
        const detailed = evaluate(variables, {
          includeResponseDetails: true,
        });

        return {
          converged: true,
          analysisMode: "uniaxial",
          iterations: iteration - 1,
          strainField: detailed.strainField as StrainField,
          state: detailed.state as SectionState,
          residual: {
            n: vectorValue(detailed.residual, 0),
            mx: vectorValue(detailed.residual, 1),
            my: detailed.state.My - myEd,
          },
          history,
        };
      }

      const base = variables;
      const jacobian: number[][] = [[], []];

      for (let column = 0; column < 2; column += 1) {
        const perturbed = [...base];
        perturbed[column] = vectorValue(perturbed, column) + this.finiteDifferenceStep;
        const evaluated = evaluate(perturbed);

        for (let row = 0; row < 2; row += 1) {
          matrixRow(jacobian, row)[column] =
            (vectorValue(evaluated.residual, row) - vectorValue(current.residual, row)) /
            this.finiteDifferenceStep;
        }
      }

      const increment = solveLinearSystem2x2(
        jacobian,
        current.residual.map((value) => -value),
      );
      let accepted = false;
      let damping = 1;
      let candidate = current;

      while (damping >= 1 / 64) {
        const trialVariables = base.map(
          (value, index) => value + damping * vectorValue(increment, index),
        );
        const trial = evaluate(trialVariables);

        if (trial.norm < current.norm) {
          variables = trialVariables;
          candidate = trial;
          accepted = true;
          history.push({
            iteration,
            eps0: vectorValue(variables, 0),
            kappaY: 0,
            kappaZ: vectorValue(variables, 1),
            norm: candidate.norm,
            damping,
          });
          break;
        }

        damping /= 2;
      }

      if (!accepted) {
        break;
      }

      current = candidate;
    }

    const detailed = evaluate(variables, {
      includeResponseDetails: true,
    });

    return {
      converged: current.norm <= this.tolerance,
      analysisMode: "uniaxial",
      iterations: history.length - 1,
      strainField: detailed.strainField as StrainField,
      state: detailed.state as SectionState,
      residual: {
        n: vectorValue(detailed.residual, 0),
        mx: vectorValue(detailed.residual, 1),
        my: detailed.state.My - myEd,
      },
      history,
    };
  }
}
