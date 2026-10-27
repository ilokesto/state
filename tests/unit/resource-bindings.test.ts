import { expect, test } from 'bun:test';
import { createResource } from '@ilokesto/state';
import { bindResource as react } from '@ilokesto/state/react';
import { bindResource as vue } from '@ilokesto/state/vue';
import { bindResource as solid } from '@ilokesto/state/solid';
import { bindResource as svelte } from '@ilokesto/state/svelte';
import { bindResource as angular } from '@ilokesto/state/angular';

for (const [framework, bindResource] of Object.entries({ react, vue, solid, svelte, angular })) {
  test(`bindResource ${framework}: explicit run -> preserves outcomes and exposes readonly snapshots`, async () => {
    const deferred = Promise.withResolvers<number>();
    const resource = createResource((input: number) => input === 1 ? deferred.promise : input);
    const binding = bindResource(resource);
    expect(binding.readOnly()).toEqual({ status: 'idle' });
    expect('setState' in binding).toBe(false);
    expect('dispose' in binding).toBe(false);
    expect('cancel' in binding).toBe(false);

    const outcome = binding.run(1);
    expect(binding.readOnly()).toEqual({ status: 'pending' });
    deferred.resolve(7);

    expect(await outcome).toEqual({ status: 'success', data: 7 });
    expect(binding.readOnly(state => state.status)).toBe('success');
    expect(await binding.run(2)).toEqual({ status: 'success', data: 2 });
  });

  test(`bindResource ${framework}: external abort and disposal -> retain resource cancellation semantics`, async () => {
    const deferred = Promise.withResolvers<number>();
    const resource = createResource(() => deferred.promise);
    const binding = bindResource(resource);
    const controller = new AbortController();
    const outcome = binding.run(undefined, { signal: controller.signal });

    controller.abort('external');

    expect(await outcome).toEqual({ status: 'cancelled', reason: 'external' });
    expect(binding.readOnly()).toEqual({ status: 'idle' });
    resource.dispose();
    expect((await binding.run()).status).toBe('cancelled');
    deferred.resolve(9);
    await deferred.promise;
    expect(binding.readOnly()).toEqual({ status: 'idle' });
  });
}
