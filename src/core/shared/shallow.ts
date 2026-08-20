const isIterable = (obj: object): obj is Iterable<unknown> =>
  Symbol.iterator in obj;

const hasIterableEntries = (
  value: Iterable<unknown>,
): value is Iterable<unknown> & {
  entries(): Iterable<[unknown, unknown]>;
} => 'entries' in value;

const compareEntries = (
  valueA: { entries(): Iterable<[unknown, unknown]> },
  valueB: { entries(): Iterable<[unknown, unknown]> },
): boolean => {
  const mapA = valueA instanceof Map ? valueA : new Map(valueA.entries() as Iterable<[unknown, unknown]>);
  const mapB = valueB instanceof Map ? valueB : new Map(valueB.entries() as Iterable<[unknown, unknown]>);

  if (mapA.size !== mapB.size) {
    return false;
  }

  for (const [key, value] of mapA) {
    if (!mapB.has(key) || !Object.is(value, mapB.get(key))) {
      return false;
    }
  }

  return true;
};

const compareIterables = (
  valueA: Iterable<unknown>,
  valueB: Iterable<unknown>,
): boolean => {
  const iteratorA = valueA[Symbol.iterator]();
  const iteratorB = valueB[Symbol.iterator]();
  let nextA = iteratorA.next();
  let nextB = iteratorB.next();

  while (!nextA.done && !nextB.done) {
    if (!Object.is(nextA.value, nextB.value)) {
      return false;
    }
    nextA = iteratorA.next();
    nextB = iteratorB.next();
  }

  return !!nextA.done && !!nextB.done;
};

export function shallow<T>(valueA: T, valueB: T): boolean {
  if (Object.is(valueA, valueB)) {
    return true;
  }

  if (
    typeof valueA !== 'object' ||
    valueA === null ||
    typeof valueB !== 'object' ||
    valueB === null
  ) {
    return false;
  }

  if (Object.getPrototypeOf(valueA) !== Object.getPrototypeOf(valueB)) {
    return false;
  }

  if (valueA instanceof Date && valueB instanceof Date) {
    return valueA.getTime() === valueB.getTime();
  }

  if (valueA instanceof RegExp && valueB instanceof RegExp) {
    return valueA.source === valueB.source && valueA.flags === valueB.flags;
  }

  if (isIterable(valueA) && isIterable(valueB)) {
    if (hasIterableEntries(valueA) && hasIterableEntries(valueB)) {
      return compareEntries(valueA, valueB);
    }
    return compareIterables(valueA, valueB);
  }

  const entriesA = Object.entries(valueA);
  const entriesB = Object.entries(valueB);

  if (entriesA.length === 0 && entriesB.length === 0) {
    // Two empty plain objects are shallow-equal, but non-plain objects
    // (RegExp, Error, Promise, class instances without data properties)
    // have already failed the Object.is check above and have no
    // enumerable own properties to compare, so they are not shallow-equal.
    const proto = Object.getPrototypeOf(valueA);
    return proto === Object.prototype || proto === null;
  }

  return compareEntries(
    { entries: () => entriesA },
    { entries: () => entriesB },
  );
}
