import { Store, createReducer, pipe } from '@ilokesto/state';
import { history } from '@ilokesto/state/middleware';
import { bindReducer } from '@ilokesto/state/react';

type Action = { readonly type: 'add'; readonly amount: number };
const reduce = (value: number, action: Action): number => value + action.amount;

class ExtendedStore extends Store<number> {
  reset(): void {
    this.set(0);
  }
}

const extended = createReducer(reduce, new ExtendedStore(0));
extended.store.reset();
bindReducer(extended).writeOnly()({ type: 'add', amount: 1 });

const undoable = pipe.use(history()).create({ count: 0 });
const counter = createReducer(
  (value: { count: number }, action: Action) => ({ count: value.count + action.amount }),
  undoable,
);
counter.store.undo();
counter.store.redo();
counter.store.clearHistory();
const canUndo: boolean = counter.store.canUndo();
void canUndo;
