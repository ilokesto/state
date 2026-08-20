import { Store } from '@ilokesto/store';

import { PipeConfigurationError } from './errors.js';
import {
  capturePipeableMiddleware,
  getCapturedPipeMiddleware,
  getPipeableMiddlewareMetadata,
} from './metadata.js';
import type {
  Pipe,
  PipeBuilder,
  PipeCapability,
  PipeMiddlewareMetadata,
} from './types.js';
import { validatePipeMiddlewareAppend, validatePipeMiddlewareChain } from './validation.js';

function applyMiddleware(middleware: object, store: Store<unknown>): Store<unknown> {
  const callable = getCapturedPipeMiddleware(middleware);
  if (typeof callable !== 'function') {
    throw new PipeConfigurationError(
      'INVALID_METADATA',
      'Pipe middleware must have registered metadata',
      { id: '', ids: [] },
    );
  }

  const result: unknown = Reflect.apply(callable, undefined, [store]);
  if (!(result instanceof Store)) {
    const metadata = getPipeableMiddlewareMetadata(middleware);
    throw new PipeConfigurationError(
      'INVALID_MIDDLEWARE_RESULT',
      'Pipe middleware must return a Store',
      { id: metadata?.id ?? '', ids: metadata === undefined ? [] : [metadata.id] },
    );
  }

  return result;
}

function createBuilderUse<
  State,
  Capabilities extends readonly PipeCapability[],
  MetadataChain extends readonly PipeMiddlewareMetadata[],
  StateMismatchKind extends 'pipe' | 'persist-decoder',
>(chain: readonly object[]): PipeBuilder<State, Capabilities, MetadataChain, StateMismatchKind>['use'];
function createBuilderUse(chain: readonly object[]): unknown {
  return (middleware: object) => {
    const captured = capturePipeableMiddleware(middleware);
    validatePipeMiddlewareAppend(chain, captured);
    return createPipeBuilder([...chain, captured]);
  };
}

function createBuilderCreate<
  State,
  Capabilities extends readonly PipeCapability[],
  StateMismatchKind extends 'pipe' | 'persist-decoder',
>(chain: readonly object[]): PipeBuilder<State, Capabilities, readonly [], StateMismatchKind>['create'];
function createBuilderCreate(chain: readonly object[]): unknown {
  return (initialState: unknown) => {
    if (initialState instanceof Store) {
      throw new PipeConfigurationError(
        'INVALID_STORE_INPUT',
        'Pipe builder create accepts plain state, not a Store',
        { id: '', ids: [] },
      );
    }

    validatePipeMiddlewareChain(chain);
    let store = new Store(initialState);
    for (const middleware of chain) {
      store = applyMiddleware(middleware, store);
    }

    return store;
  };
}

export function createPipeBuilder<
  State = unknown,
  Capabilities extends readonly PipeCapability[] = readonly [],
  MetadataChain extends readonly PipeMiddlewareMetadata[] = readonly [],
  StateMismatchKind extends 'pipe' | 'persist-decoder' = 'pipe',
>(chain: readonly object[] = []): PipeBuilder<State, Capabilities, MetadataChain, StateMismatchKind> {
  const snapshot = Object.freeze([...chain]);
  const builder: PipeBuilder<State, Capabilities, MetadataChain, StateMismatchKind> = {
    use: createBuilderUse<State, Capabilities, MetadataChain, StateMismatchKind>(snapshot),
    create: createBuilderCreate<State, Capabilities, StateMismatchKind>(snapshot),
  };

  return Object.freeze(builder);
}

function createRootUse(): Pipe['use'];
function createRootUse(): unknown {
  return (middleware: object) => {
    const captured = capturePipeableMiddleware(middleware);
    validatePipeMiddlewareAppend([], captured);
    return createPipeBuilder([captured]);
  };
}

/**
 * Create a pipe builder for composing middleware into a store.
 *
 * Start with `pipe.use(...)`, chain more `.use(...)` calls in outer-to-inner
 * order, then call `.create(initialState)` to materialize the store.
 *
 * @example
 * ```ts
 * import { logger, persist } from '@ilokesto/state/middleware';
 * import { pipe } from '@ilokesto/state/utils';
 *
 * const store = pipe
 *   .use(logger())
 *   .use(persist({ local: 'key', decode: (v) => v as State | null }))
 *   .create({ count: 0 });
 * ```
 */
export const pipe: Pipe = Object.freeze({ use: createRootUse() });
