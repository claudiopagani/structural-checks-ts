import test from "node:test";

import {
  APPLICATION_CATALOG,
  ApplicationRegistry,
  DesignCodeContext,
  StructuralApplication,
} from "../dist/index.js";
import type {
  ApplicationCatalogEntry,
  CalculationResult,
  DesignCodeContextJson,
  DesignCodeContextOptions,
  StructuralApplicationManifest,
} from "../dist/index.js";

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type PublicDeclarationsAreUseful = [
  AssertFalse<IsAny<typeof ApplicationRegistry>>,
  AssertFalse<IsAny<typeof DesignCodeContext>>,
  AssertFalse<IsAny<typeof APPLICATION_CATALOG>>,
];

const application = new StructuralApplication({
  id: "compile-time-demo",
  name: "Compile-time demo",
});
const registry = new ApplicationRegistry<
  StructuralApplicationManifest,
  CalculationResult,
  StructuralApplication
>([application]);
const manifests: StructuralApplicationManifest[] = registry.listManifests();
const result: CalculationResult = registry.run("compile-time-demo");
const catalog: ApplicationCatalogEntry[] = APPLICATION_CATALOG;
const codeOptions: DesignCodeContextOptions = {
  id: "ntc2018",
  name: "NTC 2018",
  jurisdiction: "IT",
  version: "2018",
};
const codeJson: DesignCodeContextJson = new DesignCodeContext(codeOptions).toJSON();

void manifests;
void result;
void catalog;
void codeJson;
void (null as unknown as PublicDeclarationsAreUseful);

void test("application registry and code metadata declarations support typed consumers", () => {
  // Compile-time assertions above are the test.
});
