import { describe, expect, test } from 'bun:test';
import type { Store } from '@ilokesto/store';

import { create as createAngular } from '../src/core/Angular';
import { create as createReact } from '../src/core/React';
import { create as createSolid } from '../src/core/Solid';
import { create as createSvelte } from '../src/core/Svelte';
import { create as createVue } from '../src/core/Vue';
import type { ReducerAction } from '../src/types/ReduceFn';

type StateAdapter<State> = Readonly<{
  readOnly: () => State;
}>;

type ReducerAdapter<State, Action> = Readonly<{
  readOnly: () => State;
  writeOnly: () => (action: Action) => void;
}>;

type FrameworkAdapter = Readonly<{
  name: string;
  createState: <State>(initialState: State | Store<State>) => StateAdapter<State>;
  createReducer: <State, Action extends ReducerAction>(
    reducer: (state: State, action: Action) => State,
    initialState: State | Store<State>,
  ) => ReducerAdapter<State, Action>;
}>;

type IncrementAction = Readonly<{ type: 'increment' }>;

const frameworkAdapters = [
  {
    name: 'React',
    createState: <State>(initialState: State | Store<State>) => createReact(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ) => createReact(reducer, initialState),
  },
  {
    name: 'Vue',
    createState: <State>(initialState: State | Store<State>) => createVue(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ) => createVue(reducer, initialState),
  },
  {
    name: 'Angular',
    createState: <State>(initialState: State | Store<State>) => createAngular(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ) => createAngular(reducer, initialState),
  },
  {
    name: 'Svelte',
    createState: <State>(initialState: State | Store<State>) => createSvelte(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ) => createSvelte(reducer, initialState),
  },
  {
    name: 'Solid',
    createState: <State>(initialState: State | Store<State>) => createSolid(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ) => createSolid(reducer, initialState),
  },
] satisfies readonly FrameworkAdapter[];

describe('framework create() overload detection', () => {
  for (const framework of frameworkAdapters) {
    describe(framework.name, () => {
      test('Given function-valued plain state, When create receives one argument, Then it stores the function without invoking it as a reducer', () => {
        // Given
        const initialState = (): number => 1;

        // When
        const adapter = framework.createState(initialState);

        // Then
        expect(adapter.readOnly()).toBe(initialState);
        expect(adapter.readOnly()()).toBe(1);
      });

      test('Given a reducer and initial state, When create receives two arguments, Then dispatch uses the reducer', () => {
        // Given
        const reducer = (state: number, _action: IncrementAction): number => state + 1;
        const adapter = framework.createReducer(reducer, 1);

        // When
        adapter.writeOnly()({ type: 'increment' });

        // Then
        expect(adapter.readOnly()).toBe(2);
      });

      test('Given a reducer with explicit undefined initial state, When create receives two arguments, Then dispatch still uses the reducer', () => {
        // Given
        const reducer = (state: number | undefined, _action: IncrementAction): number =>
          (state ?? 0) + 1;
        const adapter = framework.createReducer<number | undefined, IncrementAction>(
          reducer,
          undefined,
        );

        // When
        adapter.writeOnly()({ type: 'increment' });

        // Then
        expect(adapter.readOnly()).toBe(1);
      });
    });
  }
});
