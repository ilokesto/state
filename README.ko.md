# @ilokesto/state

[English](./README.md) | **한국어**

`@ilokesto/store` 위에 얹는 작은 React 상태 헬퍼입니다.

이 패키지는 vanilla store core를 React에서 쓰기 쉬운 `create()` API, selector 기반 구독, reducer 지원, 그리고 선택적 middleware 유틸리티로 감싼 형태입니다.

## Features

- plain state 또는 reducer로 React hook 생성
- selector로 필요한 조각만 구독
- `readOnly()`로 컴포넌트 밖에서 상태 조회
- `writeOnly()`로 컴포넌트 밖에서 상태 업데이트
- `logger`, `debounce`, `persist`, `devtools` 같은 middleware 조합 가능
- `adaptor()`로 immer 기반 객체 업데이트 지원

## Installation

```bash
pnpm add @ilokesto/state react immer
```

또는

```bash
npm install @ilokesto/state react immer
```

`immer`는 optional peer dependency로 선언되어 있어서 `adaptor()`를 쓸 때만 필요합니다.

## Basic Usage

```ts
import { create } from '@ilokesto/state';

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

## Reducer Usage

```ts
import { create } from '@ilokesto/state';

type CounterState = {
  count: number;
};

type CounterAction = { type: 'increment' } | { type: 'decrement' };

const useCounter = create<CounterState, CounterAction>(
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

const [count, dispatch] = useCounter((state) => state.count);

dispatch({ type: 'increment' });
```

## Read and Write Outside Components

```ts
const setCounter = useCounter.writeOnly();
const currentCount = useCounter.readOnly((state) => state.count);

setCounter((prev) => ({ ...prev, count: prev.count + 1 }));

console.log(currentCount);
```

## Middleware and Utilities

### `@ilokesto/state/middleware`

- `debounce()`
- `devtools()`
- `logger()`
- `persist()`
- `validate()`

### `@ilokesto/state/utils`

- `pipe()`로 plain state와 middleware를 조합해 store 생성
- `adaptor()`로 immer 기반 불변 객체 업데이트 함수 생성

```ts
import { create } from '@ilokesto/state';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe({ count: 0 }, logger({ timestamp: true }), persist({ local: 'counter' }));

export const useCounter = create(counterStore);
```

## Exports

- `@ilokesto/state` → `create`
- `@ilokesto/state/middleware` → `middleware`
- `@ilokesto/state/utils` → `adaptor`, `pipe`

## Development

```bash
pnpm install
pnpm build
```

빌드 결과물은 `dist` 디렉터리에 생성됩니다.

## License

MIT
