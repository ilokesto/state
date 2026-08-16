import { Store } from '@ilokesto/store';

export type CounterState = Readonly<{
  count: number;
  label: string;
}>;

export type CounterAction =
  | Readonly<{ type: 'increment' }>
  | Readonly<{ type: 'rename'; label: string }>;

type Selector<State, Selection> = (state: Readonly<State>) => Selection;
type SelectorListener<Selection> = (
  nextSelection: Selection,
  previousSelection: Selection,
) => void;
type EqualityFn<Selection> = (
  previousSelection: Selection,
  nextSelection: Selection,
) => boolean;

export class TrackingStore<State> extends Store<State> {
  activeSelectorSubscriptions = 0;
  selectorNotifications = 0;

  override subscribeSelector<Selection>(
    selector: Selector<State, Selection>,
    listener: SelectorListener<Selection>,
    equalityFn: EqualityFn<Selection> = Object.is,
  ): () => void {
    this.activeSelectorSubscriptions += 1;
    const unsubscribe = super.subscribeSelector(
      selector,
      (nextSelection, previousSelection) => {
        this.selectorNotifications += 1;
        listener(nextSelection, previousSelection);
      },
      equalityFn,
    );

    return () => {
      this.activeSelectorSubscriptions -= 1;
      unsubscribe();
    };
  }
}

export const initialState: CounterState = {
  count: 1,
  label: 'initial',
};

export const counterReducer = (
  state: CounterState,
  action: CounterAction,
): CounterState => {
  switch (action.type) {
    case 'increment':
      return { ...state, count: state.count + 1 };
    case 'rename':
      return { ...state, label: action.label };
  }
};
