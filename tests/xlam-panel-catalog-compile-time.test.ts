import test from "node:test";

import {
  getXlamPanelProduct,
  listXlamPanelProducts,
  registerXlamPanelProduct,
} from "../dist/index.js";
import type { XlamPanelProduct, XlamPanelProductInput } from "../dist/index.js";

const typedProduct: XlamPanelProductInput = {
  id: "typed-panel",
  producer: "TypedProducer",
  name: "Typed panel",
  layerThicknesses: [30, 20, 30],
  metadata: { label: "XLAM 木" },
};

function typedCatalogConsumer(product: XlamPanelProductInput): {
  product: XlamPanelProduct | null;
  products: XlamPanelProduct[];
} {
  registerXlamPanelProduct(product);
  return {
    product: getXlamPanelProduct(product.id),
    products: listXlamPanelProducts(),
  };
}

const typedProductResult: XlamPanelProduct | null = getXlamPanelProduct(typedProduct.id);
const typedProductsResult: XlamPanelProduct[] = listXlamPanelProducts();

void typedProductResult;
void typedProductsResult;
void typedCatalogConsumer;

void test("the XLAM panel catalog exposes strict typed consumer contracts", () => {
  // Declaration checks above are the test; this body keeps the file in the test campaign.
});
