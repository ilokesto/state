import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { Store } from '@ilokesto/store';
import { debounce, dispose, throttle } from '../src/middleware';
import { pipe } from '../src/utils/pipe';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

for (const kind of ['fixed debounce', 'quiet debounce', 'trailing throttle'] as const) {
  for (const flushInside of [false, true]) {
    test(`${kind}: trailing updater dispatches and flushInside=${flushInside} -> preserves nested work after the detached batch`, () => {
      const store = kind === 'trailing throttle'
        ? throttle(10, { trailing: true })(new Store(0))
        : debounce(10, { leading: true, mode: kind === 'quiet debounce' ? 'quiet' : 'fixed' })(new Store(0));
      const controls = 'debounce' in store ? store.debounce : store.throttle;
      const seen: number[] = [];
      store.subscribe(() => seen.push(store.getState()));
      store.set(1);
      store.update(value => {
        store.update(next => next + 10);
        if (flushInside) controls.flush();
        return value + 1;
      });

      controls.flush();

      expect(store.getState()).toBe(2);
      expect(controls.pending()).toBeTrue();
      controls.flush();
      expect(store.getState()).toBe(12);
      expect(seen).toEqual([1, 2, 12]);
      expect(controls.pending()).toBeFalse();
      dispose(store);
    });
  }
}

test('debounce: fixed and quiet windows receive another call -> only quiet restarts the deadline', () => {
  const fixed = debounce(10)(new Store(0));
  const quiet = debounce(10, { mode: 'quiet' })(new Store(0));

  fixed.set(1);
  quiet.set(1);
  jest.advanceTimersByTime(9);
  fixed.set(2);
  quiet.set(2);
  jest.advanceTimersByTime(1);

  expect(fixed.getState()).toBe(2);
  expect(fixed.debounce.pending()).toBeFalse();
  expect(quiet.getState()).toBe(0);
  expect(quiet.debounce.pending()).toBeTrue();
  jest.advanceTimersByTime(9);
  expect(quiet.getState()).toBe(2);
});

for (const kind of ['debounce', 'throttle'] as const) {
  const make = () => kind === 'debounce'
    ? debounce(10)(new Store(0))
    : throttle(10, { leading: false, trailing: true })(new Store(0));
  const controls = (store: ReturnType<typeof make>) =>
    'debounce' in store ? store.debounce : store.throttle;

  test(`${kind}: flush after mixed values and updaters -> preserves ordered accumulation once`, () => {
    const store = make();
    const timer = controls(store);
    const observed: number[] = [];
    store.subscribe(() => observed.push(store.getState()));

    store.setState(3);
    store.update((value) => value + 2);
    store.setState(10);
    store.update((value) => value * 2);
    timer.flush();
    timer.flush();
    jest.advanceTimersByTime(10);

    expect(store.getState()).toBe(20);
    expect(observed).toEqual([20]);
    expect(timer.pending()).toBeFalse();
  });

  test(`${kind}: cancel queued updater -> never evaluates it and next window starts fresh`, () => {
    const store = make();
    const timer = controls(store);
    let calls = 0;
    store.update(() => { calls += 1; return 1; });

    timer.cancel();
    timer.flush();
    jest.advanceTimersByTime(10);

    expect(calls).toBe(0);
    expect(timer.pending()).toBeFalse();
    store.set(2);
    timer.flush();
    expect(store.getState()).toBe(2);
  });

  test(`${kind}: flushing updater schedules another update -> new work survives detached batch`, () => {
    const store = make();
    const timer = controls(store);
    store.update((value) => {
      store.update((next) => next + 10);
      return value + 1;
    });

    timer.flush();

    expect(store.getState()).toBe(1);
    expect(timer.pending()).toBeTrue();
    jest.advanceTimersByTime(10);
    expect(store.getState()).toBe(11);
  });

  test(`${kind}: flushing updater disposes and reuses store -> old result cannot commit`, () => {
    const store = make();
    const timer = controls(store);
    store.update(() => {
      dispose(store);
      store.set(7);
      return 99;
    });

    timer.flush();

    expect(store.getState()).toBe(0);
    expect(timer.pending()).toBeTrue();
    jest.advanceTimersByTime(10);
    expect(store.getState()).toBe(7);
  });

  test(`${kind}: updater cancels its own batch -> remaining updaters and old result are discarded`, () => {
    const store = make();
    const timer = controls(store);
    let laterCalls = 0;
    store.update(() => { timer.cancel(); return 1; });
    store.update(() => { laterCalls += 1; return 2; });

    timer.flush();

    expect(store.getState()).toBe(0);
    expect(laterCalls).toBe(0);
    expect(timer.pending()).toBeFalse();
  });

  test(`${kind}: updater throws during flush -> error surfaces and reentrant work survives`, () => {
    const store = make();
    const timer = controls(store);
    const failure = new Error('updater');
    store.update(() => { store.set(8); throw failure; });

    expect(() => timer.flush()).toThrow(failure);

    expect(store.getState()).toBe(0);
    expect(timer.pending()).toBeTrue();
    timer.flush();
    expect(store.getState()).toBe(8);
  });

  test(`${kind}: subscriber throws during flush -> committed value remains and future work is schedulable`, () => {
    const store = make();
    const timer = controls(store);
    const stop = store.subscribe(() => { throw new Error('subscriber'); });
    store.set(1);

    expect(() => timer.flush()).toThrow(AggregateError);

    expect(store.getState()).toBe(1);
    expect(timer.pending()).toBeFalse();
    stop();
    store.set(2);
    timer.flush();
    expect(store.getState()).toBe(2);
  });

  test(`${kind}: disposal cancels pending callbacks -> no old update commits and store remains reusable`, () => {
    const store = make();
    const timer = controls(store);
    store.set(1);

    dispose(store);
    jest.advanceTimersByTime(10);
    timer.flush();

    expect(store.getState()).toBe(0);
    expect(timer.pending()).toBeFalse();
    store.set(2);
    jest.advanceTimersByTime(10);
    expect(store.getState()).toBe(2);
  });

  test(`${kind}: leading and trailing enabled -> first commits once and later updates accumulate`, () => {
    const store = kind === 'debounce'
      ? debounce(10, { leading: true })(new Store(0))
      : throttle(10, { trailing: true })(new Store(0));
    const timer = controls(store);
    const commits: number[] = [];
    store.subscribe(() => commits.push(store.getState()));

    store.update((value) => value + 1);
    expect(timer.pending()).toBeFalse();
    store.update((value) => value + 2);
    store.update((value) => value + 3);
    expect(timer.pending()).toBeTrue();
    jest.advanceTimersByTime(10);

    expect(commits).toEqual([1, 6]);
    store.set(7);
    jest.advanceTimersByTime(10);
    expect(commits).toEqual([1, 6, 7]);
  });

  test(`${kind}: leading subscriber writes reentrantly -> trailing work is retained in the open window`, () => {
    const store = kind === 'debounce'
      ? debounce(10, { leading: true })(new Store(0))
      : throttle(10, { trailing: true })(new Store(0));
    store.subscribe(() => { if (store.getState() === 1) store.set(2); });

    store.set(1);

    expect(store.getState()).toBe(1);
    expect(controls(store).pending()).toBeTrue();
    jest.advanceTimersByTime(10);
    expect(store.getState()).toBe(2);
  });
}

test('debounce: quiet leading-only window -> later calls extend cooldown without evaluating dropped updaters', () => {
  const store = debounce(10, { mode: 'quiet', leading: true, trailing: false })(new Store(0));
  let calls = 0;

  store.set(1);
  jest.advanceTimersByTime(9);
  store.update(() => { calls += 1; return 2; });
  jest.advanceTimersByTime(9);
  expect(store.getState()).toBe(1);
  expect(store.debounce.pending()).toBeFalse();
  jest.advanceTimersByTime(1);
  store.set(3);

  expect(calls).toBe(0);
  expect(store.getState()).toBe(3);
});

test('throttle: leading-only cooldown is flushed -> pending stays false and a new leading update passes', () => {
  const store = throttle(10)(new Store(0));
  store.set(1);

  store.throttle.flush();
  store.set(2);

  expect(store.getState()).toBe(2);
  expect(store.throttle.pending()).toBeFalse();
});

for (const kind of ['debounce', 'throttle'] as const) {
  test(`${kind}: leading updater throws -> keeps cooldown until cancel and later writes recover`, () => {
    const store = kind === 'debounce'
      ? debounce(10, { leading: true, trailing: false })(new Store(0))
      : throttle(10)(new Store(0));
    const controls = 'debounce' in store ? store.debounce : store.throttle;
    const failure = new Error('leading updater');

    expect(() => store.update(() => { throw failure; })).toThrow(failure);
    store.set(1);

    expect(store.getState()).toBe(0);
    expect(controls.pending()).toBeFalse();
    controls.cancel();
    store.set(2);
    expect(store.getState()).toBe(2);
  });
}

test('throttle: downstream middleware drops leading update -> updater is never evaluated', () => {
  const store = throttle(10)(new Store(0));
  let calls = 0;
  store.pushMiddleware(() => undefined);

  store.update(() => { calls += 1; return 1; });

  expect(calls).toBe(0);
  expect(store.getState()).toBe(0);
});

test('timers: function-valued state returned from updaters -> commits the function without calling it', () => {
  const initial = () => 0;
  const replacement = () => 7;
  const store = pipe.use(debounce(10)).create(initial);

  store.set(replacement);
  store.debounce.flush();

  expect(store.getState()).toBe(replacement);
});

test('timers: both edges disabled or unknown mode -> rejects configuration before scheduling', () => {
  expect(() => debounce(10, { leading: false, trailing: false })).toThrow(TypeError);
  expect(() => throttle(10, { leading: false, trailing: false })).toThrow(TypeError);
  expect(() => Reflect.apply(debounce, undefined, [10, { mode: 'unknown' }])).toThrow(TypeError);
  expect(jest.getTimerCount()).toBe(0);
});

test('timers: control collision -> rejects setup without overwriting existing properties', () => {
  for (const factory of [debounce, throttle]) {
    const store = new Store(0);
    Object.defineProperty(store, factory.name, { value: 'existing' });

    expect(() => factory()(store)).toThrow(TypeError);

    expect(Reflect.get(store, factory.name)).toBe('existing');
    store.set(1);
    expect(store.getState()).toBe(1);
  }
});
