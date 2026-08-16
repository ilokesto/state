# @ilokesto/state

[English](./README.md) | **한국어**

`@ilokesto/store`를 기반으로 만든 가벼운 멀티 프레임워크 상태 관리 헬퍼입니다.

이 패키지는 스토어 핵심 로직을 프레임워크와 무관하게 유지하면서, React, Vue, Angular, Svelte, Solid를 위한 얇은 어댑터를 제공합니다.

## 주요 기능

- 일반 상태나 Reducer로부터 프레임워크 친화적인 상태 어댑터 생성
- 모든 프레임워크에서 하나의 공통 shallow 동등성 계약으로 Selector 기반 상태 구독
- `readOnly()`를 사용해 프레임워크 생명주기 밖에서 상태 조회
- `writeOnly()`를 사용해 프레임워크 생명주기 밖에서 상태 업데이트
- `logger`, `debounce`, `persist`, `devtools` 등의 미들웨어로 스토어 구성
- `adaptor()`를 사용한 immer 기반 객체 업데이트

## 설치

```bash
pnpm add @ilokesto/state
```

`immer`는 선택적 피어 의존성(peer dependency)이며, `adaptor()`를 사용할 때만 필요합니다.

## Selector 구독 계약

React, Vue, Angular, Svelte, Solid는 일반 상태와 Reducer 상태 모두에서 동일한 Selector 구독 동작을 사용합니다.

- 원시값 선택은 `Object.is` 의미론을 사용합니다.
- 객체, 배열, `Map`, `Set`, `Date` 선택은 패키지의 1단계 `shallow` 비교를 사용합니다.
- Store가 변경되어도 선택 결과가 shallow 비교에서 같으면 프레임워크 consumer에 알리지 않습니다.
- 선택 결과와 관련된 업데이트는 consumer에 정확히 한 번 알립니다.
- React unmount, Vue scope dispose, Angular `DestroyRef`, Solid owner cleanup, Svelte unsubscribe 시 구독을 해제합니다.
- React server snapshot은 Store의 초기 상태에서 값을 선택하므로 현재 상태가 이미 변경되었어도 hydration 의미론을 유지합니다.

이 계약은 `Store.subscribeSelector`를 기반으로 하며, 어댑터는 프레임워크별 동등성 옵션을 노출하지 않습니다. `create(initialState)`와 `create(reducer, initialState)`에 동일하게 적용됩니다.

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

### 기존 Store 재사용

두 번째 인자로 기존 `Store`를 전달하면 프레임워크 어댑터와 직접 Store 쓰기가 하나의 상태 스냅샷을 공유합니다. 같은 Store를 정확히 동일한 reducer 함수 참조와 함께 다시 사용해도 안전합니다. `@ilokesto/state`는 reducer middleware를 한 번만 설치하며, dispatch마다 reducer를 한 번 호출한 결과를 모든 어댑터가 관찰합니다.

하나의 Store에는 하나의 reducer 식별자만 등록할 수 있습니다. 같은 Store에 다른 reducer 함수를 등록하면 middleware나 상태를 변경하기 전에 `TypeError: Cannot register a different reducer for the same Store.`를 동기적으로 throw합니다. 직접 호출한 `store.setState(...)`는 기존과 동일하게 일반 Store 업데이트로 동작하며 reducer를 호출하지 않습니다.

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
- `history()`
- `logger()`
- `persist()`
- `throttle()`
- `validate()`

### `@ilokesto/state/utils`

- `pipe`: 일반 상태와 등록된 미들웨어로 스토어 조합
- `definePipeableMiddleware()`: 사용자 미들웨어 메타데이터 등록
- `adaptor()`: immer를 사용한 불변 객체 업데이트 헬퍼 생성

`pipe`는 빌더 전용 API입니다. `pipe.use(...)`로 시작해 바깥쪽에서 안쪽 순서로 미들웨어를 추가한 다음, `.create(initialState)`를 호출하세요. 첫 번째 `.use()`가 업데이트 시 가장 바깥을 감싸며, `.create()`가 Store를 만들 때 미들웨어 설정은 왼쪽에서 오른쪽 순서로 실행됩니다.

<!-- pipe-example:builder-basics -->
```ts
import { create } from '@ilokesto/state/react';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const decodeCounter = (value: unknown): { readonly count: number } | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;
  return { count: value.count };
};

const counterStore = pipe
  .use(logger({ timestamp: true }))
  .use(persist({ local: 'counter', decode: decodeCounter }))
  .create({ count: 0 });

export const useCounter = create(counterStore);
```

`.create()`는 일반 상태만 받습니다. 기존 `Store`는 받을 수 없습니다.

### 히스토리, 시간 제어, 정리

`history()`는 성공한 동기 상태 변경을 기록합니다. 반환된 스토어에는 `undo()`, `redo()`,
`canUndo()`, `canRedo()`, `clearHistory()`가 추가됩니다. `undo()`와 `redo()`는 기록한 상태를
스토어에 적용하므로, 호환되는 미들웨어는 이 변경을 관찰할 수 있습니다.

<!-- pipe-example:history-pipe -->
```ts
import { history, logger } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(history({ limit: 20 }))
  .create({ count: 0 });

counterStore.undo();
```

`history()`는 선언 순서와 관계없이 하나의 pipe 체인에서 `debounce()` 또는 `throttle()`과 함께
사용할 수 없습니다. 지연된 업데이트에는 히스토리에 필요한 동기 커밋 경계가 없습니다. Pipe는
이 충돌을 거부하며, 유효한 체인으로 만들기 위해 미들웨어 순서를 자동으로 바꾸지 않습니다.

`throttle()`은 선행 통과 후 드롭 방식으로 동작합니다. 첫 번째 업데이트는 즉시 통과하고, 대기
시간이 끝날 때까지 이후 업데이트는 드롭됩니다.

<!-- pipe-example:throttle-pipe -->
```ts
import { logger, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(throttle(250))
  .create({ count: 0 });
```

타이머 기반 미들웨어는 스토어에 정리 작업을 등록합니다. 스토어가 더 이상 필요 없으면
`dispose(store)`를 호출해 대기 중인 작업을 취소하고 미들웨어가 소유한 리소스를 해제하세요.
정리는 해당 스토어에만 적용되며, 여러 번 안전하게 호출할 수 있습니다.

<!-- pipe-example:dispose-store -->
```ts
import { dispose, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe.use(throttle(250)).create({ count: 0 });

dispose(counterStore);
```

### 안전한 영속성

신뢰 경계를 넘는 영속 데이터에는 `decode`를 전달하세요. 안전한 영속성은 parse, migrate,
decode 순서로 동작합니다. 저장된 payload를 파싱하고, 이전 버전 payload를 현재 버전으로
migrate한 뒤, 그 결과에 `decode`를 호출합니다. 잘못된 payload, 실패한 migration, 실패한 decode,
그리고 미래 버전은 초기 상태로 돌아갑니다. 성공한 migration은 현재 버전으로 다시 저장됩니다.
현재 버전 payload는 다시 쓰지 않고 decode합니다.

<!-- pipe-example:safe-persist-pipe -->
```ts
import { persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

type CounterState = { readonly count: number };

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;

  return { count: value.count };
};

const counterStore = pipe
  .use(persist({ local: 'counter', decode: decodeCounter }))
  .create<CounterState>({ count: 0 });
```

`decode`는 필수입니다. 저장된 값을 검증 없이 신뢰하지 않습니다.

`.use()`에 전달하는 모든 미들웨어는 사용자 미들웨어를 포함해 `definePipeableMiddleware`로 등록되어야 합니다. 메타데이터에는 `id`가 필요하며, 같은 ID는 기본적으로 거부됩니다. 반복이 의도된 경우에만 모든 항목에 `duplicate: 'allow'`를 설정하세요.

`before: ['id']`는 이 미들웨어가 더 앞에 선언되어 바깥쪽이 되어야 함을 뜻합니다. `after: ['id']`는 더 뒤에 선언되어 안쪽이 되어야 함을 뜻합니다. 대상 미들웨어가 없으면 관계는 무시됩니다. 파이프는 존재하는 관계의 오류와 순환을 거부하며, 미들웨어 순서를 자동으로 바꾸지 않습니다.

기능(capability)은 미들웨어가 Store에 추가한 API를 이후 미들웨어와 최종 Store에서 보이게 합니다. `requires`는 `.use()`를 호출할 때 이미 사용할 수 있어야 하므로, 앞선 바깥 미들웨어가 나중의 안쪽 미들웨어가 제공하는 기능을 요구할 수 없습니다. `adds`는 즉시 바깥에서 안쪽으로 향하는 방향으로 기능을 제공합니다.

<!-- pipe-example:custom-capability -->
```ts
import { definePipeableMiddleware, pipe } from '@ilokesto/state/utils';
import type { PipeAnyMiddleware, PipeCapability } from '@ilokesto/state/utils';

type IncrementCapability = PipeCapability<
  '@example/increment',
  { readonly increment: () => void }
>;

const incrementCapability = {
  id: '@example/increment',
  shape: { increment: (): void => undefined },
} as const satisfies IncrementCapability;

const addIncrement: PipeAnyMiddleware<readonly [], readonly [IncrementCapability]> = (store) => {
  return Object.assign(store, incrementCapability.shape);
};

const incrementMiddleware = definePipeableMiddleware(addIncrement, {
  adds: [incrementCapability],
  id: '@example/increment-middleware',
} as const);

const counterStore = pipe.use(incrementMiddleware).create({ count: 0 });

counterStore.increment();
counterStore.getState().count;
```

이 변경은 호환성을 깨는 변경입니다. 호출형과 가변 인자 `pipe` 문법은 제거되었습니다. 기존 호출은 `pipe.use(...).create(initialState)`로 바꾸세요.

## 내보내기

- `@ilokesto/state/react` → React 어댑터
- `@ilokesto/state/vue` → Vue 어댑터
- `@ilokesto/state/angular` → Angular 어댑터
- `@ilokesto/state/svelte` → Svelte 어댑터
- `@ilokesto/state/solid` → Solid 어댑터
- `@ilokesto/state/middleware` → 미들웨어 헬퍼
- `@ilokesto/state/utils` → `adaptor`, `pipe`, `definePipeableMiddleware`, pipe 타입

## 마이그레이션: 통합 shallow Selector 구독

### 변경 사항

React 어댑터는 이전에 **깊은 비교** (`deepCompare`)를 사용하여 selector 결과가 리렌더를 트리거해야 하는지 판단했습니다. 이후 zustand가 사용하는 패턴과 같은 **shallow 비교**로 전환했습니다. 이제 React, Vue, Angular, Svelte, Solid의 일반 상태와 Reducer 상태가 모두 같은 shallow Selector 구독 계약을 사용합니다.

### 이유

- **성능**: 깊은 비교는 매 렌더마다 실행되어 전체 state를 재귀적으로 순회했습니다. shallow 비교는 1단계만 확인합니다.
- **정확성**: `deepCompare`는 `Map`, `Set`, `Date`를 올바르게 처리하지 못했고, 순환 참조 시 스택 오버플로우가 발생했습니다. shallow 비교는 `Map`, `Set`, 배열, 일반 객체를 올바르게 처리하며 순환 참조에 안전합니다.
- **생태계 정합**: zustand v5가 shallow 비교를 표준 패턴으로 사용합니다.

### 사용자에게 미치는 영향

| 패턴 | 이전 (deep) | 이후 (shallow) |
|---|---|---|
| `useStore(s => s.count)` | 동작 | 동작 (동일) |
| `useStore(s => ({ a: s.a, b: s.b }))` | 깊은 비교 (값이 같으면 항상 같음) | shallow 비교 (1단계 값이 같으면 같음) |
| selector 결과의 중첩 객체 | 깊은 비교 | 참조 비교 (`Object.is`) |
| state의 `Map` / `Set` | 잘못된 비교 | 올바른 shallow 비교 |
| state의 `Date` | 잘못된 비교 | `getTime()` 기반 올바른 shallow 비교 |

### 깊은 비교가 필요한 경우

`useMemo`로 selector 결과를 메모이제이션하세요:

```ts
const value = useMemo(() => {
  return computeDerivedState(store.getState());
}, [dependency]);
```

또는 selector에서 원시값을 반환하여 `Object.is`로 충분하게 만드세요:

```ts
const time = useStore(s => s.date.getTime());
```

### selector 참조를 안정적으로 유지하기

shallow selector 캐시는 selector 함수의 참조 동일성을 기준으로 동작합니다. 인라인 selector
(`useStore(s => ({ a: s.a, b: s.b }))`)는 매 렌더마다 새로운 함수 참조를 만들어 캐시를
초기화하고 shallow 최적화를 무의미하게 만듭니다. 다음 중 하나를 선호하세요:

```ts
// 1. 모듈 스코프 selector (순수 파생은 권장)
const selectSlice = (s: State) => ({ a: s.a, b: s.b });
const slice = useStore(selectSlice);

// 2. selector가 props나 다른 반응성 입력에 의존할 때는 useCallback
const selectFiltered = useCallback(
  (s: State) => s.items.filter(i => i.id === activeId),
  [activeId],
);
const filtered = useStore(selectFiltered);
```

인라인 selector에서 새 객체/배열 리터럴을 반환하면 호출마다 새 참조가 생깁니다. shallow 비교로
1단계 값이 같을 때 리렌더는 막을 수 있지만, selector 참조를 안정화하면 `useSyncExternalStore`가
비교 자체를 건너뛸 수 있습니다.

## 개발

```bash
pnpm install
pnpm build
```

빌드 결과물은 `dist` 디렉터리에 생성됩니다.

## 라이선스

MIT
