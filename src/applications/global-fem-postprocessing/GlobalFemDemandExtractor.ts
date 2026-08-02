// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751.

import type {
  FemLineElementActionResult,
  FemResultCaseReference,
  FemShellResultantResult,
  GlobalFemModelContract,
  GlobalFemResultContract,
} from "../../domain/fem/contracts/FemContractTypes.js";
import type {
  GlobalFemComponentEnvelope,
  GlobalFemComponentEnvelopeValue,
  GlobalFemDemandExtractionRequest,
  GlobalFemDemandLocation,
  GlobalFemJointDemand,
  GlobalFemJointDemandElementEnd,
  GlobalFemJointDemandState,
  GlobalFemLineDemandState,
  GlobalFemLineDemandStation,
  GlobalFemLineElementDemand,
  GlobalFemMemberDemandGroup,
  GlobalFemResultReference,
  GlobalFemShellElementDemand,
  GlobalFemStructuralClassificationProposal,
  GlobalFemSurfaceDemandGroup,
  GlobalFemDemandSet,
} from "./GlobalFemPostProcessingTypes.js";

export const GLOBAL_FEM_DEMAND_SET_VERSION = 0;

const REFERENCE_KEYS = Object.freeze([
  "procedureId",
  "loadCaseId",
  "combinationId",
  "modeNumber",
  "step",
  "time",
  "envelopeId",
] as const);

function clone<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

type ResultReferenceEntry = FemResultCaseReference & {
  readonly procedureId?: string;
  readonly modeNumber?: number;
  readonly envelopeId?: string;
};

function referenceValue(
  entry: ResultReferenceEntry,
  key: (typeof REFERENCE_KEYS)[number],
): string | number | undefined {
  switch (key) {
    case "procedureId":
      return entry.procedureId;
    case "loadCaseId":
      return entry.loadCaseId;
    case "combinationId":
      return entry.combinationId;
    case "modeNumber":
      return entry.modeNumber;
    case "step":
      return entry.step;
    case "time":
      return entry.time;
    case "envelopeId":
      return entry.envelopeId;
  }
}

function resultReference(entry: ResultReferenceEntry): GlobalFemResultReference {
  return Object.fromEntries(
    REFERENCE_KEYS.flatMap((key) => {
      const value = referenceValue(entry, key);
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function referenceKey(reference: GlobalFemResultReference): string {
  return JSON.stringify(REFERENCE_KEYS.map((key) => reference[key] ?? null));
}

type MutableGlobalFemComponentEnvelope = {
  minimum: GlobalFemComponentEnvelopeValue | null;
  maximum: GlobalFemComponentEnvelopeValue | null;
};

function updateExtreme(
  envelope: MutableGlobalFemComponentEnvelope,
  kind: "minimum" | "maximum",
  candidate: GlobalFemComponentEnvelopeValue,
): void {
  if (
    envelope[kind] == null ||
    (kind === "minimum" && candidate.value < envelope[kind].value) ||
    (kind === "maximum" && candidate.value > envelope[kind].value)
  ) {
    envelope[kind] = candidate;
  }
}

function componentEnvelopes(
  samples: readonly {
    readonly reference: GlobalFemResultReference;
    readonly location: GlobalFemDemandLocation;
    readonly components: Readonly<Record<string, number>>;
  }[],
): Readonly<Record<string, GlobalFemComponentEnvelope>> {
  const envelopes: Record<string, MutableGlobalFemComponentEnvelope> = {};
  for (const sample of samples) {
    for (const [component, value] of Object.entries(sample.components ?? {})) {
      if (!Number.isFinite(value)) continue;
      if (!envelopes[component]) {
        envelopes[component] = { minimum: null, maximum: null };
      }
      const candidate = {
        value,
        reference: clone(sample.reference),
        location: clone(sample.location),
      };
      updateExtreme(envelopes[component], "minimum", candidate);
      updateExtreme(envelopes[component], "maximum", candidate);
    }
  }
  return envelopes;
}

function extractLineElementDemands(
  model: GlobalFemModelContract,
  result: GlobalFemResultContract,
): readonly GlobalFemLineElementDemand[] {
  const resultByElement = new Map<string, FemLineElementActionResult[]>();
  for (const element of model.lineElements) resultByElement.set(element.id, []);
  for (const entry of result.results.lineElementActions ?? []) {
    resultByElement.get(entry.lineElementId)?.push(entry);
  }

  return model.lineElements.map((element) => {
    const states = (resultByElement.get(element.id) ?? []).map((entry) => ({
      reference: resultReference(entry),
      coordinateSystem: entry.coordinateSystem,
      stations: clone(entry.stations),
    }));
    const samples = states.flatMap((state) =>
      state.stations.map((station) => ({
        reference: state.reference,
        location: {
          xi: station.xi,
          position: station.position,
          side: station.side,
        },
        components: station.actions,
      })),
    );
    return {
      lineElementId: element.id,
      nodeIds: [...element.nodeIds],
      sectionId: element.sectionId,
      materialId: element.materialId,
      localAxes: clone(element.localAxes),
      actionStates: states,
      componentEnvelopes: componentEnvelopes(samples),
    };
  });
}

function extractShellElementDemands(
  model: GlobalFemModelContract,
  result: GlobalFemResultContract,
): readonly GlobalFemShellElementDemand[] {
  const resultByElement = new Map<string, FemShellResultantResult[]>();
  for (const element of model.shellElements) resultByElement.set(element.id, []);
  for (const entry of result.results.shellResultants ?? []) {
    resultByElement.get(entry.shellElementId)?.push(entry);
  }

  return model.shellElements.map((element) => {
    const states = (resultByElement.get(element.id) ?? []).map((entry) => ({
      reference: resultReference(entry),
      coordinateSystem: entry.coordinateSystem,
      face: entry.face,
      location: clone(entry.location),
      components: clone(entry.components),
    }));
    return {
      shellElementId: element.id,
      nodeIds: [...element.nodeIds],
      sectionId: element.sectionId,
      materialId: element.materialId,
      localAxes: clone(element.localAxes),
      resultantStates: states,
      componentEnvelopes: componentEnvelopes(
        states.map((state) => ({
          reference: state.reference,
          location: { face: state.face, ...state.location },
          components: state.components,
        })),
      ),
    };
  });
}

function groupMemberDemands(
  classifications: readonly GlobalFemStructuralClassificationProposal["members"][number][],
  demandIndex: ReadonlyMap<string, GlobalFemLineElementDemand>,
): readonly GlobalFemMemberDemandGroup[] {
  return classifications.map((entity) => ({
    id: entity.id,
    classification: clone(entity.classification),
    lineElementIds: [...entity.lineElementIds],
    elementDemands: entity.lineElementIds
      .map((id) => demandIndex.get(id))
      .filter((item): item is GlobalFemLineElementDemand => item !== undefined)
      .map(clone),
  }));
}

function groupSurfaceDemands(
  classifications: readonly GlobalFemStructuralClassificationProposal["surfaces"][number][],
  demandIndex: ReadonlyMap<string, GlobalFemShellElementDemand>,
): readonly GlobalFemSurfaceDemandGroup[] {
  return classifications.map((entity) => ({
    id: entity.id,
    classification: clone(entity.classification),
    shellElementIds: [...entity.shellElementIds],
    elementDemands: entity.shellElementIds
      .map((id) => demandIndex.get(id))
      .filter((item): item is GlobalFemShellElementDemand => item !== undefined)
      .map(clone),
  }));
}

function closestEndStation(
  actionState: GlobalFemLineDemandState,
  end: "start" | "end",
): GlobalFemLineDemandStation | null {
  if (actionState.stations.length === 0) return null;
  const targetXi = end === "start" ? 0 : 1;
  return actionState.stations.reduce((closest, station) =>
    Math.abs(station.xi - targetXi) < Math.abs(closest.xi - targetXi) ? station : closest,
  );
}

function extractJointDemands(
  joints: readonly GlobalFemStructuralClassificationProposal["joints"][number][],
  lineDemandIndex: ReadonlyMap<string, GlobalFemLineElementDemand>,
): readonly GlobalFemJointDemand[] {
  return joints.map((joint) => {
    const states = new Map<
      string,
      {
        readonly reference: GlobalFemResultReference;
        readonly elementEnds: GlobalFemJointDemandElementEnd[];
      }
    >();
    for (const elementEnd of joint.lineElementEnds) {
      const demand = lineDemandIndex.get(elementEnd.lineElementId);
      for (const actionState of demand?.actionStates ?? []) {
        const key = referenceKey(actionState.reference);
        if (!states.has(key)) {
          states.set(key, {
            reference: clone(actionState.reference),
            elementEnds: [],
          });
        }
        const station = closestEndStation(actionState, elementEnd.end);
        const targetXi = elementEnd.end === "start" ? 0 : 1;
        const state = states.get(key);
        if (!state) throw new Error(`Missing FEM joint demand state ${key}.`);
        state.elementEnds.push({
          lineElementId: elementEnd.lineElementId,
          end: elementEnd.end,
          coordinateSystem: actionState.coordinateSystem,
          station: clone(station),
          atElementEnd: station != null && Math.abs(station.xi - targetXi) <= 1e-8,
        });
      }
    }

    const demandStates: GlobalFemJointDemandState[] = [...states.values()].map((state) => {
      const present = new Set(
        state.elementEnds
          .filter((entry) => entry.atElementEnd)
          .map((entry) => `${entry.lineElementId}:${entry.end}`),
      );
      const missingElementEnds = joint.lineElementEnds.filter(
        (entry) => !present.has(`${entry.lineElementId}:${entry.end}`),
      );
      return {
        ...state,
        complete: missingElementEnds.length === 0,
        missingElementEnds: clone(missingElementEnds),
      };
    });
    return {
      jointId: joint.id,
      nodeId: joint.nodeId,
      classification: clone(joint.classification),
      lineElementEnds: clone(joint.lineElementEnds),
      demandStates,
      complete: demandStates.length > 0 && demandStates.every((state) => state.complete),
    };
  });
}

export function extractGlobalFemDemands({
  model,
  analysis,
  result,
  classification,
}: GlobalFemDemandExtractionRequest = {}): GlobalFemDemandSet {
  if (!model || !analysis || !result || !classification) {
    throw new Error(
      "Global FEM demand extraction requires model, analysis, result and classification.",
    );
  }
  const lineElementDemands = extractLineElementDemands(model, result);
  const shellElementDemands = extractShellElementDemands(model, result);
  const lineDemandIndex = new Map(lineElementDemands.map((item) => [item.lineElementId, item]));
  const shellDemandIndex = new Map(shellElementDemands.map((item) => [item.shellElementId, item]));

  return {
    schema: "strutture-js/global-fem-demand-set",
    version: GLOBAL_FEM_DEMAND_SET_VERSION,
    model: { id: model.id, hash: model.hash },
    analysis: { id: analysis.id, hash: analysis.hash },
    resultId: result.id,
    units: clone(result.units),
    signConventions: clone(result.signConventions),
    provenance: clone(result.provenance),
    lineElementDemands,
    shellElementDemands,
    memberDemands: groupMemberDemands(classification.members, lineDemandIndex),
    surfaceDemands: groupSurfaceDemands(classification.surfaces, shellDemandIndex),
    jointDemands: extractJointDemands(classification.joints, lineDemandIndex),
    globalResponses: {
      nodalDisplacements: clone(result.results.nodalDisplacements ?? []),
      reactions: clone(result.results.reactions ?? []),
      modes: clone(result.results.modes ?? []),
      sectionCuts: clone(result.results.sectionCuts ?? []),
      storeyResults: clone(result.results.storeyResults ?? []),
      equilibriumResiduals: clone(result.results.equilibriumResiduals ?? []),
      envelopes: clone(result.results.envelopes ?? []),
      qualityIndicators: clone(result.qualityIndicators ?? {}),
    },
    metadata: {
      noCrossElementAxisAggregation: true,
      normativeVerificationPerformed: false,
    },
  };
}
