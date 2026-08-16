import { describe, expect, mock, test } from 'bun:test';

import {
  counterReducer,
  initialState,
  TrackingStore,
} from './helpers';

const cleanupCallbacks: (() => void)[] = [];
let useServerSnapshot = false;

mock.module('react', () => ({
  useMemo: <Value>(factory: () => Value): Value => factory(),
  useSyncExternalStore: <Snapshot>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot?: () => Snapshot,
  ): Snapshot => {
    cleanupCallbacks.push(subscribe(() => undefined));
    if (useServerSnapshot && getServerSnapshot) return getServerSnapshot();
    return getSnapshot();
  },
}));

const { create } = await import('../../src/core/React');

describe('React selector subscriptions', () => {
  test('Given a plain adapter primitive selector, When state changes, Then only relevant updates notify until hook cleanup', () => {
    // Given
    useServerSnapshot = false;
    const store = new TrackingStore(initialState);
    const useCounter = create(store);
    const selected = useCounter((state) => state.count);

    expect(selected[0]).toBe(1);
    expect(store.activeSelectorSubscriptions).toBe(1);

    // When
    store.setState((state) => ({ ...state, label: 'unrelated' }));

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    store.setState((state) => ({ ...state, count: 2 }));

    // Then
    expect(store.selectorNotifications).toBe(1);

    // When
    cleanupCallbacks.pop()?.();
    expect(store.activeSelectorSubscriptions).toBe(0);
    store.setState((state) => ({ ...state, count: 3 }));

    // Then
    expect(store.activeSelectorSubscriptions).toBe(0);
    expect(store.selectorNotifications).toBe(1);
  });

  test('Given a reducer adapter object selector, When actions run, Then shallow-equal updates are skipped and relevant updates notify once', () => {
    // Given
    useServerSnapshot = false;
    const store = new TrackingStore(initialState);
    const useCounter = create(counterReducer, store);
    const selected = useCounter((state) => ({ count: state.count }));

    // When
    selected[1]({ type: 'rename', label: 'unrelated' });

    // Then
    expect(store.selectorNotifications).toBe(0);

    // When
    selected[1]({ type: 'increment' });

    // Then
    expect(store.selectorNotifications).toBe(1);

    cleanupCallbacks.pop()?.();
  });

  test('Given current state differs from initial state, When React reads the server snapshot, Then the selected initial value is returned', () => {
    // Given
    useServerSnapshot = true;
    const store = new TrackingStore(initialState);
    store.setState({ count: 9, label: 'current' });
    const useCounter = create(store);

    // When
    const selected = useCounter((state) => ({ count: state.count }));

    // Then
    expect(selected[0]).toEqual({ count: 1 });

    cleanupCallbacks.pop()?.();
  });
});
