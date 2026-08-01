// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/reinforced-concrete-beam-column-joints/ReinforcedConcreteBeamColumnJoint3DVerification.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { VerificationResult } from "../../core/results/VerificationResult.js";
import { governingCheck } from "../../core/results/checkUtils.js";
import { RESULT_STATUS } from "../../core/results/resultStatus.js";
import { ReinforcedConcreteBeamColumnJointVerification } from "./ReinforcedConcreteBeamColumnJointVerification.js";
import { withNormativeReferences } from "../../norms/normativeReference.js";
import { NTC2018_RC_CHAPTER_7_4_REFERENCES } from "../../norms/ntc2018/normativeReferences.js";

export class ReinforcedConcreteBeamColumnJoint3DVerification {
  [key: string]: any;
  constructor({ code = "NTC2018", metadata = {} }: any = {}) {
    this.code = code;
    this.metadata = { ...metadata };
  }

  verify(model: any) {
    const directionalResults: any[] = model.directions.map((direction: any) => ({
      directionId: direction.directionId,
      result: new ReinforcedConcreteBeamColumnJointVerification({
        code: this.code,
      }).verify(direction),
    }));
    const checks: any[] = directionalResults.flatMap(({ directionId, result }: any) =>
      result.checks.map((check: any) => ({
        ...check,
        id: `${check.id}-${directionId}`,
        metadata: { ...check.metadata, directionId },
      })),
    );
    const governing: any = governingCheck(checks);
    const unsupported = directionalResults.some(
      ({ result }: any) => result.status === RESULT_STATUS.NOT_SUPPORTED,
    );
    const ok = directionalResults.every(({ result }: any) => result.status === RESULT_STATUS.OK);

    return new VerificationResult({
      applicationId: "reinforced-concrete-beam-column-joints",
      status: unsupported
        ? RESULT_STATUS.NOT_SUPPORTED
        : ok
          ? RESULT_STATUS.OK
          : RESULT_STATUS.NOT_VERIFIED,
      summary: "Concurrent multidirectional NTC 2018 beam-column joint verification.",
      utilizationRatio: governing?.utilizationRatio ?? null,
      demand: governing?.demand ?? null,
      capacity: governing?.capacity ?? null,
      checks,
      outputs: {
        jointId: model.id,
        concurrentActionState: true,
        directionCount: directionalResults.length,
        directions: Object.fromEntries(
          directionalResults.map(({ directionId, result }: any) => [directionId, result.toJSON()]),
        ),
      },
      warnings: directionalResults.flatMap(({ directionId, result }: any) =>
        result.warnings.map((warning: any) => `[${directionId}] ${warning}`),
      ),
      assumptions: [
        "NTC 2018 joint resistance is checked separately in every horizontal direction using actions from one declared concurrent design state.",
        "No undocumented scalar interaction equation is introduced between orthogonal NTC directional checks.",
        ...directionalResults.flatMap(({ directionId, result }: any) =>
          result.assumptions.map((assumption: any) => `[${directionId}] ${assumption}`),
        ),
      ],
      metadata: withNormativeReferences(
        {
          code: this.code,
          method: "ntc2018-concurrent-directional-joint-checks",
          governingCheckId: governing?.id ?? null,
          ...this.metadata,
        },
        [
          NTC2018_RC_CHAPTER_7_4_REFERENCES.beamColumnJoint,
          NTC2018_RC_CHAPTER_7_4_REFERENCES.jointGeometry,
          NTC2018_RC_CHAPTER_7_4_REFERENCES.jointDetailing,
        ],
      ),
    });
  }
}
