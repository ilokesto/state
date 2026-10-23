'use client';

import { dispose, history } from '@ilokesto/state/middleware';
import { bind } from '@ilokesto/state/react';
import { pipe } from '@ilokesto/state/utils';
import { useEffect, useId, useState } from 'react';

import styles from '../landings/store-landing.module.css';
import {
  DemoFrame,
  type DemoProps,
  demoButtonClass,
  demoInputClass,
  demoSecondaryButtonClass,
} from './demo-frame';

type CardState = {
  title: string;
  tone: 'paper' | 'ochre' | 'graphite';
};

const tones = ['paper', 'ochre', 'graphite'] as const;
const selectTitle = (state: Readonly<CardState>) => state.title;
const selectTone = (state: Readonly<CardState>) => state.tone;

const code = `const card = pipe
  .use(history({ limit: 50 }))
  .create({ title: 'Hello',
    tone: 'paper' });
const useCard = bind(card);
const [title, edit] =
  useCard(state => state.title);
edit(s => ({ ...s, title: 'New' }));
card.undo();
card.redo();`;

export function StateDemo({ lang }: DemoProps) {
  const [card] = useState(() => pipe
    .use(history({ limit: 50 }))
    .create<CardState>({
      title: lang === 'ko' ? '안녕하세요' : 'Hello',
      tone: 'paper',
    }));
  const [useCard] = useState(() => bind(card));
  const [title, edit] = useCard(selectTitle);
  const [tone] = useCard(selectTone);
  const titleId = useId();

  useEffect(() => () => {
    card.clearHistory();
    dispose(card);
  }, [card]);

  const copy = lang === 'ko'
    ? {
        title: '되돌릴 수 있는 카드 편집기',
        description: '제목과 색상을 바꾸고, history로 편집을 되돌리거나 다시 실행해 보세요.',
        field: '카드 제목 (최대 28자)',
        tone: '카드 색상',
        preview: '실시간 미리보기',
        empty: '제목 없음',
        paper: '종이',
        ochre: '황토',
        graphite: '흑연',
        undo: '실행 취소',
        redo: '다시 실행',
        reset: '초기화',
      }
    : {
        title: 'A card editor with undo',
        description: 'Edit the title and color. Undo and redo with history middleware.',
        field: 'Card title (up to 28 characters)',
        tone: 'Card color',
        preview: 'Live preview',
        empty: 'Untitled',
        paper: 'Paper',
        ochre: 'Ochre',
        graphite: 'Graphite',
        undo: 'Undo',
        redo: 'Redo',
        reset: 'Reset',
      };

  return (
    <DemoFrame lang={lang} name="state" title={copy.title} description={copy.description} code={code}>
      <div className={styles.demoField}>
        <label htmlFor={titleId} className="text-sm font-medium">{copy.field}</label>
        <input
          id={titleId}
          data-demo-input="state-title"
          className={demoInputClass}
          maxLength={28}
          value={title}
          onChange={event => {
            const nextTitle = event.currentTarget.value;
            edit(state => ({ ...state, title: nextTitle }));
          }}
        />
      </div>
      <div role="group" aria-label={copy.tone} className={styles.demoToolbar}>
        {tones.map(option => (
          <button
            key={option}
            type="button"
            data-demo-action="state-tone"
            data-tone={option}
            aria-pressed={tone === option}
            className={tone === option ? demoButtonClass : demoSecondaryButtonClass}
            onClick={() => edit(state => state.tone === option ? state : { ...state, tone: option })}
          >
            {copy[option]}
          </button>
        ))}
      </div>
      <div
        data-demo-result="state-preview"
        data-tone={tone}
        className={styles.demoPreview}
        aria-label={copy.preview}
      >
        <p className="text-xs font-medium uppercase tracking-wider">{copy.preview}</p>
        <output className="block w-full whitespace-pre-wrap break-all text-lg font-semibold leading-6">
          {title || copy.empty}
        </output>
      </div>
      <div className={styles.demoToolbar}>
        <button
          type="button"
          data-demo-action="state-undo"
          className={demoSecondaryButtonClass}
          disabled={!card.canUndo()}
          onClick={() => card.undo()}
        >
          {copy.undo}
        </button>
        <button
          type="button"
          data-demo-action="state-redo"
          className={demoSecondaryButtonClass}
          disabled={!card.canRedo()}
          onClick={() => card.redo()}
        >
          {copy.redo}
        </button>
        <button
          type="button"
          data-demo-action="state-reset"
          className={demoSecondaryButtonClass}
          disabled={title === card.getInitialState().title && tone === card.getInitialState().tone}
          onClick={() => edit(card.getInitialState())}
        >
          {copy.reset}
        </button>
      </div>
    </DemoFrame>
  );
}
