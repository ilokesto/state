# @ilokesto/state

공유 TypeScript 상태와 미들웨어에 React, Vue, Angular, Svelte, Solid 바인딩을 더합니다.

[![npm](https://img.shields.io/npm/v/@ilokesto/state?style=flat&color=555)](https://www.npmjs.com/package/@ilokesto/state)
![MIT](https://img.shields.io/badge/license-MIT-555?style=flat)

[English](./README.md)

- 일반 상태나 Reducer 상태를 한 번 만들고 프레임워크에 연결합니다.
- 공통 shallow 동등성 계약으로 필요한 값만 구독합니다.
- 검증, 영속화, 히스토리, 로깅, 시간 제어 미들웨어를 조합합니다.

## 설치

```sh
pnpm add @ilokesto/state
```

사용할 프레임워크도 함께 설치하세요. 아래 예제는 React를 사용합니다.
`immer`는 `@ilokesto/state/adaptor`에만 필요한 선택적 피어 의존성입니다.

## 빠른 시작

컴포넌트 밖에서 `create()`로 공유 상태 hook을 만듭니다.

```tsx
import { create } from '@ilokesto/state/react';

const useCounter = create({ count: 0 });

export function Counter() {
  const [count, setCounter] = useCounter(state => state.count);

  return (
    <button
      onClick={() => setCounter(previous => ({ ...previous, count: previous.count + 1 }))}
    >
      {count}
    </button>
  );
}
```

Selector는 순수해야 하며 안정적인 함수 참조가 필요하면 컴포넌트 밖에 선언하세요.
객체는 깊은 비교가 아닌 shallow 비교를
사용하므로 중첩 값을 변경할 때도 새 불변 상태를 반환하세요. React의 서버 스냅샷은
초기 상태에서 값을 선택합니다. 다른 어댑터도 각 프레임워크의 생명주기 요구사항을 따릅니다.

Hook은 `[state, setter]`를 반환하고 selector를 사용하면 `[선택한 값, setter]`를 반환합니다.
Selector를 사용해도 setter는 전체 상태를 갱신합니다. Reducer 상태는
`create(reducer, initialState)`로 만들고 `[state, dispatch]`를 받습니다.

`pipe.use(...).create(initialState)` 빌더 문법을 사용하세요. `history()`는 timer의 실제
commit을 기록하며 undo/redo는 pending timer를 취소하고 validation을 거쳐 replay합니다.
Timer control은 `store.debounce`, `store.throttle`의 `flush`, `cancel`, `pending`입니다.
`debounce()`는 `persist()`보다 앞에 둡니다.
영속화에는 `key`, 저장소 팩토리, `decode`와 명시적인 비동기 `rehydrate()`, `flush()`가 필요합니다.
미들웨어 리소스는 `dispose(store)`로 정리하며 저장이 필요하면 먼저 `flush()`를 기다리세요.

<details>
<summary>미들웨어 예제</summary>

### 빌더 기본 사용

<!-- pipe-example:builder-basics -->
```ts
import { create } from '@ilokesto/state/react';
import { jsonStorage, logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const decodeCounter = (value: unknown): { readonly count: number } | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;
  return { count: value.count };
};

const counterStore = pipe
  .use(logger({ timestamp: true }))
  .use(persist({ key: 'counter', storage: jsonStorage(() => window.localStorage), decode: decodeCounter }))
  .create({ count: 0 });

export const useCounter = create(counterStore);

export async function restoreCounter() {
  await counterStore.persist.rehydrate();
}
```

### 히스토리

<!-- pipe-example:history-pipe -->
```ts
import { debounce, history, logger } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(history({ limit: 20 }))
  .use(debounce(250, { mode: 'quiet' }))
  .create({ count: 0 });

counterStore.set({ count: 1 });
counterStore.debounce.flush();
counterStore.undo();
```

### Throttle

<!-- pipe-example:throttle-pipe -->
```ts
import { logger, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(throttle(250))
  .create({ count: 0 });
```

### 리소스 정리

<!-- pipe-example:dispose-store -->
```ts
import { dispose, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe.use(throttle(250)).create({ count: 0 });

dispose(counterStore);
```

### 안전한 영속화

<!-- pipe-example:safe-persist-pipe -->
```ts
import { indexedDBStorage, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

type CounterState = { readonly count: number };

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;

  return { count: value.count };
};

const counterStore = pipe
  .use(persist({
    key: 'counter',
    storage: indexedDBStorage({ database: 'my-app-state' }),
    decode: decodeCounter,
  }))
  .create<CounterState>({ count: 0 });

await counterStore.persist.rehydrate();
counterStore.setState({ count: 1 });
await counterStore.persist.flush();
```

### 사용자 정의 capability

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

</details>

<details>
<summary>개발</summary>

Node 24.22.1과 pnpm 10.17.1을 사용하고 저장소 루트에서 실행하세요.
`pnpm test`의 배포 결과물 테스트에는 Bun도 필요합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:typecheck
pnpm test:browser
pnpm test:tooling
```

빌드 결과는 `dist/`에 생성됩니다.

PR은 Verify CI를 실행합니다. main 병합은 Changesets 릴리스 PR을 생성·갱신하며,
릴리스 PR을 병합하면 GitHub Actions가 성공한 Verify의 정확한 아티팩트만 게시합니다.
적용 전에 `Allow GitHub Actions to create and approve pull requests`를 켜고
`Production` 환경에 `NPM_TOKEN`을 설정하세요. 로컬 게시는 하지 않습니다.

</details>
