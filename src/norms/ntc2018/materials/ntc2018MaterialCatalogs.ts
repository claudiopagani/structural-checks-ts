export interface NTC2018ConcreteClassPreset {
  fck: number;
  rck: number;
  concreteType?: "lightweight";
}

export const NTC2018_CONCRETE_CLASSES = {
  "C12/15": { fck: 12, rck: 15 },
  "C16/20": { fck: 16, rck: 20 },
  "C20/25": { fck: 20, rck: 25 },
  "C25/30": { fck: 25, rck: 30 },
  "C28/35": { fck: 28, rck: 35 },
  "C30/37": { fck: 30, rck: 37 },
  "C32/40": { fck: 32, rck: 40 },
  "C35/45": { fck: 35, rck: 45 },
  "C40/50": { fck: 40, rck: 50 },
  "C45/55": { fck: 45, rck: 55 },
  "C50/60": { fck: 50, rck: 60 },
  "LC16/18": { fck: 16, rck: 18, concreteType: "lightweight" },
  "LC20/22": { fck: 20, rck: 22, concreteType: "lightweight" },
  "LC25/28": { fck: 25, rck: 28, concreteType: "lightweight" },
  "LC30/33": { fck: 30, rck: 33, concreteType: "lightweight" },
  "LC35/38": { fck: 35, rck: 38, concreteType: "lightweight" },
  "LC40/44": { fck: 40, rck: 44, concreteType: "lightweight" },
  "LC45/50": { fck: 45, rck: 50, concreteType: "lightweight" },
} satisfies Record<string, NTC2018ConcreteClassPreset>;

export interface NTC2018ReinforcementSteelPreset {
  fyk: number;
  ftk: number;
  ductilityClass: "A" | "C";
  elongationCharacteristic: number;
}

export const NTC2018_REINFORCEMENT_STEEL_GRADES = {
  B450A: {
    fyk: 450,
    ftk: 540,
    ductilityClass: "A",
    elongationCharacteristic: 0.025,
  },
  B450C: {
    fyk: 450,
    ftk: 540,
    ductilityClass: "C",
    elongationCharacteristic: 0.075,
  },
} satisfies Record<string, NTC2018ReinforcementSteelPreset>;

export const NTC2018_EXISTING_MATERIAL_KNOWLEDGE_LEVELS = {
  LC1: { confidenceFactor: 1.35, description: "conoscenza limitata" },
  LC2: { confidenceFactor: 1.2, description: "conoscenza adeguata" },
  LC3: { confidenceFactor: 1, description: "conoscenza accurata" },
};

export type NTC2018ConcreteStrengthClass = keyof typeof NTC2018_CONCRETE_CLASSES;
export type NTC2018ReinforcementSteelGrade = keyof typeof NTC2018_REINFORCEMENT_STEEL_GRADES;
