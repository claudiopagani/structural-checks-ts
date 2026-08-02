export interface GroundAnchorBondCatalogReference {
  title: string;
  publication: string;
  year: number;
  sections: string[];
  url: string;
}

export type GroundAnchorBondGroundClass = "soil" | "competent-rock";

export interface GroundAnchorBondCatalogEntry {
  id: string;
  name: string;
  model: string;
  groundClass: string;
  ultimateTransferLoad: number;
  capacityDivisor: number;
  units: string;
  status: string;
  reference: GroundAnchorBondCatalogReference;
}

export const GROUND_ANCHOR_BOND_CATALOG_REFERENCE: Readonly<GroundAnchorBondCatalogReference> =
  Object.freeze({
    title: "FHWA GEC 4, Ground Anchors and Anchored Systems",
    publication: "FHWA-IF-99-015",
    year: 1999,
    sections: ["5.3.6", "Tables 6 and 8"],
    url: "https://www.fhwa.dot.gov/engineering/geotech/pubs/if99015.pdf",
  });

const ENTRIES: readonly GroundAnchorBondCatalogEntry[] = Object.freeze(
  [
    {
      id: "sand-gravel-loose",
      name: "Sand and gravel, loose",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 145,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-gravel-medium-dense",
      name: "Sand and gravel, medium dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 220,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-gravel-dense",
      name: "Sand and gravel, dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 290,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-loose",
      name: "Sand, loose",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 100,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-medium-dense",
      name: "Sand, medium dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 145,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-dense",
      name: "Sand, dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 190,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-silt-loose",
      name: "Sand and silt, loose",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 70,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-silt-medium-dense",
      name: "Sand and silt, medium dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 100,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sand-silt-dense",
      name: "Sand and silt, dense",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 130,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "low-plasticity-silt-clay-stiff",
      name: "Low-plasticity silt-clay mixture or fine micaceous sand/silt, stiff",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 30,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "low-plasticity-silt-clay-hard",
      name: "Low-plasticity silt-clay mixture or fine micaceous sand/silt, hard",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "soil",
      ultimateTransferLoad: 60,
      capacityDivisor: 2,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "granite-basalt",
      name: "Granite or basalt",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 730,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "dolomitic-limestone",
      name: "Dolomitic limestone",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 580,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "soft-limestone",
      name: "Soft limestone",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 440,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "sandstone",
      name: "Sandstone",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 440,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "slate-hard-shale",
      name: "Slate or hard shale",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 360,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
    {
      id: "soft-shale",
      name: "Soft shale",
      model: "small-diameter-straight-shaft-gravity-grouted",
      groundClass: "competent-rock",
      ultimateTransferLoad: 150,
      capacityDivisor: 3,
      units: "kN/m",
      status: "presumptive-preliminary-design",
      reference: GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
    },
  ].map((entry) => Object.freeze(entry)),
);

export const GROUND_ANCHOR_BOND_CATALOG: Readonly<Record<string, GroundAnchorBondCatalogEntry>> =
  Object.freeze(Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry])));

export const GROUND_ANCHOR_BOND_CATALOG_IDS: readonly string[] = Object.freeze(
  ENTRIES.map(({ id }) => id),
);

export function listGroundAnchorBondCatalogEntries(): GroundAnchorBondCatalogEntry[] {
  return ENTRIES.map((entry) => structuredClone(entry));
}

export function getGroundAnchorBondCatalogEntry(id: string): GroundAnchorBondCatalogEntry {
  const entry = GROUND_ANCHOR_BOND_CATALOG[id];
  if (!entry) throw new Error(`Unknown ground-anchor bond catalog id: ${id}.`);
  return structuredClone(entry);
}
