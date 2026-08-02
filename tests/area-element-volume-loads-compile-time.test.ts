import test from "node:test";

import {
  AreaLoad,
  ElementPointLoad,
  VolumeLoad,
  type AreaLoadJson,
  type ElementPointLoadJson,
  type VolumeLoadJson,
} from "../dist/index.js";

const units = { force: "kN" as const, length: "m" as const };
const target = {
  id: "surface-1",
  area: () => 12,
  volume: () => 0.8,
};
const areaLoad = new AreaLoad({ intensity: 3.5, target, units });
const elementLoad = new ElementPointLoad({
  element: { id: "beam-1" },
  position: 2.5,
  units,
});
const volumeLoad = new VolumeLoad({ intensity: 24, target, units });
const areaJson: AreaLoadJson = areaLoad.toJSON();
const elementJson: ElementPointLoadJson = elementLoad.toJSON();
const volumeJson: VolumeLoadJson = volumeLoad.toJSON();
const areaResultant: number | null = areaLoad.resultant();
const volumeResultant: number | null = volumeLoad.resultant();

void test("area, element-point and volume loads expose strict typed contracts", () => {
  void areaJson;
  void elementJson;
  void volumeJson;
  void areaResultant;
  void volumeResultant;
});
