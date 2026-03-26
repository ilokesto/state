export function deepCompare(obj1: any, obj2: any): boolean {
  // 타입이 다르면 다른 객체
  if (typeof obj1 !== typeof obj2) {
    return false;
  }

  // 원시 타입이거나 함수면 직접 비교
  if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) {
    return obj1 === obj2;
  }

  // 배열 비교
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }
    for (let i = 0; i < obj1.length; i++) {
      if (!deepCompare(obj1[i], obj2[i])) {
        return false;
      }
    }
    return true;
  }
  
  // 배열과 객체 비교는 false
  if (Array.isArray(obj1) || Array.isArray(obj2)) {
      return false;
  }

  // 객체 키 비교
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  // 각 키의 값을 재귀적으로 비교
  for (let key of keys1) {
    if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key])) {
      return false;
    }
  }

  return true;
}