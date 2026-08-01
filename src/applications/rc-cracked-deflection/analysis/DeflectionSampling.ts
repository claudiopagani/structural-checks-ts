// Mechanical TypeScript migration from strutture-js 6f33baead8b88166c4b2cf94af41763412e3c751; source path: src/applications/rc-cracked-deflection/analysis/DeflectionSampling.js.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { round } from "../../reinforced-concrete-sections/shared/rcCommon.js";

export function deduplicateSamples(samples: any[], resolver: any): any[] {
  const byStation = new Map<number, { x: number; sample: any }>();

  for (const sample of samples ?? []) {
    const x = resolver.length(sample.station ?? 0);
    const current = byStation.get(round(x, 6));

    if (!current || Math.abs(sample.m ?? 0) > Math.abs(current.sample.m ?? 0)) {
      byStation.set(round(x, 6), { x, sample });
    }
  }

  return [...byStation.values()].sort((first, second) => first.x - second.x);
}

export function convertSupportStations(supports: any[], resolver: any): any[] {
  return (supports ?? []).map((support: any) => ({
    ...support,
    station: Number.isFinite(support.station) ? resolver.length(support.station) : support.station,
  }));
}

export function convertCompatibleDisplacements(samples: any[], resolver: any): any[] {
  return (samples ?? []).map((sample: any) => ({
    ...sample,
    x: Number.isFinite(sample.x) ? resolver.length(sample.x) : sample.x,
    station: Number.isFinite(sample.station) ? resolver.length(sample.station) : sample.station,
    deflection: Number.isFinite(sample.deflection)
      ? resolver.length(sample.deflection)
      : sample.deflection,
  }));
}

export function maxAbsSampleAction(samples: any[], key: string, resolver: any): number {
  return (samples ?? []).reduce((maximum, sample: any) => {
    const rawValue = sample?.[key] ?? 0;
    const value =
      key === "m"
        ? resolver.moment(rawValue)
        : key === "n" || key === "v"
          ? resolver.force(rawValue)
          : rawValue;

    return Math.max(maximum, Math.abs(value));
  }, 0);
}

function addSampleIndex(indices: Set<number>, index: number, length: number): void {
  indices.add(Math.max(0, Math.min(length - 1, index)));
}

export function selectAnalysisSamples(
  samples: any[],
  { maxStationsPerCombination = null }: { maxStationsPerCombination?: number | null } = {},
): any[] {
  if (
    !Number.isInteger(maxStationsPerCombination) ||
    (maxStationsPerCombination ?? 0) <= 0 ||
    samples.length <= (maxStationsPerCombination ?? 0)
  ) {
    return samples;
  }

  const stationLimit = maxStationsPerCombination as number;
  const target = Math.max(3, stationLimit);
  const indices = new Set<number>();
  const lastIndex = samples.length - 1;

  addSampleIndex(indices, 0, samples.length);
  addSampleIndex(indices, lastIndex, samples.length);

  const maxMomentIndex = samples.reduce((selected, item, index) => {
    const selectedMoment = Math.abs(samples[selected]?.sample?.m ?? 0);
    const currentMoment = Math.abs(item.sample?.m ?? 0);
    return currentMoment > selectedMoment ? index : selected;
  }, 0);
  const maxAxialIndex = samples.reduce((selected, item, index) => {
    const selectedAxial = Math.abs(samples[selected]?.sample?.n ?? 0);
    const currentAxial = Math.abs(item.sample?.n ?? 0);
    return currentAxial > selectedAxial ? index : selected;
  }, 0);

  addSampleIndex(indices, maxMomentIndex, samples.length);
  addSampleIndex(indices, maxAxialIndex, samples.length);

  for (let index = 0; indices.size < target && index < target; index += 1) {
    addSampleIndex(
      indices,
      Math.round((index * lastIndex) / Math.max(1, target - 1)),
      samples.length,
    );
  }

  if (indices.size < target) {
    for (let index = 1; indices.size < target && index < lastIndex; index += 1) {
      addSampleIndex(indices, index, samples.length);
    }
  }

  return [...indices].sort((first, second) => first - second).map((index) => samples[index]);
}

export function selectOutputPoints(
  points: any[],
  { maxPointsPerCombination = null }: { maxPointsPerCombination?: number | null } = {},
): any[] {
  if (
    !Number.isInteger(maxPointsPerCombination) ||
    (maxPointsPerCombination ?? 0) <= 0 ||
    points.length <= (maxPointsPerCombination ?? 0)
  ) {
    return points;
  }

  const pointLimit = maxPointsPerCombination as number;
  const target = Math.max(3, pointLimit);
  const indices = new Set<number>();
  const lastIndex = points.length - 1;

  addSampleIndex(indices, 0, points.length);
  addSampleIndex(indices, lastIndex, points.length);

  const governingIndex = points.reduce((selected, point, index) => {
    const selectedDeflection = Math.abs(points[selected]?.deflection ?? 0);
    const currentDeflection = Math.abs(point.deflection ?? 0);
    return currentDeflection > selectedDeflection ? index : selected;
  }, 0);

  addSampleIndex(indices, governingIndex, points.length);

  for (let index = 0; indices.size < target && index < target; index += 1) {
    addSampleIndex(
      indices,
      Math.round((index * lastIndex) / Math.max(1, target - 1)),
      points.length,
    );
  }

  return [...indices].sort((first, second) => first - second).map((index) => points[index]);
}
