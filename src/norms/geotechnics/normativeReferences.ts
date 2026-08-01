import {
  createNormativeReference,
  NORMATIVE_REFERENCE_RELATIONS,
  NORMATIVE_REFERENCE_RESOLUTION_STATUS,
} from "../normativeReference.js";

export const GEOTECHNICAL_EXTERNAL_REFERENCES = Object.freeze({
  axialPileCapacityUsace: createNormativeReference({
    corpusId: "structural-codes",
    corpusRevision: null,
    corpusStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
    documentId: "usace-em-1110-2-2906-1991",
    relation: NORMATIVE_REFERENCE_RELATIONS.IMPLEMENTS,
    citation:
      "USACE EM 1110-2-2906 (1991), paragraphs 4-3a(1)-(4), equations for axial pile capacity",
    href: "https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-2906.pdf",
    resolutionStatus: NORMATIVE_REFERENCE_RESOLUTION_STATUS.OUTSIDE_CORPUS,
  }),
});
