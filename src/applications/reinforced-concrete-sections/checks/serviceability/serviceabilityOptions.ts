import {
  DEFAULT_RC_SLE_MODULAR_RATIO,
  resolveRcSleModularRatio,
} from "../../serviceabilityDefaults.js";

export type RcServiceabilityEnvironment = string;

export interface RcLongitudinalReinforcementGroup {
  id: string;
  face?: string;
  barIds?: Array<string | number>;
  spacing?: number | null;
}

export interface RcCrackingOptions {
  environment?: RcServiceabilityEnvironment;
  reinforcementSensitivity?: string;
  modularRatio?: number | null;
  tensionReinforcementGroupId?: string | null;
}

export interface RcDeflectionOptions {
  creepCoefficient?: number;
  includeShrinkage?: boolean;
  modularRatio?: number | null;
  [key: string]: unknown;
}

export interface RcServiceabilityOptions extends Record<string, unknown> {
  environment?: RcServiceabilityEnvironment;
  reinforcementSensitivity?: string;
  modularRatio?: number | null;
  rowTolerance?: number;
  creepCoefficient?: number;
  includeShrinkage?: boolean;
  cracking?: RcCrackingOptions;
  deflection?: RcDeflectionOptions | false;
  tensionReinforcementGroupId?: string | null;
  longitudinalReinforcementGroups?: RcLongitudinalReinforcementGroup[];
}

export interface ResolvedRcServiceabilityOptions extends Record<string, unknown> {
  environment: RcServiceabilityEnvironment;
  reinforcementSensitivity: string;
  modularRatio: number;
  rowTolerance: number;
  creepCoefficient: number;
  includeShrinkage: boolean;
  tensionReinforcementGroupId?: string | null;
  longitudinalReinforcementGroups?: RcLongitudinalReinforcementGroup[];
  cracking: RcCrackingOptions;
  deflection: {
    creepCoefficient: number;
    includeShrinkage: boolean;
    modularRatio?: number | null;
    [key: string]: unknown;
  };
}

export const DEFAULT_SERVICEABILITY_OPTIONS = Object.freeze({
  environment: "ordinary",
  reinforcementSensitivity: "low",
  modularRatio: DEFAULT_RC_SLE_MODULAR_RATIO,
  rowTolerance: 50,
  creepCoefficient: 2,
  includeShrinkage: false,
});

export function normalizeEnvironment(
  environment: RcServiceabilityEnvironment | null | undefined,
): string {
  return String(environment ?? "ordinary")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

export function resolveServiceabilityOptions(
  options: RcServiceabilityOptions = {},
): ResolvedRcServiceabilityOptions {
  const deflectionOptions = options.deflection === false ? {} : (options.deflection ?? {});
  const serviceability: ResolvedRcServiceabilityOptions = {
    ...DEFAULT_SERVICEABILITY_OPTIONS,
    ...options,
    cracking: {
      ...(options.cracking ?? {}),
    },
    deflection: {
      ...deflectionOptions,
      creepCoefficient:
        deflectionOptions.creepCoefficient ??
        options.creepCoefficient ??
        DEFAULT_SERVICEABILITY_OPTIONS.creepCoefficient,
      includeShrinkage:
        deflectionOptions.includeShrinkage ??
        options.includeShrinkage ??
        DEFAULT_SERVICEABILITY_OPTIONS.includeShrinkage,
    },
    environment:
      options.cracking?.environment ??
      options.environment ??
      DEFAULT_SERVICEABILITY_OPTIONS.environment,
    reinforcementSensitivity:
      options.cracking?.reinforcementSensitivity ??
      options.reinforcementSensitivity ??
      DEFAULT_SERVICEABILITY_OPTIONS.reinforcementSensitivity,
    modularRatio: resolveRcSleModularRatio(
      options.cracking?.modularRatio,
      deflectionOptions.modularRatio,
      options.modularRatio,
    ),
    rowTolerance: options.rowTolerance ?? DEFAULT_SERVICEABILITY_OPTIONS.rowTolerance,
    creepCoefficient: options.creepCoefficient ?? DEFAULT_SERVICEABILITY_OPTIONS.creepCoefficient,
    includeShrinkage: options.includeShrinkage ?? DEFAULT_SERVICEABILITY_OPTIONS.includeShrinkage,
  };

  return serviceability;
}
