import { expect, spyOn, test } from 'bun:test';
import { createResource } from '@ilokesto/state';
import type { ResourceResult } from '@ilokesto/state';

test('createResource: deferred success -> exposes read-only idle, pending and success snapshots', async () => {
  const deferred = Promise.withResolvers<number>();
  const resource = createResource((input: number, { signal }) => {
    expect(input).toBe(3);
    expect(signal.aborted).toBe(false);
    return deferred.promise;
  });
  const statuses: string[] = [];
  const stop = resource.store.subscribeSelector(state => state.status, status => statuses.push(status));
  expect(resource.store.getState()).toEqual({ status: 'idle' });
  expect('set' in resource.store).toBe(false);

  const result = resource.run(3);
  expect(resource.store.getState()).toEqual({ status: 'pending' });
  deferred.resolve(7);

  expect(await result).toEqual({ status: 'success', data: 7 });
  expect(resource.store.getState()).toEqual({ status: 'success', data: 7 });
  expect(resource.store.getInitialState()).toEqual({ status: 'idle' });
  expect(statuses).toEqual(['pending', 'success']);
  stop();
});

for (const rejects of [false, true]) {
  test(`resource.run: ${rejects ? 'async rejection' : 'sync throw'} -> returns error and can recover`, async () => {
    const failure = new Error('failed');
    const resource = createResource((fail: boolean) => {
      if (fail) {
        if (rejects) {
          return Promise.reject(failure);
        }
        throw failure;
      }
      return 2;
    });

    const result = await resource.run(true);

    expect(result).toEqual({ status: 'error', error: failure });
    expect(resource.store.getState()).toEqual({ status: 'error', error: failure });
    expect(await resource.run(false)).toEqual({ status: 'success', data: 2 });
  });
}

for (const rejects of [false, true]) {
  test(`resource.run: superseded task ${rejects ? 'rejects' : 'resolves'} late -> latest result survives`, async () => {
    const first = Promise.withResolvers<number>();
    const second = Promise.withResolvers<number>();
    const signals: AbortSignal[] = [];
    const resource = createResource((input: number, { signal }) => {
      signals.push(signal);
      return input === 1 ? first.promise : second.promise;
    });
    const older = resource.run(1);

    const newer = resource.run(2);
    second.resolve(2);
    expect(await newer).toEqual({ status: 'success', data: 2 });
    if (rejects) {
      first.reject(new Error('stale'));
      await first.promise.catch(error => expect(error.message).toBe('stale'));
    } else {
      first.resolve(1);
      await first.promise;
    }

    expect((await older).status).toBe('cancelled');
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(resource.store.getState()).toEqual({ status: 'success', data: 2 });
  });
}

test('resource.cancel: uncooperative task -> immediately settles cancellation and remains reusable', async () => {
  const deferred = Promise.withResolvers<number>();
  let signal: AbortSignal | undefined;
  const resource = createResource((input: number, context) => {
    signal = context.signal;
    return input === 1 ? deferred.promise : input;
  });
  const result = resource.run(1);

  resource.cancel('manual');

  expect(await result).toEqual({ status: 'cancelled', reason: 'manual' });
  expect(signal?.aborted).toBe(true);
  expect(signal?.reason).toBe('manual');
  expect(resource.store.getState()).toEqual({ status: 'idle' });
  expect(await resource.run(2)).toEqual({ status: 'success', data: 2 });
  deferred.resolve(1);
  await deferred.promise;
  expect(resource.store.getState()).toEqual({ status: 'success', data: 2 });
});

test('resource.run: external abort -> cancels pending work without waiting for its promise', async () => {
  const controller = new AbortController();
  const deferred = Promise.withResolvers<number>();
  const resource = createResource(() => deferred.promise);
  const result = resource.run(undefined, { signal: controller.signal });

  controller.abort('external');

  expect(await result).toEqual({ status: 'cancelled', reason: 'external' });
  expect(resource.store.getState()).toEqual({ status: 'idle' });
  deferred.reject(new Error('ignored cancellation'));
  await deferred.promise.catch(error => expect(error.message).toBe('ignored cancellation'));
  expect(resource.store.getState()).toEqual({ status: 'idle' });
});

test('resource.run: already aborted signal -> does not start or supersede work', async () => {
  const deferred = Promise.withResolvers<number>();
  let calls = 0;
  const resource = createResource(() => {
    calls += 1;
    return deferred.promise;
  });
  const current = resource.run();

  const skipped = await resource.run(undefined, { signal: AbortSignal.abort('skip') });

  expect(skipped).toEqual({ status: 'cancelled', reason: 'skip' });
  expect(calls).toBe(1);
  expect(resource.store.getState()).toEqual({ status: 'pending' });
  deferred.resolve(1);
  expect(await current).toEqual({ status: 'success', data: 1 });
});

test('resource.dispose: pending work -> cancels permanently and ignores late completion', async () => {
  const deferred = Promise.withResolvers<number>();
  let calls = 0;
  const resource = createResource(() => {
    calls += 1;
    return deferred.promise;
  });
  const result = resource.run();

  resource.dispose();
  resource.dispose();
  deferred.resolve(5);
  await deferred.promise;

  expect((await result).status).toBe('cancelled');
  expect((await resource.run()).status).toBe('cancelled');
  expect(calls).toBe(1);
  expect(resource.store.getState()).toEqual({ status: 'idle' });
});

test('resource.cancel: abort callback starts another run -> never resets the replacement', async () => {
  const first = Promise.withResolvers<number>();
  const second = Promise.withResolvers<number>();
  let replacement: Promise<ResourceResult<number>> | undefined;
  const resource = createResource((input: number, { signal }) => {
    if (input === 1) {
      signal.addEventListener('abort', () => { replacement = resource.run(2); }, { once: true });
      return first.promise;
    }
    return second.promise;
  });
  const original = resource.run(1);

  resource.cancel();

  expect(resource.store.getState()).toEqual({ status: 'pending' });
  second.resolve(2);
  expect(await replacement).toEqual({ status: 'success', data: 2 });
  first.resolve(1);
  await first.promise;
  expect((await original).status).toBe('cancelled');
  expect(resource.store.getState()).toEqual({ status: 'success', data: 2 });
});

test('resource.run: supersession abort callback starts a newer run -> skips obsolete task invocation', async () => {
  const deferred = Promise.withResolvers<number>();
  const calls: number[] = [];
  let latest: Promise<ResourceResult<number>> | undefined;
  const resource = createResource((input: number, { signal }) => {
    calls.push(input);
    if (input === 1) {
      signal.addEventListener('abort', () => { latest = resource.run(3); }, { once: true });
      return deferred.promise;
    }
    return input;
  });
  const first = resource.run(1);

  const superseded = resource.run(2);

  expect(await latest).toEqual({ status: 'success', data: 3 });
  expect((await superseded).status).toBe('cancelled');
  expect((await first).status).toBe('cancelled');
  expect(calls).toEqual([1, 3]);
  deferred.resolve(1);
  await deferred.promise;
});

for (const operation of ['cancel', 'dispose'] as const) {
  test(`resource.run: pending subscriber calls ${operation} -> never invokes cancelled task`, async () => {
    let calls = 0;
    const resource = createResource(() => ++calls);
    resource.store.subscribe(() => {
      if (resource.store.getState().status === 'pending') {
        resource[operation]();
      }
    });

    const result = await resource.run();

    expect(result.status).toBe('cancelled');
    expect(calls).toBe(0);
    expect(resource.store.getState()).toEqual({ status: 'idle' });
  });
}

test('resource.run: task reentrantly cancels before returning rejected promise -> observes late rejection', async () => {
  const failure = new Error('late task error');
  const rejected = Promise.withResolvers<number>();
  const resource = createResource(() => {
    resource.cancel('inside task');
    return rejected.promise;
  });

  const result = resource.run();
  rejected.reject(failure);
  await rejected.promise.catch(error => expect(error).toBe(failure));

  expect(await result).toEqual({ status: 'cancelled', reason: 'inside task' });
  expect(resource.store.getState()).toEqual({ status: 'idle' });
});

test('resource.run: completion subscriber starts a replacement -> preserves both settled result and new state', async () => {
  const deferred = Promise.withResolvers<number>();
  let replacement: Promise<ResourceResult<number>> | undefined;
  const resource = createResource((input: number) => input === 1 ? 1 : deferred.promise);
  resource.store.subscribe(() => {
    if (resource.store.getState().status === 'success') {
      replacement = resource.run(2);
    }
  });

  const original = await resource.run(1);

  expect(original).toEqual({ status: 'success', data: 1 });
  expect(resource.store.getState()).toEqual({ status: 'pending' });
  resource.dispose();
  expect((await replacement)?.status).toBe('cancelled');
  deferred.resolve(2);
  await deferred.promise;
});

test('resource.run: completed external signal aborts later -> cannot cancel a subsequent run', async () => {
  const controller = new AbortController();
  const deferred = Promise.withResolvers<number>();
  const resource = createResource((input: number) => input === 1 ? 1 : deferred.promise);
  await resource.run(1, { signal: controller.signal });
  const next = resource.run(2);

  controller.abort();

  expect(resource.store.getState()).toEqual({ status: 'pending' });
  deferred.resolve(2);
  expect(await next).toEqual({ status: 'success', data: 2 });
});

test('resource.run: success observer throws -> returns notification error without reverting committed state', async () => {
  const resource = createResource(() => 1);
  const failure = new Error('observer');
  resource.store.subscribe(() => {
    if (resource.store.getState().status === 'success') {
      throw failure;
    }
  });

  const result = await resource.run();

  expect(result.status).toBe('error');
  if (result.status === 'error') {
    expect(result.error).toBeInstanceOf(AggregateError);
    expect((result.error as AggregateError).errors).toEqual([failure]);
  }
  expect(resource.store.getState()).toEqual({ status: 'success', data: 1 });
});

for (const terminal of ['success', 'error', 'cancel', 'dispose', 'replace'] as const) {
  test(`resource.run: ${terminal} -> removes the exact external abort listener once`, async () => {
    const controller = new AbortController();
    const added = spyOn(controller.signal, 'addEventListener');
    const removed = spyOn(controller.signal, 'removeEventListener');
    const deferred = Promise.withResolvers<number>();
    const resource = createResource(() => deferred.promise);
    const result = resource.run(undefined, { signal: controller.signal });

    if (terminal === 'success') {
      deferred.resolve(1);
    } else if (terminal === 'error') {
      deferred.reject(new Error('failed'));
    } else if (terminal === 'replace') {
      void resource.run();
    } else {
      resource[terminal]();
    }
    await result;

    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(removed.mock.calls[0]).toEqual(['abort', added.mock.calls[0][1]]);
    resource.dispose();
    deferred.resolve(1);
    await deferred.promise.catch(error => expect(error).toBeInstanceOf(Error));
    added.mockRestore();
    removed.mockRestore();
  });
}
