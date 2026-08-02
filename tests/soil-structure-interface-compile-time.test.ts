import test from "node:test";

import {
  SOIL_STRUCTURE_INTERFACE_MODELS,
  SoilStructureInterface,
  type SoilStructureInterfaceJson,
  type SoilStructureInterfaceOptions,
  type SoilStructureInterfaceResolution,
} from "../dist/index.js";

const options: SoilStructureInterfaceOptions = {
  id: "interface-\u03B1",
  name: "Interfaccia \u03B2",
  wallSurface: {
    typeId: "formed-concrete",
    materialType: "concrete",
    finish: "smooth",
    metadata: { label: "calcestruzzo \u03B3" },
  },
  parameterSets: [
    {
      id: "assigned",
      basis: "characteristic",
      model: "assigned-angle",
      frictionAngle: 24,
      angleUnits: "deg",
      soilInterfaceClassId: "medium-sand",
      provenance: { source: "catalogue \u03B4" },
      metadata: { label: "assegnato \u03B5" },
    },
  ],
  metadata: { label: "parete \u03B6" },
};

const interfaceModel = new SoilStructureInterface(options);
const resolution: SoilStructureInterfaceResolution = interfaceModel.resolveFrictionAngle({
  soilFrictionAngles: [0.3, 0.4],
});
const serialized: SoilStructureInterfaceJson = interfaceModel.toJSON();
const models: readonly string[] = SOIL_STRUCTURE_INTERFACE_MODELS;

void test("SoilStructureInterface exposes a strict typed consumer contract", () => {
  void resolution;
  void serialized;
  void models;
});
