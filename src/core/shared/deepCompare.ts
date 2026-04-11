const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export function deepCompare(left: unknown, right: unknown): boolean {
  if (typeof left !== typeof right) {
    return false;
  }

  if (!isObject(left) || !isObject(right)) {
    return left === right;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!deepCompare(left[index], right[index])) {
        return false;
      }
    }

    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!rightKeys.includes(key) || !deepCompare(left[key], right[key])) {
      return false;
    }
  }

  return true;
}
