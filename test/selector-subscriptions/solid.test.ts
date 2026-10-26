import { describe, expect, test } from 'bun:test';
import { createRoot } from 'solid-js';

import { create, bind, bindReadonly } from '../../src/core/Solid';
import { readableSource, selectNestedCount, equalNestedCount } from './readableSource';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from './helpers';
import type { CounterAction } from './helpers';

describe('Solid selector subscriptions', () => {
  test('Given negative zero is selected, When state changes to positive zero, Then the accessor delivers positive zero', () => {
    // Given
    const store = new TrackingStore(-0);
    const useNumber = create(store);
    let dispose = (): void => undefined;
    let selectedNumber = (): number => Number.NaN;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      selectedNumber = useNumber().state;
    });

    // When
    store.setState(0);

    // Then
    expect(Object.is(selectedNumber(), 0)).toBe(true);
    expect(Object.is(selectedNumber(), -0)).toBe(false);

    dispose();
  });

  test('Given a plain adapter primitive selector, When state changes, Then only relevant updates notify until owner cleanup', () => {
    // Given
    const store = new TrackingStore(initialState);
    const useCounter = create(store);
    let dispose = (): void => undefined;
    let selectedCount = (): number => -1;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      selectedCount = useCounter((state) => state.count).state;
    });

    expect(selectedCount()).toBe(1);
    expect(store.activeSelectorSubscriptions).toBe(1);

    // When
    store.setState((state) => ({ ...state, label: 'unrelated' }));

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    store.setState((state) => ({ ...state, count: 2 }));

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selectedCount()).toBe(2);

    // When
    dispose();
    store.setState((state) => ({ ...state, count: 3 }));

    // Then
    expect(store.activeSelectorSubscriptions).toBe(0);
    expect(store.selectorNotifications).toBe(1);
  });

  test('Given a reducer adapter object selector, When actions run, Then shallow-equal updates are skipped and relevant updates notify once', () => {
    // Given
    const store = new TrackingStore(initialState);
    const useCounter = create(counterReducer, store);
    let dispose = (): void => undefined;
    let selectedCount = (): Readonly<{ count: number }> => ({ count: -1 });
    let dispatch = (_action: CounterAction): void => undefined;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      const selected = useCounter((state) => ({ count: state.count }));
      selectedCount = selected.state;
      dispatch = selected.dispatch;
    });

    // When
    dispatch({ type: 'rename', label: 'unrelated' });

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    dispatch({ type: 'increment' });

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selectedCount()).toEqual({ count: 2 });

    dispose();
    expect(store.activeSelectorSubscriptions).toBe(0);
  });
});

for (const readonly of [false, true]) {
  test('custom equality: '+ (readonly ? 'readable' : 'writable') + ' binding -> nested equal updates retain selection and cleanup subscriptions', () => {
    const { source, backing } = readableSource();
    const adapter = readonly ? bindReadonly(source) : bind(backing);
    let dispose = () => {};
    const selected = createRoot((rootDispose) => {
      dispose = rootDispose;
      return adapter(selectNestedCount, equalNestedCount);
    });
    const before = selected.state();

    backing.setState(state => ({ ...state, label: 'unrelated' }));

    expect(backing.selectorNotifications).toBe(0);
    expect(selected.state()).toBe(before);
    if (readonly) {
      expect('writeOnly' in adapter).toBe(false);
      expect('setState' in selected).toBe(false);
      expect('dispatch' in selected).toBe(false);
    }
    backing.setState(state => ({ ...state, count: 2 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(selected.state()).toEqual({ nested: { count: 2 } });
    dispose();
    expect(backing.activeSelectorSubscriptions).toBe(0);
    backing.setState(state => ({ ...state, count: 3 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(adapter.readOnly(state => state.count)).toBe(3);
  });
}
