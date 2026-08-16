import { DestroyRef } from '@angular/core';
import { describe, expect, test } from 'bun:test';

import { create } from '../../src/core/Angular';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from './helpers';

class TestDestroyRef extends DestroyRef {
  readonly callbacks = new Set<() => void>();
  destroyed = false;

  override onDestroy(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  destroy(): void {
    this.destroyed = true;
    for (const callback of this.callbacks) callback();
    this.callbacks.clear();
  }
}

describe('Angular selector subscriptions', () => {
  test('Given no injection context or DestroyRef, When a selection is created, Then the failure leaves no subscription', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(store);

    // When / Then
    expect(() => counter((state) => state.count)).toThrow();
    expect(store.activeSelectorSubscriptions).toBe(0);
  });

  test('Given a plain adapter primitive selector, When state changes, Then only relevant updates notify until destroy', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(store);
    const destroyRef = new TestDestroyRef();
    const selected = counter((state) => state.count, { destroyRef });

    expect(selected.state()).toBe(1);
    expect(store.activeSelectorSubscriptions).toBe(1);

    // When
    store.setState((state) => ({ ...state, label: 'unrelated' }));

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    store.setState((state) => ({ ...state, count: 2 }));

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selected.state()).toBe(2);

    // When
    destroyRef.destroy();
    store.setState((state) => ({ ...state, count: 3 }));

    // Then
    expect(store.activeSelectorSubscriptions).toBe(0);
    expect(store.selectorNotifications).toBe(1);
  });

  test('Given a reducer adapter object selector, When actions run, Then shallow-equal updates are skipped and relevant updates notify once', () => {
    // Given
    const store = new TrackingStore(initialState);
    const counter = create(counterReducer, store);
    const destroyRef = new TestDestroyRef();
    const selected = counter((state) => ({ count: state.count }), {
      destroyRef,
    });

    // When
    selected.dispatch({ type: 'rename', label: 'unrelated' });

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    selected.dispatch({ type: 'increment' });

    // Then
    expect(store.selectorNotifications).toBe(1);
    expect(selected.state()).toEqual({ count: 2 });

    destroyRef.destroy();
    expect(store.activeSelectorSubscriptions).toBe(0);
  });
});
