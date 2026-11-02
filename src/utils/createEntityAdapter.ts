export type EntityState<Entity extends object, Id extends string | number> = {
  /** Entity identifiers in collection order, sorted when a comparer is configured. */
  readonly ids: readonly Id[];
  /** Entities keyed by identifier; iteration follows the same order as ids. */
  readonly entities: ReadonlyMap<Id, Entity>;
};

export type EntityAdapterOptions<Entity extends object, Id extends string | number> = {
  /** Extracts a string or finite numeric identifier from an entity. */
  readonly selectId: (entity: Entity) => Id;
  /** Orders entities after writes; without it, Map insertion order is preserved. */
  readonly sortComparer?: (left: Entity, right: Entity) => number;
};

/**
 * @description Creates pure collection operations for use inside store.update or a reducer.
 * Map keys preserve the distinction between numeric and string identifiers.
 * Operations do not mutate the supplied state or clone entity objects. Writes return
 * the original state when identifier order and entity references are unchanged.
 * Without a comparer, writes preserve Map insertion order; with one, writes sort
 * entities using that comparer. Duplicate identifiers in replacement or upsert input
 * use the last entity; add operations retain the first entity already present.
 * @param {EntityAdapterOptions<Entity, Id>} options - Identifier extraction and optional ordering.
 * @param {(entity: Entity) => Id} options.selectId - Extracts an identifier. Writes
 * throw TypeError if this returns a non-finite number.
 * @param {(left: Entity, right: Entity) => number} [options.sortComparer] - Comparison
 * function used to order entities after writes.
 * @returns {ReturnType<typeof createEntityAdapter<Entity, Id>>} Collection operations and selectors.
 * - getInitialState `(values?: readonly Entity[]) => EntityState<Entity, Id>` - Creates a state from optional entities, defaulting to an empty collection.
 * - setAll `(state: EntityState<Entity, Id>, values: readonly Entity[]) => EntityState<Entity, Id>` - Replaces the entire collection with the supplied entities.
 * - addOne `(state: EntityState<Entity, Id>, entity: Entity) => EntityState<Entity, Id>` - Adds an entity only when its identifier is absent.
 * - addMany `(state: EntityState<Entity, Id>, values: readonly Entity[]) => EntityState<Entity, Id>` - Adds entities without replacing existing identifiers.
 * - upsertOne `(state: EntityState<Entity, Id>, entity: Entity) => EntityState<Entity, Id>` - Adds or replaces an entire entity, without merging fields.
 * - upsertMany `(state: EntityState<Entity, Id>, values: readonly Entity[]) => EntityState<Entity, Id>` - Adds or replaces entire entities in input order.
 * - updateOne `(state: EntityState<Entity, Id>, id: Id, update: (entity: Entity) => Entity) => EntityState<Entity, Id>` - Transforms an existing entity, ignoring a missing identifier; throws TypeError if the transformation changes its identifier.
 * - updateMany `(state: EntityState<Entity, Id>, updates: readonly { readonly id: Id; readonly update: (entity: Entity) => Entity }[]) => EntityState<Entity, Id>` - Applies transformations sequentially, skipping missing identifiers and rejecting identifier changes with TypeError.
 * - removeOne `(state: EntityState<Entity, Id>, id: Id) => EntityState<Entity, Id>` - Removes an entity if present.
 * - removeMany `(state: EntityState<Entity, Id>, ids: readonly Id[]) => EntityState<Entity, Id>` - Removes the specified identifiers, ignoring absent ones.
 * - removeAll `(state: EntityState<Entity, Id>) => EntityState<Entity, Id>` - Clears the collection, preserving the state reference if already empty.
 * - selectIds `(state: EntityState<Entity, Id>) => readonly Id[]` - Returns the state's ordered identifier array without copying it.
 * - selectById `(state: EntityState<Entity, Id>, id: Id) => Entity | undefined` - Returns the matching entity, or undefined if absent.
 * - selectAll `(state: EntityState<Entity, Id>) => readonly Entity[]` - Creates an array of entities in collection order.
 * - selectTotal `(state: EntityState<Entity, Id>) => number` - Returns the number of identifiers.
 * @example
 * ```ts
 * type Task = { id: number; title: string; done: boolean };
 * const tasks = createEntityAdapter<Task, number>({
 *   selectId: task => task.id,
 *   sortComparer: (left, right) => left.title.localeCompare(right.title),
 * });
 * let state = tasks.getInitialState([
 *   { id: 1, title: 'Write release notes', done: false },
 * ]);
 * state = tasks.addOne(state, { id: 2, title: 'Run tests', done: false });
 * state = tasks.updateOne(state, 1, task => ({ ...task, done: true }));
 * tasks.selectIds(state); // [2, 1]
 * tasks.selectById(state, 1)?.done; // true
 * tasks.selectTotal(state); // 2
 * ```
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
    updates: readonly {
      /** Identifier of the entity to transform; missing identifiers are skipped. */
      readonly id: Id;
      /** Returns the replacement entity, preserving its identifier and not mutating the input. */
      readonly update: (entity: Entity) => Entity
    }[],
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
