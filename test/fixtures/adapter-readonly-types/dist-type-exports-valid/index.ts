import {
  create,
  type UseReducer,
  type UseState,
} from '@ilokesto/state/react';

type CounterState = {
  count: number;
};

type CounterAction = {
  amount: number;
  type: 'increment';
};

const useCounter: UseState<CounterState> = create({ count: 0 });
const [count, setCounter] = useCounter((state) => state.count);
count.toFixed();
setCounter((state) => ({ count: state.count + 1 }));

const useReducer: UseReducer<CounterState, CounterAction> = create(
  (state, action) => ({ count: state.count + action.amount }),
  { count: 0 },
);
const [reducerCount, dispatch] = useReducer((state) => state.count);
reducerCount.toFixed();
dispatch({ amount: 1, type: 'increment' });
