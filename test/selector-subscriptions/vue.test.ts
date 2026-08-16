import { describe, expect, test } from 'bun:test';
import { effectScope } from 'vue';

import { create } from '../../src/core/Vue';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from './helpers';

describe('Vue selector subscriptions', () => {
  test('Given a plain adapter primitive selector, When state changes, Then only relevant updates notify until scope cleanup', () => {
    // Given
    const store = new TrackingStore(initialState);
    const useCounter = create(store);
    const scope = effectScope();
    const selected = scope.run(() => useCounter((state) => state.count));

    expect(selected?.state.value).toBe(1);
    expect(store.activeSelectorSubscriptions).toBe(1);

    // When
    store.setState((state) => ({ ...state, label: 'unrelated' }));

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    store.setState((state) => ({ ...state, count: 2 }));

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selected?.state.value).toBe(2);

    // When
    scope.stop();
    store.setState((state) => ({ ...state, count: 3 }));

    // Then
    expect(store.activeSelectorSubscriptions).toBe(0);
    expect(store.selectorNotifications).toBe(1);
  });

  test('Given a reducer adapter object selector, When actions run, Then shallow-equal updates are skipped and relevant updates notify once', () => {
    // Given
    const store = new TrackingStore(initialState);
    const useCounter = create(counterReducer, store);
    const scope = effectScope();
    const selected = scope.run(() =>
      useCounter((state) => ({ count: state.count })),
    );

    // When
    selected?.dispatch({ type: 'rename', label: 'unrelated' });

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    selected?.dispatch({ type: 'increment' });

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selected?.state.value).toEqual({ count: 2 });

    scope.stop();
    expect(store.activeSelectorSubscriptions).toBe(0);
  });
});
