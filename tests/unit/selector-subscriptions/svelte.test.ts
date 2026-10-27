import { describe, expect, test } from 'bun:test';

import { create, bind, bindReadonly } from '../../../src/core/Svelte';
import { readableSource, selectNestedCount, equalNestedCount } from '../../fixtures/selector-subscriptions/readableSource';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from '../../fixtures/selector-subscriptions/helpers';

describe('Svelte selector subscriptions', () => {
  test('Given a select subscriber updates synchronously during initial delivery, When it subscribes, Then the selected update is observed', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(store);
    const values: number[] = [];

    // When
    const unsubscribe = counter.select((state) => state.count).subscribe((value) => {
      values.push(value);
      if (values.length === 1) {
        store.setState((state) => ({ ...state, count: 2 }));
      }
    });

    // Then
    expect(values).toEqual([1, 2]);

    unsubscribe();
  });

  test('Given a root subscriber updates synchronously during initial delivery, When it subscribes, Then the state update is observed', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(store);
    const values: number[] = [];

    // When
    const unsubscribe = counter.subscribe((state) => {
      values.push(state.count);
      if (values.length === 1) {
        store.setState((currentState) => ({ ...currentState, count: 2 }));
      }
    });

    // Then
    expect(values).toEqual([1, 2]);

    unsubscribe();
  });

  test('Given a plain adapter primitive selector, When state changes, Then only relevant updates notify until unsubscribe', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(store);
    const values: number[] = [];
    const unsubscribe = counter.select((state) => state.count).subscribe((value) => {
      values.push(value);
    });

    expect(values).toEqual([1]);
    expect(store.activeSelectorSubscriptions).toBe(1);

    // When
    store.setState((state) => ({ ...state, label: 'unrelated' }));

    // Then
    expect(store.selectorNotifications).toBe(0);
    expect(values).toEqual([1]);

    // When
    store.setState((state) => ({ ...state, count: 2 }));

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(values).toEqual([1, 2]);

    // When
    unsubscribe();
    store.setState((state) => ({ ...state, count: 3 }));

    // Then
    expect(store.activeSelectorSubscriptions).toBe(0);
    expect(store.selectorNotifications).toBe(1);
    expect(values).toEqual([1, 2]);
  });

  test('Given a reducer adapter object selector, When actions run, Then shallow-equal updates are skipped and relevant updates notify once', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(counterReducer, store);
    const values: Readonly<{ count: number }>[] = [];
    const unsubscribe = counter
      .select((state) => ({ count: state.count }))
      .subscribe((value) => {
        values.push(value);
      });

    // When
    counter.dispatch({ type: 'rename', label: 'unrelated' });

    // Then
    expect(store.selectorNotifications).toBe(0);
    expect(values).toEqual([{ count: 1 }]);

    // When
    counter.dispatch({ type: 'increment' });

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(values).toEqual([{ count: 1 }, { count: 2 }]);

    unsubscribe();
    expect(store.activeSelectorSubscriptions).toBe(0);
  });
});

for (const readonly of [false, true]) {
  test('custom equality: '+ (readonly ? 'readable' : 'writable') + ' binding -> nested equal updates retain selection and cleanup subscriptions', () => {
    const { source, backing } = readableSource();
    const adapter = readonly ? bindReadonly(source) : bind(backing);
    const values: ReturnType<typeof selectNestedCount>[] = [];
    const selected = adapter.select(selectNestedCount, equalNestedCount);
    const unsubscribe = selected.subscribe(value => values.push(value));
    const before = values.at(-1)!;

    backing.setState(state => ({ ...state, label: 'unrelated' }));

    expect(backing.selectorNotifications).toBe(0);
    expect(values.at(-1)!).toBe(before);
    if (readonly) {
      expect('writeOnly' in adapter).toBe(false);
      expect('setState' in selected).toBe(false);
      expect('dispatch' in selected).toBe(false);
    }
    backing.setState(state => ({ ...state, count: 2 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(values.at(-1)!).toEqual({ nested: { count: 2 } });
    unsubscribe();
    expect(backing.activeSelectorSubscriptions).toBe(0);
    backing.setState(state => ({ ...state, count: 3 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(adapter.readOnly(state => state.count)).toBe(3);
  });
}
