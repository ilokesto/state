import {
  batch, createStore, derived, focus, createStoreFamily, memoizeSelector,
  trackedDerived, withLifecycle,
} from '@ilokesto/state';
import type {
  DerivedOptions, SourceValues, WritableFocus, StoreFamily, StoreFamilyOptions,
  MemoizedSelector, MemoizeSelectorOptions, TrackedDerivedOptions,
  DisposableReadableStore, LifecycleScope, LifecycleStart,
} from '@ilokesto/state';
import * as react from '@ilokesto/state/react';
import * as vue from '@ilokesto/state/vue';
import * as angular from '@ilokesto/state/angular';
import * as solid from '@ilokesto/state/solid';
import * as svelte from '@ilokesto/state/svelte';

const source = createStore({ count: 1, label: 'unchanged' });
const selected: WritableFocus<number> = focus(source, value => value.count,
  (value, count) => ({ ...value, count }));
const cacheOptions: MemoizeSelectorOptions<number> = { maxSize: 2 };
const memo: MemoizedSelector<number, number> = memoizeSelector(value => value * 2, cacheOptions);
const options: DerivedOptions<number> = { equalityFn: Object.is };
const doubled: DisposableReadableStore<number> = derived(selected, memo, options);
const trackedOptions: TrackedDerivedOptions<number> = { equalityFn: Object.is };
const tracked = trackedDerived(source, value => value.count, trackedOptions);
const values: SourceValues<readonly [typeof doubled, typeof tracked]> = [2, 1];
const combined = derived([doubled, tracked] as const, ([twice, count]) => ({ twice, count }));
const start: LifecycleStart = (scope: LifecycleScope) => {
  scope.onCleanup(() => undefined);
};
const familyOptions: StoreFamilyOptions<string, DisposableReadableStore<{ twice: number; count: number }>> = {
  onRemove: (_store, key) => { key.toUpperCase(); },
};
const family: StoreFamily<string, DisposableReadableStore<{ twice: number; count: number }>> =
  createStoreFamily((_key: string) => withLifecycle(combined, start), familyOptions);
const view = family.get('counter');

const useReact = react.bindReadonly(view);
const useVue = vue.bindReadonly(view);
const useAngular = angular.bindReadonly(view);
const useSolid = solid.bindReadonly(view);
const useSvelte = svelte.bindReadonly(view);
useReact().twice.toFixed();
useVue().state.value.twice.toFixed();
useAngular().state().twice.toFixed();
useSolid().state().twice.toFixed();
useSvelte.select(value => value.twice).subscribe(value => value.toFixed());
type Assert<T extends true> = T;
export type ReadonlyBinding = Assert<
  Extract<'set' | 'update' | 'setState' | 'writeOnly', keyof typeof useReact> extends never ? true : false
>;
batch(() => selected.set(3));
void values;
family.dispose();
combined.dispose();
tracked.dispose();
doubled.dispose();
selected.dispose();
memo.clear();
