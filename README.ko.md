# @ilokesto/state

[English](./README.md) | **한국어**

`@ilokesto/store`를 기반으로 만든 가벼운 멀티 프레임워크 상태 관리 헬퍼입니다.

이 패키지는 스토어 핵심 로직을 프레임워크와 무관하게 유지하면서, React, Vue, Angular, Svelte, Solid를 위한 얇은 어댑터를 제공합니다.

## 주요 기능

- 일반 상태나 Reducer로부터 프레임워크 친화적인 상태 어댑터 생성
- 프레임워크가 자연스럽게 지원하는 방식의 Selector 기반 상태 구독
- `readOnly()`를 사용해 프레임워크 생명주기 밖에서 상태 조회
- `writeOnly()`를 사용해 프레임워크 생명주기 밖에서 상태 업데이트
- `logger`, `debounce`, `persist`, `devtools` 등의 미들웨어로 스토어 구성
- `adaptor()`를 사용한 immer 기반 객체 업데이트

## 설치

```bash
pnpm add @ilokesto/state
```

`immer`는 선택적 피어 의존성(peer dependency)이며, `adaptor()`를 사용할 때만 필요합니다.

## React

```ts
import { create } from '@ilokesto/state/react';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

function Counter() {
  const [count, setCounter] = useCounter((state) => state.count);

  return (
    <button onClick={() => setCounter((prev) => ({ ...prev, count: prev.count + 1 }))}>
      {count}
    </button>
  );
}
```

## Vue

```ts
import { create } from '@ilokesto/state/vue';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

export function useCounterState() {
  const { state, setState } = useCounter((current) => current.count);

  return {
    count: state,
    increment: () => setState((prev) => ({ ...prev, count: prev.count + 1 })),
  };
}
```

반환된 composable은 `setup()` 내부 또는 활성화된 `effectScope()` 안에서 실행되어야 합니다.

## Angular

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { create } from '@ilokesto/state/angular';

type CounterState = {
  count: number;
};

const counter = create<CounterState>({ count: 0 });

@Component({
  selector: 'app-counter',
  standalone: true,
  template: '<button (click)="increment()">{{ count() }}</button>',
})
export class CounterComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly count = counter((state) => state.count, { destroyRef }).state;

  increment() {
    counter.writeOnly()((prev) => ({ ...prev, count: prev.count + 1 }));
  }
}
```

활성화된 injection context 밖에서 이 어댑터로 Angular signal을 생성하는 경우, `{ destroyRef }`를 명시적으로 전달하세요.

## Svelte

```ts
import { create } from '@ilokesto/state/svelte';

type CounterState = {
  count: number;
};

export const counter = create<CounterState>({ count: 0 });
export const count = counter.select((state) => state.count);
```

```svelte
<script lang="ts">
  import { counter, count } from './counter';

  const increment = () => {
    counter.update((state) => ({ ...state, count: state.count + 1 }));
  };
</script>

<button on:click={increment}>{$count}</button>
```

## Solid

```tsx
import { create } from '@ilokesto/state/solid';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

function Counter() {
  const { state, setState } = useCounter((current) => current.count);

  return (
    <button onClick={() => setState((prev) => ({ ...prev, count: prev.count + 1 }))}>
      {state()}
    </button>
  );
}
```

`create()`가 반환한 함수를 컴포넌트나 `createRoot()` 같은 reactive owner 내부에서 호출해야 합니다. Solid 범위 밖에서 동기적으로 상태를 읽으려면 `readOnly()`를 사용하세요.

## Reducer 사용법

모든 프레임워크 어댑터는 Reducer 형태를 지원합니다.

```ts
type CounterState = {
  count: number;
};

type CounterAction = { type: 'increment' } | { type: 'decrement' };

const counter = create<CounterState, CounterAction>(
  (state, action) => {
    switch (action.type) {
      case 'increment':
        return { count: state.count + 1 };
      case 'decrement':
        return { count: state.count - 1 };
      default:
        return state;
    }
  },
  { count: 0 },
);
```

React는 튜플을 반환하고, Vue는 `{ state, dispatch }`, Angular는 `{ state, dispatch }`, Svelte는 `dispatch`가 포함된 readable store를 반환하며, Solid는 `{ state, dispatch }`를 반환합니다.

## 프레임워크 생명주기 밖에서 읽기 및 쓰기

```ts
const writeCounter = counter.writeOnly();
const currentCount = counter.readOnly((state) => state.count);

writeCounter((prev) => ({ ...prev, count: prev.count + 1 }));

console.log(currentCount);
```

## 미들웨어 및 유틸리티

### `@ilokesto/state/middleware`

- `debounce()`
- `devtools()`
- `logger()`
- `persist()`
- `validate()`

### `@ilokesto/state/utils`

- `pipe()`: 일반 상태와 미들웨어를 조합하여 스토어 생성
- `adaptor()`: immer를 사용한 불변 객체 업데이트 헬퍼 생성

```ts
import { create } from '@ilokesto/state/react';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe({ count: 0 }, logger({ timestamp: true }), persist({ local: 'counter' }));

export const useCounter = create(counterStore);
```

## 내보내기

- `@ilokesto/state/react` → React 어댑터
- `@ilokesto/state/vue` → Vue 어댑터
- `@ilokesto/state/angular` → Angular 어댑터
- `@ilokesto/state/svelte` → Svelte 어댑터
- `@ilokesto/state/solid` → Solid 어댑터
- `@ilokesto/state/middleware` → 미들웨어 헬퍼
- `@ilokesto/state/utils` → `adaptor`, `pipe`

## 개발

```bash
pnpm install
pnpm build
```

빌드 결과물은 `dist` 디렉터리에 생성됩니다.

## 라이선스

MIT
