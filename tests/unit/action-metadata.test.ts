import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import {
  dispatchStoreAction,
  getDispatchedStoreAction,
  getStoreActionMetadata,
  runWithStoreActionMetadata,
} from '../../src/lib/actionMetadata';

test('Given an outer metadata scope, when an inner scope completes, then the outer metadata is restored', () => {
  // Given
  const store = new Store({ count: 0 });

  // When
  runWithStoreActionMetadata(store, { type: 'outer' }, () => {
    runWithStoreActionMetadata(store, { type: 'inner' }, () => {
      expect(getStoreActionMetadata(store)).toEqual({ type: 'inner' });
    });

    // Then
    expect(getStoreActionMetadata(store)).toEqual({ type: 'outer' });
  });

  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given an outer metadata scope, when a throwing inner scope is caught, then the outer metadata is restored', () => {
  // Given
  const store = new Store({ count: 0 });

  // When
  runWithStoreActionMetadata(store, { type: 'outer' }, () => {
    expect(() => {
      runWithStoreActionMetadata(store, { type: 'inner' }, () => {
        expect(getStoreActionMetadata(store)).toEqual({ type: 'inner' });
        throw new Error('inner failure');
      });
    }).toThrow('inner failure');

    // Then
    expect(getStoreActionMetadata(store)).toEqual({ type: 'outer' });
  });

  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given an action with a throwing type getter, when dispatch starts, then action context is cleaned up', () => {
  // Given
  const store = new Store({ count: 0 });
  const action = {
    get type(): string {
      throw new Error('type getter failed');
    },
  };

  // When
  const dispatch = () => dispatchStoreAction(store, action);

  // Then
  expect(dispatch).toThrow('type getter failed');
  expect(getDispatchedStoreAction(store)).toBeUndefined();
  expect(getStoreActionMetadata(store)).toBeUndefined();
});
