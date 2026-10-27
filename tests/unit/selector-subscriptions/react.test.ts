import { describe, expect, mock, test } from 'bun:test';

import {
  counterReducer,
  initialState,
  TrackingStore,
} from '../../fixtures/selector-subscriptions/helpers';

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
    const read = useServerSnapshot && getServerSnapshot ? getServerSnapshot : getSnapshot;
    const snapshot = read();
    expect(read()).toBe(snapshot);
    return snapshot;
  },
}));

const { create, bind, bindReadonly } = await import('../../../src/core/React');
import { readableSource, selectNestedCount, equalNestedCount } from '../../fixtures/selector-subscriptions/readableSource';

describe('React selector subscriptions', () => {
  test('readonly server snapshot: custom equality -> initial selection is stable instead of current state', () => {
    useServerSnapshot = true;
    const { source, backing } = readableSource();
    backing.setState(state => ({ ...state, count: 9 }));
    const useCounter = bindReadonly(source);

    const selected = useCounter(selectNestedCount, equalNestedCount);

    expect(selected).toEqual({ nested: { count: 1 } });
    cleanupCallbacks.pop()?.();
    expect(backing.activeSelectorSubscriptions).toBe(0);
  });

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

for (const readonly of [false, true]) {
  test('custom equality: '+ (readonly ? 'readable' : 'writable') + ' binding -> nested equal updates retain selection and cleanup subscriptions', () => {
    const { source, backing } = readableSource();
    const readonlyAdapter = bindReadonly(source);
    const writableAdapter = bind(backing);
    const adapter = readonly ? readonlyAdapter : writableAdapter;
    useServerSnapshot = false;
    const selected = readonly
      ? readonlyAdapter(selectNestedCount, equalNestedCount)
      : writableAdapter(selectNestedCount, equalNestedCount);
    const before = selected;

    backing.setState(state => ({ ...state, label: 'unrelated' }));

    expect(backing.selectorNotifications).toBe(0);
    expect(selected).toBe(before);
    if (readonly) {
      expect('writeOnly' in adapter).toBe(false);
      expect('setState' in selected).toBe(false);
      expect('dispatch' in selected).toBe(false);
    }
    backing.setState(state => ({ ...state, count: 2 }));
    expect(backing.selectorNotifications).toBe(1);

    cleanupCallbacks.pop()?.();
    expect(backing.activeSelectorSubscriptions).toBe(0);
    backing.setState(state => ({ ...state, count: 3 }));
    expect(backing.selectorNotifications).toBe(1);
    expect(adapter.readOnly(state => state.count)).toBe(3);
  });
}
