import test from "node:test";

import {
  StructuralModel,
  type StructuralModelOptions,
  type StructuralModelSummary,
} from "../dist/index.js";

const options: StructuralModelOptions = {
  id: "modello-Δ",
  name: "Modello Δ",
  materials: [{ id: "materiale-α" }],
  nodes: [{ id: "nodo-β" }],
  elements: [{ id: "elemento-γ" }],
  supports: [{ id: "vincolo-δ" }],
  loadCases: [{ id: "caso-ε" }],
  loadCombinations: [{ id: "combinazione-ζ" }],
  metadata: { source: "consumer-contract" },
};

void test("StructuralModel exposes a strict typed consumer contract", () => {
  const model = new StructuralModel(options);
  const summary: StructuralModelSummary = model.summary();
  const chained = model
    .addMaterial({ id: "materiale-η" })
    .addNode({ id: "nodo-θ" })
    .addElement({ id: "elemento-ι" })
    .addSupport({ id: "vincolo-κ" })
    .addLoadCase({ id: "caso-λ" })
    .addLoadCombination({ id: "combinazione-μ" });
  void summary;
  void chained;
});
