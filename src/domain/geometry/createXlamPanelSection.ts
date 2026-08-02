// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751;
// source path: src/domain/geometry/createXlamPanelSection.js.

import { getXlamPanelProduct } from "../catalogs/xlamPanelCatalog.js";
import type { UnitSystemInput } from "../units/UnitSystem.js";
import { XlamPanelSection, type XlamPanelSectionOptions } from "./XlamPanelSection.js";

export interface CreateXlamPanelSectionOptions
  extends Omit<
    XlamPanelSectionOptions,
    "effectiveWidth" | "layerThicknesses" | "activeLayerIndexes"
  > {
  productId?: string | null;
  effectiveWidth?: number | null;
  layerThicknesses?: readonly number[] | null;
  activeLayerIndexes?: readonly number[] | null;
  units?: UnitSystemInput | null;
}

function productNumber(product: Record<string, unknown> | null, key: string): number | undefined {
  const value = product?.[key];
  return typeof value === "number" ? value : undefined;
}

function productNumberArray(
  product: Record<string, unknown> | null,
  key: string,
): number[] | undefined {
  const value = product?.[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: number[] = [];
  for (const item of value) {
    if (typeof item !== "number") {
      return undefined;
    }
    result.push(item);
  }

  return result;
}

export function createXlamPanelSection({
  productId = null,
  effectiveWidth = null,
  layerThicknesses = null,
  activeLayerIndexes = null,
  units = null,
  ...options
}: CreateXlamPanelSectionOptions = {}): XlamPanelSection {
  const product = productId ? getXlamPanelProduct(productId) : null;
  const productRecord: Record<string, unknown> | null = product;
  const productMetadata = product?.metadata ?? {};
  const optionMetadata = options.metadata ?? {};

  return new XlamPanelSection({
    effectiveWidth: effectiveWidth ?? productNumber(productRecord, "effectiveWidth") ?? 1000,
    layerThicknesses: layerThicknesses ?? productNumberArray(productRecord, "layerThicknesses"),
    activeLayerIndexes: activeLayerIndexes ??
      productNumberArray(productRecord, "activeLayerIndexes") ?? [0, 2, 4],
    units,
    metadata: {
      ...productMetadata,
      ...optionMetadata,
      productId: product?.id ?? productId ?? null,
      producer: productRecord?.["producer"] ?? null,
    },
    ...options,
  });
}
