import { createReducer, createStore } from '@ilokesto/state';
import { bind } from '@ilokesto/state/svelte';

const counter = createStore({ count: 0 });
const counterView = bind(counter);
const unsubscribe = counterView.select(state => state.count).subscribe(count => {
  console.log('count:', count);
});

counter.update(state => ({ count: state.count + 1 }));
counter.set({ count: 5 });
unsubscribe();

const total = createReducer((state, action) => state + action.amount, 0);
total.dispatch({ type: 'add', amount: 3 });
console.log('reduced:', total.store.getState());
