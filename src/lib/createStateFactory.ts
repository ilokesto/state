import { createStore, type ReadableStore, type Store, type StoreApi } from '@ilokesto/store';

export type StateFactoryOptions<State, Instance extends StoreApi<State>> = {
  /** Validate domain fields; throw on invalid input and preserve canonical decoded data. */
  readonly decode: (input: unknown) => State;
  /** Construct a fresh store without changing its supplied initial state. */
  readonly create: (initialState: State) => Instance;
};

export type StateFactory<State, Instance extends StoreApi<State>> = {
  /** Validate and decode JSON-compatible input, then construct a fresh store from a cloned initial state. */
  create(input: unknown): Instance;
  /** Validate a version-one transfer envelope and construct a fresh store, rejecting decoder changes to its state. */
  hydrate(serialized: string): Instance;
  /** Transfer the initial snapshot, not subsequent writes or persistence state. */
  serialize(store: ReadableStore<State>): string;
};

const maxLength = 1_000_000;
const maxDepth = 64;

function serializeJson(value: unknown): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function validate(candidate: unknown, depth: number): void {
    nodes++;
    if (depth > maxDepth || nodes > 100_000) {
      throw new TypeError('State transfer exceeds its structural limit');
    }
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') {
      return;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate) && !Object.is(candidate, -0)) {
      return;
    }
    if (typeof candidate !== 'object') {
      throw new TypeError('State transfer requires JSON values');
    }
    if (ancestors.has(candidate)) {
      throw new TypeError('State transfer cannot contain cycles');
    }
    const isArray = Array.isArray(candidate);
    const prototype: unknown = Object.getPrototypeOf(candidate);
    if (prototype !== (isArray ? Array.prototype : Object.prototype) && !(prototype === null && !isArray)) {
      throw new TypeError('State transfer requires plain objects or arrays');
    }
    ancestors.add(candidate);
    const keys = Reflect.ownKeys(candidate);
    if (isArray && keys.length !== candidate.length + 1) {
      throw new TypeError('State transfer requires dense arrays without extra properties');
    }
    for (const key of keys) {
      if (isArray && key === 'length') {
        continue;
      }
      if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw new TypeError('State transfer contains an unsupported property');
      }
      if (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= candidate.length)) {
        throw new TypeError('State transfer requires array indices');
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('State transfer requires enumerable data properties');
      }
      validate(descriptor.value, depth + 1);
    }
    ancestors.delete(candidate);
  }
  validate(value, 0);
  const serialized = JSON.stringify(value);
  if (serialized.length > maxLength) {
    throw new TypeError('State transfer exceeds its length limit');
  }
  return serialized;
}

function parseJson(serialized: string): unknown {
  if (typeof serialized !== 'string' || serialized.length > maxLength) {
    throw new TypeError('State transfer requires a bounded JSON string');
  }
  const parsed: unknown = JSON.parse(serialized);
  serializeJson(parsed);
  return parsed;
}

/**
 * @description Define stateless construction and transfer once; create a fresh
 * store per request. Without a custom constructor, use createStore.
 *
 * Only plain JSON data is transferred. The decoder runs on server input and client
 * payloads; framework hydration and persistence rehydration remain separate.
 * Input is validated and JSON-cloned before decoding; decoded state is validated
 * and cloned again before construction so cached decoder objects cannot leak
 * between requests. Custom constructors must preserve the supplied initial state;
 * returning a store previously constructed by this factory throws.
 *
 * Transfers reject cycles, non-plain objects, unsupported properties, sparse
 * arrays, non-finite numbers and negative zero. Validation limits depth to 64,
 * visited values to 100,000 and JSON strings to 1,000,000 UTF-16 code units.
 * Hydration requires an envelope containing exactly version: 1 and state, and
 * rejects decoding that changes the serialized transferred state. Serialization
 * escapes HTML-sensitive characters and Unicode line separators, then checks
 * the length limit again. Validation, JSON parsing and decoder errors propagate.
 *
 * @param {StateFactoryOptions<State, Instance> | { readonly decode: (input: unknown) => State }} options - Decoder configuration, with a custom constructor in the custom-store overload.
 * @param {(input: unknown) => State} options.decode - Validate domain fields, throw on invalid input and return canonical JSON-compatible state; hydration requires its serialized representation to remain unchanged.
 * @param {(initialState: State) => Instance} options.create - Construct a fresh store without changing the supplied initial state; provided only in the custom-store overload.
 * @returns {StateFactory<State, Instance> | StateFactory<State, Store<State>>} Stateless construction and transfer operations for custom stores or default stores.
 * - create `(input: unknown) => Instance | Store<State>` - Validate and decode input, clone the decoded initial state and construct a fresh store.
 * - hydrate `(serialized: string) => Instance | Store<State>` - Parse and validate a version-one envelope, require the decoder to preserve its serialized state and construct a fresh store.
 * - serialize `(store: ReadableStore<State>) => string` - Encode the store's initial snapshot in an escaped version-one JSON envelope, excluding subsequent writes and persistence state.
 * @example
 * ```ts
 * const counterFactory = createStateFactory({
 *   decode(input: unknown): number {
 *     if (typeof input !== 'number' || !Number.isSafeInteger(input)) {
 *       throw new TypeError('Expected a safe integer counter');
 *     }
 *     return input;
 *   },
 * });
 *
 * const serverStore = counterFactory.create(3);
 * const payload = counterFactory.serialize(serverStore);
 * // payload is '{"version":1,"state":3}'
 * const clientStore = counterFactory.hydrate(payload);
 * // clientStore is a fresh store whose initial state is 3.
 * ```
 */
export function createStateFactory<State, Instance extends StoreApi<State>>(
  options: StateFactoryOptions<State, Instance>,
): StateFactory<State, Instance>;
/**
 * @description Define stateless construction and transfer once; create a fresh
 * store per request. Without a custom constructor, use createStore.
 *
 * Only plain JSON data is transferred. The decoder runs on server input and client
 * payloads; framework hydration and persistence rehydration remain separate.
 * Input is validated and JSON-cloned before decoding; decoded state is validated
 * and cloned again before construction so cached decoder objects cannot leak
 * between requests. Custom constructors must preserve the supplied initial state;
 * returning a store previously constructed by this factory throws.
 *
 * Transfers reject cycles, non-plain objects, unsupported properties, sparse
 * arrays, non-finite numbers and negative zero. Validation limits depth to 64,
 * visited values to 100,000 and JSON strings to 1,000,000 UTF-16 code units.
 * Hydration requires an envelope containing exactly version: 1 and state, and
 * rejects decoding that changes the serialized transferred state. Serialization
 * escapes HTML-sensitive characters and Unicode line separators, then checks
 * the length limit again. Validation, JSON parsing and decoder errors propagate.
 *
 * @param {StateFactoryOptions<State, Instance> | { readonly decode: (input: unknown) => State }} options - Decoder configuration, with a custom constructor in the custom-store overload.
 * @param {(input: unknown) => State} options.decode - Validate domain fields, throw on invalid input and return canonical JSON-compatible state; hydration requires its serialized representation to remain unchanged.
 * @param {(initialState: State) => Instance} options.create - Construct a fresh store without changing the supplied initial state; provided only in the custom-store overload.
 * @returns {StateFactory<State, Instance> | StateFactory<State, Store<State>>} Stateless construction and transfer operations for custom stores or default stores.
 * - create `(input: unknown) => Instance | Store<State>` - Validate and decode input, clone the decoded initial state and construct a fresh store.
 * - hydrate `(serialized: string) => Instance | Store<State>` - Parse and validate a version-one envelope, require the decoder to preserve its serialized state and construct a fresh store.
 * - serialize `(store: ReadableStore<State>) => string` - Encode the store's initial snapshot in an escaped version-one JSON envelope, excluding subsequent writes and persistence state.
 * @example
 * ```ts
 * const counterFactory = createStateFactory({
 *   decode(input: unknown): number {
 *     if (typeof input !== 'number' || !Number.isSafeInteger(input)) {
 *       throw new TypeError('Expected a safe integer counter');
 *     }
 *     return input;
 *   },
 * });
 *
 * const serverStore = counterFactory.create(3);
 * const payload = counterFactory.serialize(serverStore);
 * // payload is '{"version":1,"state":3}'
 * const clientStore = counterFactory.hydrate(payload);
 * // clientStore is a fresh store whose initial state is 3.
 * ```
 */
export function createStateFactory<State>(
  options: { readonly decode: (input: unknown) => State },
): StateFactory<State, Store<State>>;
export function createStateFactory<State, Instance extends StoreApi<State>>(
  options: { readonly decode: (input: unknown) => State; readonly create?: (initialState: State) => Instance },
): StateFactory<State, Store<State> | Instance> {
  const instances = new WeakSet<object>();
  function construct(input: unknown, transferredState?: string): Store<State> | Instance {
    const decoded = options.decode(parseJson(serializeJson(input)));
    const serialized = serializeJson(decoded);
    if (transferredState !== undefined && serialized !== transferredState) {
      throw new TypeError('State decoder must preserve the transferred initial state');
    }
    // Clone validated JSON so a decoder's cached object cannot leak between requests.
    const initialState = JSON.parse(serialized) as State;
    const store = options.create ? options.create(initialState) : createStore(initialState);
    if (instances.has(store)) {
      throw new Error('State factory must return a fresh store');
    }
    instances.add(store);
    return store;
  }
  return {
    create: input => construct(input),
    hydrate(serialized) {
      const envelope = parseJson(serialized);
      if (
        typeof envelope !== 'object' || envelope === null || Array.isArray(envelope) ||
        !('version' in envelope) || envelope.version !== 1 ||
        !('state' in envelope) || Object.keys(envelope).length !== 2
      ) {
        throw new TypeError('Invalid state transfer envelope');
      }
      return construct(envelope.state, serializeJson(envelope.state));
    },
    serialize(store) {
      const serialized = serializeJson({ version: 1, state: store.getInitialState() });
      const escaped = serialized.replace(/[<>&\u2028\u2029]/g, (character) =>
        '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
      );
      if (escaped.length > maxLength) {
        throw new TypeError('State transfer exceeds its length limit');
      }
      return escaped;
    },
  };
}
