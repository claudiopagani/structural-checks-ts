// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: ../strutture-js/src/domain/strut-and-tie/AxialMember2D.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
function positive(value: any, label: string): any {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive.`);
  }

  return value;
}

export class AxialMember2D {
  [key: string]: any;

  constructor({ id, startNode, endNode, axialRigidity, metadata = {} }: any = {}) {
    if (!id || !startNode?.id || !endNode?.id) {
      throw new Error("AxialMember2D requires an id and two nodes.");
    }

    const dx = endNode.x - startNode.x;
    const dy = endNode.y - startNode.y;
    const length = Math.hypot(dx, dy);

    positive(length, `AxialMember2D ${id} length`);

    this.id = id;
    this.startNode = startNode;
    this.endNode = endNode;
    this.nodes = [startNode, endNode];
    this.axialRigidity = positive(axialRigidity, `AxialMember2D ${id} axialRigidity`);
    this.length = length;
    this.cosine = dx / length;
    this.sine = dy / length;
    this.metadata = { ...metadata };
  }

  getDofIds(dofRegistry: any): any {
    return [
      dofRegistry.getDofId(this.startNode, "ux"),
      dofRegistry.getDofId(this.startNode, "uy"),
      dofRegistry.getDofId(this.endNode, "ux"),
      dofRegistry.getDofId(this.endNode, "uy"),
    ];
  }

  globalStiffness() {
    const c = this.cosine;
    const s = this.sine;
    const scale = this.axialRigidity / this.length;

    return [
      [c * c, c * s, -c * c, -c * s],
      [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s],
      [-c * s, -s * s, c * s, s * s],
    ].map((row) => row.map((value) => value * scale));
  }

  axialResponse(displacementByNode: any = {}): any {
    const start = displacementByNode[this.startNode.id] ?? {};
    const end = displacementByNode[this.endNode.id] ?? {};
    const extension =
      this.cosine * ((end.ux ?? 0) - (start.ux ?? 0)) +
      this.sine * ((end.uy ?? 0) - (start.uy ?? 0));
    const strain = extension / this.length;
    const force = this.axialRigidity * strain;

    return {
      force,
      extension,
      strain,
      signConvention: "tension-positive",
    };
  }
}
