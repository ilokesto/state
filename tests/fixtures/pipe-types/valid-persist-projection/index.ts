import { jsonStorage, persist } from '../../../../src/middleware';
import type { PersistCodec, PersistStore, ProjectedPersistConfig } from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

type Editor = { count: number; transient: string };
type Saved = { count: number };
const decode = (value: unknown): Saved | null =>
  typeof value === 'object' && value !== null && 'count' in value && typeof value.count === 'number'
    ? { count: value.count } : null;
const storage = jsonStorage(() => localStorage);
const projected = persist({
  key: 'editor', storage, project: (state: Editor) => ({ count: state.count }), decode,
  restore: (saved, current) => ({ ...current, count: saved.count }),
  saveDebounceMs: 100,
});
const store: PersistStore<Editor> = pipe.use(projected).create({ count: 0, transient: 'session' });
const codec: PersistCodec = { serialize: JSON.stringify, deserialize: JSON.parse };
const options = {
  key: 'editor', storage: jsonStorage(() => localStorage, codec),
  project: (state: Editor) => ({ count: state.count }), decode,
  restore: (saved, current) => ({ ...current, count: saved.count }),
} satisfies ProjectedPersistConfig<Editor, Saved>;
const configured: PersistStore<Editor> = pipe.use(persist(options)).create({ count: 0, transient: '' });
const paused: boolean = store.persist.getStatus().paused;
store.persist.pause();
store.persist.resume();
const retried: Promise<void> = store.persist.retry();
void configured;
void paused;
void retried;
