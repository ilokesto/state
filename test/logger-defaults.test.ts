import { expect, spyOn, test } from 'bun:test';

import { logger } from '../src/middleware';
import { pipe } from '../src/utils/pipe';

const RENDERED_TIME = 'logger-defaults-time-sentinel';

function captureLoggerOutput(middleware: ReturnType<typeof logger>): readonly (readonly unknown[])[] {
  const logs: unknown[][] = [];
  const groupSpy = spyOn(console, 'group').mockImplementation(() => undefined);
  const collapsedSpy = spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
  const groupEndSpy = spyOn(console, 'groupEnd').mockImplementation(() => undefined);
  const logSpy = spyOn(console, 'log').mockImplementation((...args: readonly unknown[]) => {
    logs.push([...args]);
  });
  const timeSpy = spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue(RENDERED_TIME);

  try {
    const store = pipe.use(middleware).create({ count: 0 });
    store.setState({ count: 1 });

    return logs;
  } finally {
    timeSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
    collapsedSpy.mockRestore();
    groupSpy.mockRestore();
  }
}

test('Given collapsed logger options, when timestamp is omitted, then the default timestamp is logged', () => {
  // Given
  const middleware = logger({ collapsed: true });

  // When
  const logs = captureLoggerOutput(middleware);

  // Then
  expect(logs.some((arguments_) => arguments_.includes(RENDERED_TIME))).toBe(true);
});

test('Given logger options, when timestamp is explicitly false, then no timestamp is logged', () => {
  // Given
  const middleware = logger({ timestamp: false });

  // When
  const logs = captureLoggerOutput(middleware);

  // Then
  expect(logs.some((arguments_) => arguments_.includes(RENDERED_TIME))).toBe(false);
});
