'use client';

import { create, type UseState } from '@ilokesto/state/react';
import { useState } from 'react';

import {
  DemoFrame,
  type DemoProps,
  demoButtonClass,
  demoSecondaryButtonClass,
} from './demo-frame';

type CounterState = { count: number };
type CounterHook = UseState<CounterState>;

const selectCount = (state: Readonly<CounterState>) => state.count;
const selectIsEven = (state: Readonly<CounterState>) => state.count % 2 === 0;

const code = `const useCounter = create({ count: 0 });

function Counter() {
  const [count] = useCounter(state => state.count);
  const [isEven] = useCounter(
    state => state.count % 2 === 0,
  );
  const setCounter = useCounter.writeOnly();

  return <button onClick={() => setCounter(state => ({
    count: state.count + 1,
  }))}>{count} · {isEven ? 'Even' : 'Odd'}</button>;
}`;

function CountView({ useCounter, label }: { useCounter: CounterHook; label: string }) {
  const [count] = useCounter(selectCount);

  return (
    <div className="text-center">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-fd-muted-foreground">{label}</p>
      <output
        data-demo-result="state-count"
        aria-live="polite"
        className="mt-1 block font-mono text-7xl font-semibold tracking-[-0.08em] tabular-nums text-fd-foreground"
      >
        {count}
      </output>
    </div>
  );
}

function StatusView({ useCounter, label, even, odd }: {
  useCounter: CounterHook;
  label: string;
  even: string;
  odd: string;
}) {
  const [isEven] = useCounter(selectIsEven);

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <span className="text-fd-muted-foreground">{label}</span>
      <output
        data-demo-result="state-parity"
        aria-live="polite"
        className="rounded-sm bg-fd-accent px-3 py-1 font-semibold text-fd-accent-foreground"
      >
        {isEven ? even : odd}
      </output>
    </div>
  );
}

export function StateDemo({ lang }: DemoProps) {
  const [useCounter] = useState(() => create<CounterState>({ count: 0 }));
  const setCounter = useCounter.writeOnly();

  const copy = lang === 'ko'
    ? {
        title: '하나의 상태, 두 개의 뷰',
        description: '각 뷰는 같은 상태에서 필요한 값만 선택합니다. 한 번의 변경이 두 선택 결과를 함께 갱신합니다.',
        countView: '숫자 선택 뷰',
        statusView: '홀짝 선택 뷰',
        even: '짝수',
        odd: '홀수',
        increment: '카운트 늘리기',
        reset: '초기화',
      }
    : {
        title: 'One state, two views',
        description: 'Each view selects only what it needs from shared state. One update refreshes both selections.',
        countView: 'Count selector view',
        statusView: 'Parity selector view',
        even: 'Even',
        odd: 'Odd',
        increment: 'Increment count',
        reset: 'Reset',
      };

  return (
    <DemoFrame lang={lang} name="state" title={copy.title} description={copy.description} code={code}>
        <div className="space-y-4">
          <CountView useCounter={useCounter} label={copy.countView} />
          <StatusView useCounter={useCounter} label={copy.statusView} even={copy.even} odd={copy.odd} />
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" data-demo-action="state-increment" className={demoButtonClass} onClick={() => setCounter(state => ({ count: state.count + 1 }))}>
              {copy.increment}
            </button>
            <button type="button" data-demo-action="state-reset" className={demoSecondaryButtonClass} onClick={() => setCounter({ count: 0 })}>
              {copy.reset}
            </button>
          </div>
        </div>
    </DemoFrame>
  );
}
