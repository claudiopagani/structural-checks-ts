import test from "node:test";

import {
  GROUND_ANCHOR_BOND_CATALOG,
  GROUND_ANCHOR_BOND_CATALOG_IDS,
  GROUND_ANCHOR_BOND_CATALOG_REFERENCE,
  getGroundAnchorBondCatalogEntry,
  listGroundAnchorBondCatalogEntries,
  type GroundAnchorBondCatalogEntry,
} from "../dist/index.js";

const entry: GroundAnchorBondCatalogEntry = getGroundAnchorBondCatalogEntry(
  GROUND_ANCHOR_BOND_CATALOG_IDS[0] ?? "sand-gravel-loose",
);
const entries: GroundAnchorBondCatalogEntry[] = listGroundAnchorBondCatalogEntries();

void test("ground-anchor bond catalog exposes a strict typed consumer contract", () => {
  void GROUND_ANCHOR_BOND_CATALOG;
  void GROUND_ANCHOR_BOND_CATALOG_REFERENCE;
  void entry.ultimateTransferLoad;
  void entries.length;
});
