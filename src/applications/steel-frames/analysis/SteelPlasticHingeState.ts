// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/steel-frames/analysis/SteelPlasticHingeState.js.

export type SteelPlasticHingeSign = "positive" | "negative" | null;

export interface SteelPlasticHingeStateOptions {
  start?: unknown;
  end?: unknown;
  history?: readonly unknown[];
}

export interface SteelPlasticHingeStateJson {
  start: SteelPlasticHingeSign;
  end: SteelPlasticHingeSign;
  history: unknown[];
}

export interface SteelPlasticHingeActivationEvent {
  position: "start" | "end";
  sign: unknown;
}

export interface SteelPlasticHingeStateLike {
  start?: unknown;
  end?: unknown;
}

function stringifyUnsupportedValue(value: unknown): string {
  if (typeof value === "symbol") {
    throw new TypeError("Cannot convert a Symbol value to a string");
  }

  if (typeof value === "object" && value !== null) {
    return value.toString.bind(value)();
  }

  return String(value);
}

function normalizeSign(value: unknown): SteelPlasticHingeSign {
  if (value == null) {
    return null;
  }

  if (value === "positive" || value === 1 || value === "+") {
    return "positive";
  }

  if (value === "negative" || value === -1 || value === "-") {
    return "negative";
  }

  throw new Error(`Unsupported plastic hinge sign: ${stringifyUnsupportedValue(value)}.`);
}

export class SteelPlasticHingeState {
  start: SteelPlasticHingeSign;
  end: SteelPlasticHingeSign;
  history: unknown[];

  constructor({ start = null, end = null, history = [] }: SteelPlasticHingeStateOptions = {}) {
    this.start = normalizeSign(start);
    this.end = normalizeSign(end);
    this.history = [...history];
  }

  clone(): SteelPlasticHingeState {
    return new SteelPlasticHingeState(this.toJSON());
  }

  isActiveAt(position: string): boolean {
    return this.signAt(position) != null;
  }

  signAt(position: string): SteelPlasticHingeSign {
    return position === "start" ? this.start : this.end;
  }

  activeCount(): number {
    return Number(this.start != null) + Number(this.end != null);
  }

  withActivation(
    position: string,
    sign: unknown,
    metadata: Record<string, unknown> = {},
  ): SteelPlasticHingeState {
    const normalizedPosition = position === "start" ? "start" : "end";
    const normalizedSign = normalizeSign(sign);

    if (this[normalizedPosition] != null) {
      return this.clone();
    }

    return new SteelPlasticHingeState({
      start: normalizedPosition === "start" ? normalizedSign : this.start,
      end: normalizedPosition === "end" ? normalizedSign : this.end,
      history: [
        ...this.history,
        {
          type: "plastic-hinge-activation",
          position: normalizedPosition,
          sign: normalizedSign,
          ...metadata,
        },
      ],
    });
  }

  activationDelta(
    nextState?: SteelPlasticHingeStateLike | null,
  ): SteelPlasticHingeActivationEvent[] {
    const events: SteelPlasticHingeActivationEvent[] = [];

    if (this.start == null && nextState?.start != null) {
      events.push({ position: "start", sign: nextState.start });
    }

    if (this.end == null && nextState?.end != null) {
      events.push({ position: "end", sign: nextState.end });
    }

    return events;
  }

  toJSON(): SteelPlasticHingeStateJson {
    return {
      start: this.start,
      end: this.end,
      history: [...this.history],
    };
  }
}
