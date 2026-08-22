import {
  buildSimplifiedMasonryArchGeometry,
  createMasonryArch,
  evaluateMasonryArchCurveAtStation,
  type AnalyzeMasonryArchVerificationOptions,
  type ArchReinforcementInput,
  type MasonryArchModel,
} from "structural-checks-ts/applications/masonry-arches";

export type ExtradosContactPerformanceCase = "U" | "P" | "A";

const DOMAIN_SEARCH_ITERATIONS = 64;

function loadedDomainStations(): { readonly start: number; readonly end: number } {
  const geometry = buildSimplifiedMasonryArchGeometry({
    kind: "simplified-symmetric",
    referenceCurve: "intrados",
    profile: { type: "circular" },
    span: 4,
    rise: 1.25,
    thickness: 0.3,
    outOfPlaneWidth: 1,
    voussoirCount: 31,
    stationing: "equal-arc-length",
  });
  let lower = 0;
  let upper = geometry.totalReferenceArcLength / 2;
  for (let iteration = 0; iteration < DOMAIN_SEARCH_ITERATIONS; iteration += 1) {
    const station = (lower + upper) / 2;
    if (evaluateMasonryArchCurveAtStation(geometry, station).extrados.x < -2) lower = station;
    else upper = station;
  }
  const start = (lower + upper) / 2 / geometry.totalReferenceArcLength;
  return { start, end: 1 - start };
}

function mappedStation(start: number, end: number, station: number): number {
  return start + Math.min(1, Math.max(0, station)) * (end - start);
}

function extradosReinforcement(
  caseId: ExtradosContactPerformanceCase,
): readonly ArchReinforcementInput[] {
  if (caseId === "U") return [];
  const active = caseId === "A";
  return [
    {
      id: "EXTRADOS-CABLE",
      side: "extrados",
      area: (active ? 100 : 800) / 1_000_000,
      elasticModulus: 200 * 1_000_000,
      initialForce: active ? 20 : 0,
      yieldStrength: 355 * 1_000,
      tensileStrength: 510 * 1_000,
      topology: {
        type: "open",
        left: { type: "arch-anchor", station: 0 },
        right: { type: "arch-anchor", station: 1 },
        interaction: { type: "unilateral-contact", segmentCount: 31 },
      },
    },
  ];
}

/** OCFEM Standard-default-equivalent U/P/A regression model used by the 0.2.1 campaign. */
export function createExtradosContactPerformanceModel(
  caseId: ExtradosContactPerformanceCase,
): MasonryArchModel {
  const domain = loadedDomainStations();
  return createMasonryArch({
    id: `ocfem-standard-extrados-${caseId}`,
    units: { force: "kN", length: "m" },
    geometry: {
      kind: "simplified-symmetric",
      referenceCurve: "intrados",
      profile: { type: "circular" },
      span: 4,
      rise: 1.25,
      thickness: 0.3,
      outOfPlaneWidth: 1,
      voussoirCount: 31,
      stationing: "equal-arc-length",
    },
    masonry: { unitWeight: 18 },
    interfaceLaw: {
      response: "deformable",
      normal: {
        type: "elastic-no-tension",
        elasticModulus: 2_000 * 1_000,
        characteristicLength: 50 / 1_000,
        integrationPointCount: 8,
      },
      tangential: {
        type: "elastic-unbounded",
        shearModulus: 800 * 1_000,
        characteristicLength: 50 / 1_000,
      },
      reporting: { approachingLimitRatio: 0.9 },
    },
    loads: [
      { id: "SW", type: "self-weight", loadCaseId: "G1" },
      {
        id: "FILL",
        type: "fill",
        loadCaseId: "G2",
        unitWeight: 18,
        startStation: domain.start,
        endStation: domain.end,
      },
      {
        id: "DISTRIBUTED-load-1",
        type: "patch",
        loadCaseId: "G3",
        components: { x: 0, y: -3 },
        distributionBasis: "horizontal-projection",
        distributionCurve: "extrados",
        applicationCurve: "extrados",
        startStation: domain.start,
        endStation: domain.end,
      },
      {
        id: "DISTRIBUTED-load-2",
        type: "patch",
        loadCaseId: "Q1",
        components: { x: 0, y: -2 },
        distributionBasis: "horizontal-projection",
        distributionCurve: "extrados",
        applicationCurve: "extrados",
        startStation: mappedStation(domain.start, domain.end, 0.05),
        endStation: mappedStation(domain.start, domain.end, 0.45),
      },
    ],
    reinforcements: extradosReinforcement(caseId),
  });
}

export const EXTRADOS_CONTACT_PERFORMANCE_OPTIONS = {
  units: { force: "kN", length: "m" },
  loadCombination: {
    id: "OCFEM-MASONRY-ARCH",
    combinationType: "assigned",
    factors: ["G1", "G2", "G3", "Q1"].map((id) => ({ loadCase: { id }, factor: 1 })),
  },
  scalableLoadCaseIds: ["Q1"],
  maxSteps: 200,
  maxIterations: 30,
} as const satisfies AnalyzeMasonryArchVerificationOptions;
