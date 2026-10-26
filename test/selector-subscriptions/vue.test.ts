import { describe, expect, test } from 'bun:test';
import { effectScope } from 'vue';

import { create, bind, bindReadonly } from '../../src/core/Vue';
import { readableSource, selectNestedCount, equalNestedCount } from './readableSource';
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

for (const readonly of [false, true]) {
  test('custom equality: '+ (readonly ? 'readable' : 'writable') + ' binding -> nested equal updates retain selection and cleanup subscriptions', () => {
    const { source, backing } = readableSource();
    const adapter = readonly ? bindReadonly(source) : bind(backing);
    const scope = effectScope();
    const selected = scope.run(() => adapter(selectNestedCount, equalNestedCount))!;
    const before = selected.state.value;

    backing.setState(state => ({ ...state, label: 'unrelated' }));

    expect(backing.selectorNotifications).toBe(0);
    expect(selected.state.value).toBe(before);
    if (readonly) {
      expect('writeOnly' in adapter).toBe(false);
      expect('setState' in selected).toBe(false);
      expect('dispatch' in selected).toBe(false);
    }
    backing.setState(state => ({ ...state, count: 2 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(selected.state.value).toEqual({ nested: { count: 2 } });
    scope.stop();
    expect(backing.activeSelectorSubscriptions).toBe(0);
    backing.setState(state => ({ ...state, count: 3 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(adapter.readOnly(state => state.count)).toBe(3);
  });
}
