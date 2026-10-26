export type EntityState<Entity extends object, Id extends string | number> = {
  readonly ids: readonly Id[];
  readonly entities: ReadonlyMap<Id, Entity>;
};

export type EntityAdapterOptions<Entity extends object, Id extends string | number> = {
  readonly selectId: (entity: Entity) => Id;
  readonly sortComparer?: (left: Entity, right: Entity) => number;
};

/**
 * Pure collection operations for use inside store.update or a reducer.
 * Map keys preserve the distinction between numeric and string identifiers.
 */
export function createEntityAdapter<Entity extends object, Id extends string | number>(
  options: EntityAdapterOptions<Entity, Id>,
) {
  type State = EntityState<Entity, Id>;

  const selectId = (entity: Entity): Id => {
    const id = options.selectId(entity);
    if (typeof id === 'number' && !Number.isFinite(id)) {
      throw new TypeError('Entity identifiers must be strings or finite numbers');
    }
    return id;
  };

  const finish = (state: State, entities: ReadonlyMap<Id, Entity>): State => {
    const entries = Array.from(entities.entries());
    const compare = options.sortComparer;
    if (compare) {
      entries.sort((left, right) => compare(left[1], right[1]));
    }
    const unchanged = entries.length === state.ids.length &&
      entries.every(([id, entity], index) =>
        id === state.ids[index] &&
        state.entities.has(id) &&
        Object.is(entity, state.entities.get(id)),
      );
    if (unchanged) {
      return state;
    }
    return { ids: entries.map(([id]) => id), entities: new Map(entries) };
  };

  const writeMany = (state: State, values: readonly Entity[], replace: boolean): State => {
    const entities = new Map(state.entities);
    for (const entity of values) {
      const id = selectId(entity);
      if (replace || !entities.has(id)) {
        entities.set(id, entity);
      }
    }
    return finish(state, entities);
  };

  const setAll = (state: State, values: readonly Entity[]): State =>
    finish(state, new Map(values.map((entity) => [selectId(entity), entity])));

  const removeMany = (state: State, ids: readonly Id[]): State => {
    const entities = new Map(state.entities);
    for (const id of ids) {
      entities.delete(id);
    }
    return finish(state, entities);
  };

  const updateMany = (
    state: State,
    updates: readonly { readonly id: Id; readonly update: (entity: Entity) => Entity }[],
  ): State => {
    const entities = new Map(state.entities);
    for (const { id, update } of updates) {
      const previous = entities.get(id);
      if (previous === undefined) {
        continue;
      }
      const next = update(previous);
      if (selectId(next) !== id) {
        throw new TypeError('Entity updates must preserve the identifier; remove and add to change it');
      }
      entities.set(id, next);
    }
    return finish(state, entities);
  };

  return {
    getInitialState: (values: readonly Entity[] = []): State =>
      setAll({ ids: [], entities: new Map<Id, Entity>() }, values),
    setAll,
    addOne: (state: State, entity: Entity): State => writeMany(state, [entity], false),
    addMany: (state: State, values: readonly Entity[]): State => writeMany(state, values, false),
    upsertOne: (state: State, entity: Entity): State => writeMany(state, [entity], true),
    upsertMany: (state: State, values: readonly Entity[]): State => writeMany(state, values, true),
    updateOne: (state: State, id: Id, update: (entity: Entity) => Entity): State =>
      updateMany(state, [{ id, update }]),
    updateMany,
    removeOne: (state: State, id: Id): State => removeMany(state, [id]),
    removeMany,
    removeAll: (state: State): State => finish(state, new Map<Id, Entity>()),
    selectIds: (state: State): readonly Id[] => state.ids,
    selectById: (state: State, id: Id): Entity | undefined => state.entities.get(id),
    selectAll: (state: State): readonly Entity[] => Array.from(state.entities.values()),
    selectTotal: (state: State): number => state.ids.length,
  };
}
