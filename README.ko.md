# @ilokesto/state

공유 TypeScript 상태와 미들웨어에 React, Vue, Angular, Svelte, Solid 바인딩을 더합니다.

[![npm](https://img.shields.io/npm/v/@ilokesto/state?style=flat&color=555)](https://www.npmjs.com/package/@ilokesto/state)
![MIT](https://img.shields.io/badge/license-MIT-555?style=flat)

[문서](./docs/index.ko.mdx) | [API](./docs/reference/package-surface.ko.mdx) | [English](./README.md)

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

컴포넌트 밖에서 스토어를 만들고 `bind()`로 연결합니다.

```tsx
import { createStore } from '@ilokesto/state';
import { bind } from '@ilokesto/state/react';

type CounterState = {
  count: number;
};

const counter = createStore<CounterState>({ count: 0 });
const useCounter = bind(counter);
const selectCount = (state: Readonly<CounterState>) => state.count;

export function Counter() {
  const [count] = useCounter(selectCount);

  return (
    <button
      onClick={() => counter.update(previous => ({ count: previous.count + 1 }))}
    >
      {count}
    </button>
  );
}
```

Selector는 순수하고 참조가 안정적이어야 합니다. 객체는 깊은 비교가 아닌 shallow 비교를
사용하므로 중첩 값을 변경할 때도 새 불변 상태를 반환하세요. React의 서버 스냅샷은
초기 상태에서 값을 선택합니다. 다른 어댑터도 각 프레임워크의 생명주기 요구사항을 따릅니다.

Action 중심 상태에는 `createReducer()`와 `bindReducer()`를 사용하세요.
기존 `create()` 헬퍼도 유지합니다. 명시적인 연결과 FIFO 알림의 변경 사항은
[2.0 마이그레이션 안내](./docs/advanced/migration.ko.mdx)를 참고하세요.

`pipe.use(...).create(initialState)` 빌더 문법을 사용하세요. `history()`는
`debounce()`나 `throttle()`과 같은 체인에 둘 수 없으며 `debounce()`는 `persist()`보다 앞에 둡니다.
영속화에는 `key`, 저장소 팩토리, `decode`와 명시적인 비동기 `rehydrate()`, `flush()`가 필요합니다.
호환성을 깨는 patch 마이그레이션은 아래 문서에 설명되어 있습니다.
미들웨어 리소스는 `dispose(store)`로 정리하며 저장이 필요하면 먼저 `flush()`를 기다리세요.

## 더 알아보기

- [Vanilla 상태, Reducer, 연결과 소유권](./docs/reference/vanilla.ko.mdx)
- [Selector 의미론과 프레임워크 스냅샷](./docs/advanced/selector-semantics.ko.mdx)
- [Pipe 조합, capability와 순서](./docs/utility/pipe.ko.mdx)
- [영속화 마이그레이션, 충돌과 저장 보장](./docs/advanced/persist-migrations.ko.mdx)
- [프레임워크 생성 헬퍼와 어댑터 가이드](./docs/reference/create.ko.mdx)

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
import { history, logger } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(history({ limit: 20 }))
  .create({ count: 0 });

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

### 프레임워크 연결

각 어댑터 문서에서 생명주기와 반환 형태를 확인할 수 있습니다.
[React](./docs/integrations/react.ko.mdx), [Vue](./docs/integrations/vue.ko.mdx),
[Angular](./docs/integrations/angular.ko.mdx), [Svelte](./docs/integrations/svelte.ko.mdx),
[Solid](./docs/integrations/solid.ko.mdx)를 참고하세요.

Reducer 식별자와 Store 직접 쓰기는 [Reducer 상태](./docs/guides/reducer-state.ko.mdx),
안정적인 selector와 1단계 비교는
[selector 의미론](./docs/advanced/selector-semantics.ko.mdx)을 참고하세요.

</details>

<details>
<summary>개발</summary>

Node 22와 pnpm 10.17.1을 사용하고 저장소 루트에서 실행하세요.
`pnpm test`의 배포 결과물 테스트에는 Bun도 필요합니다.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:typecheck
pnpm test:browser
pnpm test:tooling
pnpm migrate:verify
pnpm docs:publication:verify
pnpm docs:typecheck
pnpm docs:build
pnpm docs:test
```

빌드 결과는 `dist/`에 생성됩니다. 전용 문서 사이트를 빌드한 뒤
`pnpm docs:start`로 로컬에서 실행합니다. 공식 영문·한국어 문서는 `docs/`에,
렌더러는 `website/`에 있습니다.

변경 불가능한 문서 기록과 마이그레이션 이력을 보존하세요.
`.release/policy.json`에 따라 게시가 비활성화되어 있으며 로컬 게시나 문서 배포는 하지 않습니다.

</details>
