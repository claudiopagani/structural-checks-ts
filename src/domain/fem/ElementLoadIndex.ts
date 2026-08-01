export interface ElementLoadTarget {
  id?: string | null;
}

export interface IndexedElementLoad<TElement extends ElementLoadTarget = ElementLoadTarget> {
  element?: TElement | null;
  target?: TElement | null;
}

export interface ElementLoadIndex<
  TElement extends ElementLoadTarget,
  TLoad extends IndexedElementLoad<TElement>,
> {
  get: (element: TElement | null | undefined) => readonly TLoad[];
}

const EMPTY_ELEMENT_LOADS = Object.freeze([]) as readonly never[];

function resolveElementTarget<TElement extends ElementLoadTarget>(
  load: IndexedElementLoad<TElement> | null | undefined,
): TElement | null {
  return load?.element ?? load?.target ?? null;
}

function elementKey(element: ElementLoadTarget): string | ElementLoadTarget {
  return element.id ?? element;
}

function isRuntimeArray(value: unknown): boolean {
  return Array.isArray(value);
}

/**
 * Builds an O(loads) lookup reused by assembly and result sampling.
 * Element ids retain the matching semantics historically used by the FEM
 * pipeline, while elements without ids are matched by object identity.
 */
export function createElementLoadIndex<
  TElement extends ElementLoadTarget,
  TLoad extends IndexedElementLoad<TElement>,
>(loads: readonly TLoad[] = []): ElementLoadIndex<TElement, TLoad> {
  if (!isRuntimeArray(loads)) {
    throw new Error("Element load indexing requires a loads array.");
  }

  const loadsByElement = new Map<string | ElementLoadTarget, TLoad[]>();

  for (const load of loads) {
    const target = resolveElementTarget(load);

    if (!target) {
      continue;
    }

    const key = elementKey(target);
    const indexedLoads = loadsByElement.get(key);

    if (indexedLoads) {
      indexedLoads.push(load);
    } else {
      loadsByElement.set(key, [load]);
    }
  }

  return {
    get(element): readonly TLoad[] {
      if (!element) {
        return EMPTY_ELEMENT_LOADS;
      }

      return loadsByElement.get(elementKey(element)) ?? EMPTY_ELEMENT_LOADS;
    },
  };
}
