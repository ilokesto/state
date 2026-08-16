import { describe, expect, test } from 'bun:test';

import { create } from '../../src/core/Svelte';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from './helpers';

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
