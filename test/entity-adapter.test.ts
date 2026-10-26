import { expect, test } from 'bun:test';
import { createStore } from '../src/index';
import { createEntityAdapter } from '../src/utils/index';

type Book = {
  readonly id: string;
  readonly title: string;
};

const books = createEntityAdapter({
  selectId: (book: Book) => book.id,
  sortComparer: (left: Book, right: Book) => left.title.localeCompare(right.title),
});

test('entity addMany: duplicate IDs -> preserves existing entities and sorts additions', () => {
  const first: Book = { id: 'b', title: 'Beta' };
  const initial = books.getInitialState([first]);

  const next = books.addMany(initial, [
    { id: 'b', title: 'Replaced' },
    { id: 'a', title: 'Alpha' },
  ]);

  expect(next.ids).toEqual(['a', 'b']);
  expect(books.selectById(next, 'b')).toBe(first);
  expect(initial.ids).toEqual(['b']);
  expect(initial.entities.size).toBe(1);
});

test('entity upsertMany: repeated ID -> last value wins without duplicating ID', () => {
  const initial = books.getInitialState();
  const latest: Book = { id: 'a', title: 'Latest' };

  const next = books.upsertMany(initial, [{ id: 'a', title: 'First' }, latest]);

  expect(next.ids).toEqual(['a']);
  expect(books.selectById(next, 'a')).toBe(latest);
});

test('entity updateOne: changed sort field -> reorders without mutating the previous state', () => {
  const initial = books.getInitialState([
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
  ]);

  const next = books.updateOne(initial, 'a', (book) => ({ ...book, title: 'Zeta' }));

  expect(next.ids).toEqual(['b', 'a']);
  expect(books.selectById(initial, 'a')?.title).toBe('Alpha');
});

test('entity updateOne: changed ID -> rejects rather than leaving inconsistent indexes', () => {
  const initial = books.getInitialState([{ id: 'a', title: 'Alpha' }]);

  expect(() => books.updateOne(initial, 'a', (book) => ({ ...book, id: 'b' })))
    .toThrow(TypeError);
  expect(initial.ids).toEqual(['a']);
});

test('entity no-op operations: unchanged input -> preserves snapshot identity', () => {
  const book: Book = { id: 'a', title: 'Alpha' };
  const initial = books.getInitialState([book]);

  const outcomes = [
    books.addOne(initial, book),
    books.upsertOne(initial, book),
    books.updateOne(initial, 'a', (value) => value),
    books.updateOne(initial, 'missing', (value) => value),
    books.removeOne(initial, 'missing'),
    books.setAll(initial, [book]),
  ];

  for (const outcome of outcomes) {
    expect(outcome).toBe(initial);
  }
});

test('entity removeMany: repeated and missing IDs -> removes only existing values immutably', () => {
  const initial = books.getInitialState([
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
  ]);

  const next = books.removeMany(initial, ['a', 'a', 'missing']);

  expect(next.ids).toEqual(['b']);
  expect(books.selectTotal(next)).toBe(1);
  expect(books.selectById(next, 'a')).toBeUndefined();
  expect(books.selectTotal(initial)).toBe(2);
});

test('entity store integration: no-op then real update -> notifies only for real state change', () => {
  const book: Book = { id: 'a', title: 'Alpha' };
  const store = createStore(books.getInitialState([book]));
  const selected: number[] = [];
  const unsubscribe = store.subscribeSelector(books.selectTotal, (count) => selected.push(count));

  store.update((state) => books.addOne(state, book));
  store.update((state) => books.addOne(state, { id: 'b', title: 'Beta' }));
  unsubscribe();

  expect(selected).toEqual([2]);
  expect(books.selectAll(store.getState()).map((value) => value.title)).toEqual(['Alpha', 'Beta']);
});

test('entity IDs: number and string keys -> remain distinct without prototype collisions', () => {
  const adapter = createEntityAdapter({ selectId: (item: { readonly id: string | number }) => item.id });

  const state = adapter.getInitialState([{ id: 1 }, { id: '1' }, { id: '__proto__' }]);

  expect(adapter.selectTotal(state)).toBe(3);
  expect(adapter.selectById(state, 1)).toEqual({ id: 1 });
  expect(adapter.selectById(state, '1')).toEqual({ id: '1' });
  expect(adapter.selectById(state, '__proto__')).toEqual({ id: '__proto__' });
});

test('entity updateMany: later updater rejects -> leaves the input collection untouched', () => {
  const initial = books.getInitialState([
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
  ]);

  expect(() => books.updateMany(initial, [
    { id: 'a', update: (book) => ({ ...book, title: 'Changed' }) },
    { id: 'b', update: () => { throw new RangeError('Rejected'); } },
  ])).toThrow(RangeError);
  expect(books.selectAll(initial).map((book) => book.title)).toEqual(['Alpha', 'Beta']);
});

test('entity removeAll: populated then empty collection -> clears once and retains empty identity', () => {
  const initial = books.getInitialState([{ id: 'a', title: 'Alpha' }]);

  const empty = books.removeAll(initial);

  expect(books.selectTotal(empty)).toBe(0);
  expect(books.selectIds(empty)).toEqual([]);
  expect(empty.entities.size).toBe(0);
  expect(books.removeAll(empty)).toBe(empty);
});

test('entity IDs: non-finite number -> rejects before changing the input', () => {
  const adapter = createEntityAdapter({ selectId: (item: { readonly id: number }) => item.id });
  const initial = adapter.getInitialState();

  expect(() => adapter.addOne(initial, { id: Number.NaN })).toThrow(TypeError);
  expect(() => adapter.addOne(initial, { id: Infinity })).toThrow(TypeError);
  expect(adapter.selectTotal(initial)).toBe(0);
});

test('entity setAll: duplicate IDs with equal sort keys -> uses final values and stable ordering', () => {
  const initial = books.getInitialState([{ id: 'old', title: 'Old' }]);
  const finalBook: Book = { id: 'a', title: 'Same' };

  const next = books.setAll(initial, [
    { id: 'a', title: 'Earlier' },
    { id: 'b', title: 'Same' },
    finalBook,
  ]);

  expect(books.selectIds(next)).toEqual(['a', 'b']);
  expect(books.selectAll(next)).toEqual([finalBook, { id: 'b', title: 'Same' }]);
  expect(books.selectById(next, 'old')).toBeUndefined();
});
