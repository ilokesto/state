import { DestroyRef } from '@angular/core';
import { describe, expect, test } from 'bun:test';

import { create, bind, bindReadonly } from '../../../src/core/Angular';
import { readableSource, selectNestedCount, equalNestedCount } from '../../fixtures/selector-subscriptions/readableSource';
import {
  counterReducer,
  initialState,
  TrackingStore,
} from '../../fixtures/selector-subscriptions/helpers';

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
  test('selector options: omitted equality -> writable and readonly bindings retain explicit lifecycle cleanup', () => {
    const { source, backing } = readableSource();
    const destroyRef = new TestDestroyRef();
    const writable = bind(backing);
    const readonly = bindReadonly(source);
    const select = (state: typeof initialState) => ({ count: state.count });
    const first = writable(select, undefined, { destroyRef });
    const second = readonly(select, undefined, { destroyRef });

    backing.setState(state => ({ ...state, label: 'unrelated' }));

    expect(backing.selectorNotifications).toBe(0);
    expect(first.state()).toEqual({ count: 1 });
    expect(second.state()).toEqual({ count: 1 });
    destroyRef.destroy();
    expect(backing.activeSelectorSubscriptions).toBe(0);
  });

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

for (const readonly of [false, true]) {
  test('custom equality: '+ (readonly ? 'readable' : 'writable') + ' binding -> nested equal updates retain selection and cleanup subscriptions', () => {
    const { source, backing } = readableSource();
    const adapter = readonly ? bindReadonly(source) : bind(backing);
    const destroyRef = new TestDestroyRef();
    const selected = adapter(selectNestedCount, equalNestedCount, { destroyRef });
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
    destroyRef.destroy();
    expect(backing.activeSelectorSubscriptions).toBe(0);
    backing.setState(state => ({ ...state, count: 3 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(adapter.readOnly(state => state.count)).toBe(3);
  });
}
