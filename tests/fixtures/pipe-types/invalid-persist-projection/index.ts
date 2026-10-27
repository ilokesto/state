import { jsonStorage, persist } from '../../../../src/middleware';
import { pipe } from '../../../../src/utils/pipe';

type Editor = { count: number; transient: string };
const storage = jsonStorage(() => localStorage);
const project = (state: Editor) => ({ count: state.count });
const decode = (_value: unknown): { count: number } | null => ({ count: 1 });

persist({ key: 'missing-restore', storage, project, decode });
persist({
  key: 'wrong-decoder', storage, project,
  decode: (_value: unknown): string | null => 'invalid',
  restore: (_saved: { count: number }, current: Editor) => current,
});
persist({
  key: 'incomplete-restore', storage, project, decode,
  restore: saved => ({ count: saved.count }),
});
const middleware = persist({
  key: 'wrong-store', storage, project, decode,
  restore: (saved, current) => ({ ...current, count: saved.count }),
});
pipe.use(middleware).create({ count: 0 });
