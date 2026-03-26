import { Draft, produce } from 'immer';

// 객체만 처리할 수 있도록 제약 추가
export function adaptor<T extends object>(fn: (draft: Draft<T>) => void) {
  return produce<T>(fn);
}
