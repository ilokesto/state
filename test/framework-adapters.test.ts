import { describe, expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { create as createAngular } from '../src/core/Angular';
import { create as createReact } from '../src/core/React';
import { create as createSolid } from '../src/core/Solid';
import { create as createSvelte } from '../src/core/Svelte';
import { create as createVue } from '../src/core/Vue';
import type { ReducerAction } from '../src/types/ReduceFn';

type CounterState = Readonly<{
  count: number;
  label: string;
}>;

type CounterAction =
  | Readonly<{ type: 'increment' }>
  | Readonly<{ type: 'replace'; state: CounterState }>
  | Readonly<{ type: 'unchanged' }>;

type Selector<State, Selection> = (state: State) => Selection;
type StateWriter<State> = (nextState: State | ((previousState: State) => State)) => void;
type ActionWriter<Action> = (action: Action) => void;

type LifecycleFreeStateAdapter<State> = Readonly<{
  readOnly: {
    (): State;
    <Selection>(selector: Selector<State, Selection>): Selection;
  };
  writeOnly: () => StateWriter<State>;
}>;

type LifecycleFreeReducerAdapter<State, Action> = Readonly<{
  readOnly: {
    (): State;
    <Selection>(selector: Selector<State, Selection>): Selection;
  };
  writeOnly: () => ActionWriter<Action>;
}>;

type FrameworkAdapter = Readonly<{
  name: string;
  createState: <State>(initialState: State | Store<State>) => LifecycleFreeStateAdapter<State>;
  createReducer: <State, Action extends ReducerAction>(
    reducer: (state: State, action: Action) => State,
    initialState: State | Store<State>,
  ) => LifecycleFreeReducerAdapter<State, Action>;
}>;

const frameworkAdapters = [
  {
    name: 'React',
    createState: <State>(initialState: State | Store<State>): LifecycleFreeStateAdapter<State> =>
      createReact(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ): LifecycleFreeReducerAdapter<State, Action> => createReact(reducer, initialState),
  },
  {
    name: 'Vue',
    createState: <State>(initialState: State | Store<State>): LifecycleFreeStateAdapter<State> =>
      createVue(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ): LifecycleFreeReducerAdapter<State, Action> => createVue(reducer, initialState),
  },
  {
    name: 'Angular',
    createState: <State>(initialState: State | Store<State>): LifecycleFreeStateAdapter<State> =>
      createAngular(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ): LifecycleFreeReducerAdapter<State, Action> => createAngular(reducer, initialState),
  },
  {
    name: 'Svelte',
    createState: <State>(initialState: State | Store<State>): LifecycleFreeStateAdapter<State> =>
      createSvelte(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ): LifecycleFreeReducerAdapter<State, Action> => createSvelte(reducer, initialState),
  },
  {
    name: 'Solid',
    createState: <State>(initialState: State | Store<State>): LifecycleFreeStateAdapter<State> =>
      createSolid(initialState),
    createReducer: <State, Action extends ReducerAction>(
      reducer: (state: State, action: Action) => State,
      initialState: State | Store<State>,
    ): LifecycleFreeReducerAdapter<State, Action> => createSolid(reducer, initialState),
  },
] satisfies readonly FrameworkAdapter[];

const initialState: CounterState = { count: 1, label: 'initial' };

const counterReducer = (state: CounterState, action: CounterAction): CounterState => {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + 1 };
    case 'replace':
      return action.state;
    case 'unchanged':
      return state;
  }
};

describe('framework create() lifecycle-free contracts', () => {
  for (const framework of frameworkAdapters) {
    describe(framework.name, () => {
      test('Given plain initial state, When readOnly and writeOnly are used, Then they read selectors and update state', () => {
        // Given
        const adapter = framework.createState(initialState);
        const writeState = adapter.writeOnly();

        // Then
        expect(adapter.readOnly()).toBe(initialState);
        expect(adapter.readOnly((state) => state.label)).toBe('initial');

        // When
        const replacement: CounterState = { count: 4, label: 'replacement' };
        writeState(replacement);

        // Then
        expect(adapter.readOnly()).toBe(replacement);
        expect(adapter.readOnly((state) => state.count)).toBe(4);

        // When
        writeState((state) => ({ ...state, count: state.count + 1 }));

        // Then
        expect(adapter.readOnly()).toEqual({ count: 5, label: 'replacement' });
      });

      test('Given a reducer adapter, When actions are dispatched through writeOnly, Then readOnly reflects reducer results', () => {
        // Given
        const adapter = framework.createReducer(counterReducer, initialState);
        const dispatch = adapter.writeOnly();

        // Then
        expect(adapter.readOnly((state) => state.count)).toBe(1);

        // When
        dispatch({ type: 'increment' });

        // Then
        expect(adapter.readOnly()).toEqual({ count: 2, label: 'initial' });

        // When
        const replacement: CounterState = { count: 9, label: 'reduced' };
        dispatch({ type: 'replace', state: replacement });

        // Then
        expect(adapter.readOnly()).toBe(replacement);

        // Given
        const unchangedState = adapter.readOnly();

        // When
        dispatch({ type: 'unchanged' });

        // Then
        expect(adapter.readOnly()).toBe(unchangedState);
      });

      test('Given an existing Store instance, When it is passed to create, Then the adapter reuses it', () => {
        // Given
        const store = new Store<CounterState>(initialState);
        const adapter = framework.createState(store);
        const externalReplacement: CounterState = { count: 7, label: 'external' };

        // When
        store.setState(externalReplacement);

        // Then
        expect(adapter.readOnly()).toBe(externalReplacement);

        // When
        adapter.writeOnly()((state) => ({ ...state, count: state.count + 1 }));

        // Then
        expect(store.getState()).toEqual({ count: 8, label: 'external' });
        expect(adapter.readOnly()).toBe(store.getState());
      });

      test('Given one Store and reducer identity, When two adapters reuse them and one dispatches, Then both observe one reducer result', () => {
        // Given
        const store = new Store<CounterState>(initialState);
        let reducerCalls = 0;
        const reducer = (state: CounterState, action: CounterAction): CounterState => {
          reducerCalls += 1;
          return counterReducer(state, action);
        };
        const firstAdapter = framework.createReducer(reducer, store);
        const secondAdapter = framework.createReducer(reducer, store);

        // When
        secondAdapter.writeOnly()({ type: 'increment' });

        // Then
        expect(reducerCalls).toBe(1);
        expect(store.getState()).toEqual({ count: 2, label: 'initial' });
        expect(firstAdapter.readOnly()).toBe(store.getState());
        expect(secondAdapter.readOnly()).toBe(store.getState());
      });
    });
  }
});
