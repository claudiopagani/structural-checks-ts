// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/domain/catalogs/xlamPanelCatalog.js.

export interface XlamPanelProductInput extends Record<string, unknown> {
  id?: unknown;
  layerThicknesses?: Iterable<unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface XlamPanelProduct extends Record<string, unknown> {
  id: unknown;
  layerThicknesses: unknown[];
  metadata: Record<string, unknown>;
}

const XLAM_PANEL_PRODUCTS = new Map<unknown, XlamPanelProduct>();

function hasProductId(
  product: XlamPanelProductInput | null | undefined,
): product is XlamPanelProductInput & { id: unknown } {
  return Boolean(product?.id);
}

export function registerXlamPanelProduct(product: XlamPanelProductInput | null | undefined): void {
  if (!hasProductId(product)) {
    throw new Error("XLAM panel product requires an id.");
  }

  XLAM_PANEL_PRODUCTS.set(product.id, {
    ...product,
    layerThicknesses: [...(product.layerThicknesses ?? [])],
    metadata: { ...(product.metadata ?? {}) },
  });
}

export function getXlamPanelProduct(productId: unknown): XlamPanelProduct | null {
  const product = XLAM_PANEL_PRODUCTS.get(productId);

  return product ? cloneXlamPanelProduct(product) : null;
}

export function listXlamPanelProducts(): XlamPanelProduct[] {
  return [...XLAM_PANEL_PRODUCTS.values()].map(cloneXlamPanelProduct);
}

function cloneXlamPanelProduct(product: XlamPanelProduct): XlamPanelProduct {
  return {
    ...product,
    layerThicknesses: [...product.layerThicknesses],
    metadata: { ...product.metadata },
  };
}

registerXlamPanelProduct({
  id: "generic-5s-30-30-30",
  producer: "generic",
  name: "Generic 5-layer CLT 30/30/30",
  layerThicknesses: [0, 0, 30, 30, 30],
  metadata: {
    note: "Placeholder generic product. Replace or extend with producer catalogs.",
  },
});
