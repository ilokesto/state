import { expect, test } from 'bun:test';

import { history } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';

test('Given committed states, when history controls replay and branch, then stacks track only changed successful commits', () => {
  // Given
  const store = pipe.use(history({ limit: 3 })).create({ value: 0 });

  // When / Then
  expect(store.canUndo()).toBeFalse();
  expect(store.canRedo()).toBeFalse();
  store.undo();
  store.redo();
  store.setState({ value: 1 });
  store.setState({ value: 2 });
  store.undo();
  expect(store.getState()).toEqual({ value: 1 });
  store.undo();
  expect(store.getState()).toEqual({ value: 0 });
  store.redo();
  expect(store.getState()).toEqual({ value: 1 });
  store.setState({ value: 5 });
  expect(store.getState()).toEqual({ value: 5 });
  expect(store.canUndo()).toBeTrue();
  expect(store.canRedo()).toBeFalse();
});

test('Given bounded history limits, when commits exceed capacity, then zero, one, and default limits evict oldest entries', () => {
  // Given
  const disabled = pipe.use(history({ limit: 0 })).create({ value: 0 });
  const single = pipe.use(history({ limit: 1 })).create({ value: 0 });
  const defaults = pipe.use(history()).create({ value: 0 });

  // When
  disabled.setState({ value: 1 });
  single.setState({ value: 1 });
  single.setState({ value: 2 });
  for (let value = 1; value <= 301; value += 1) {
    defaults.setState({ value });
  }
  single.undo();
  for (let count = 0; count < 300; count += 1) {
    defaults.undo();
  }

  // Then
  expect(disabled.canUndo()).toBeFalse();
  disabled.undo();
  expect(disabled.getState()).toEqual({ value: 1 });
  expect(single.getState()).toEqual({ value: 1 });
  expect(single.canUndo()).toBeFalse();
  single.redo();
  expect(single.getState()).toEqual({ value: 2 });
  expect(defaults.getState()).toEqual({ value: 1 });
  expect(defaults.canUndo()).toBeFalse();
});

test('Given a changed stack, when an updater throws or history clears, then failed work is absent and clear leaves state unchanged', () => {
  // Given
  const store = pipe.use(history({ limit: 2 })).create({ value: 0 });
  const failure = new TypeError('updater failed');
  store.setState({ value: 1 });

  // When / Then
  expect(() => store.setState(() => {
    throw failure;
  })).toThrow(failure);
  store.undo();
  expect(store.getState()).toEqual({ value: 0 });
  expect(store.canUndo()).toBeFalse();
  expect(store.canRedo()).toBeTrue();
  store.clearHistory();
  expect(store.getState()).toEqual({ value: 0 });
  expect(store.canUndo()).toBeFalse();
  expect(store.canRedo()).toBeFalse();
  store.undo();
  store.redo();
  expect(store.getState()).toEqual({ value: 0 });
});
