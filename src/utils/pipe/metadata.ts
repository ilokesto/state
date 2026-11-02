import { PipeConfigurationError } from './errors.js';
import type {
  PipeCapability,
  PipeDuplicatePolicy,
  PipeMiddlewareMetadata,
} from './metadata-types.js';
import type { PipeableMiddleware } from './pipeable-types.js';
import type { PipeAnyMiddleware, PipeMiddleware } from './types.js';

/**
 * Immutable, validated metadata captured when a middleware function is registered.
 */
export type PipeMetadataSnapshot = {
  /** IDs of capabilities provided by the middleware, in declaration order. */
  readonly adds: readonly string[];
  /** Middleware IDs that this middleware must run after. */
  readonly after: readonly string[];
  /** Middleware IDs that this middleware must run before. */
  readonly before: readonly string[];
  /** Middleware IDs that cannot coexist with this middleware. */
  readonly conflicts: readonly string[];
  /** Duplicate-registration policy, defaulting to 'reject' when omitted. */
  readonly duplicate: PipeDuplicatePolicy;
  /** Nonblank identifier used to identify the middleware in a pipe. */
  readonly id: string;
  /** IDs of capabilities required by the middleware, in declaration order. */
  readonly requires: readonly string[];
};

export type { PipeableMiddleware } from './pipeable-types.js';

const pipeMiddlewareMetadata = new WeakMap<object, PipeMetadataSnapshot>();
const capturedPipeMiddleware = new WeakMap<object, object>();
const capturedPipeMetadata = new WeakMap<object, PipeMetadataSnapshot>();

function invalidMetadata(message: string, ids: readonly string[]): never {
  throw new PipeConfigurationError('INVALID_METADATA', message, {
    id: ids[0] ?? '',
    ids,
  });
}

function assertIdentifier(id: string, label: string): void {
  if (id.trim().length === 0) {
    invalidMetadata(`Pipe middleware ${label} must not be empty`, []);
  }
}

function snapshotRelationshipIds(
  ids: readonly string[] | undefined,
  middlewareId: string,
): readonly string[] {
  const snapshot: string[] = [];
  const seen = new Set<string>();

  for (const id of ids ?? []) {
    assertIdentifier(id, 'relationship ID');
    if (id === middlewareId) {
      invalidMetadata('Pipe middleware metadata cannot reference itself', [middlewareId]);
    }
    if (seen.has(id)) {
      invalidMetadata('Pipe middleware metadata contains a duplicate relationship ID', [id]);
    }
    seen.add(id);
    snapshot.push(id);
  }

  return Object.freeze(snapshot);
}

function snapshotCapabilityIds(
  capabilities: readonly PipeCapability[] | undefined,
): readonly string[] {
  const snapshot: string[] = [];
  const seen = new Set<string>();

  for (const capability of capabilities ?? []) {
    const capabilityId = capability.id;
    assertIdentifier(capabilityId, 'capability ID');
    if (capability.id !== capabilityId) {
      invalidMetadata('Pipe middleware capability metadata must have a stable ID', [capabilityId, capability.id]);
    }
    if (seen.has(capabilityId)) {
      invalidMetadata('Pipe middleware metadata contains a duplicate capability ID', [capabilityId]);
    }
    seen.add(capabilityId);
    snapshot.push(capabilityId);
  }

  return Object.freeze(snapshot);
}

function createMetadataSnapshot(metadata: PipeMiddlewareMetadata): PipeMetadataSnapshot {
  assertIdentifier(metadata.id, 'ID');

  return Object.freeze({
    adds: snapshotCapabilityIds(metadata.adds),
    after: snapshotRelationshipIds(metadata.after, metadata.id),
    before: snapshotRelationshipIds(metadata.before, metadata.id),
    conflicts: snapshotRelationshipIds(metadata.conflicts, metadata.id),
    duplicate: metadata.duplicate ?? 'reject',
    id: metadata.id,
    requires: snapshotCapabilityIds(metadata.requires),
  });
}

function equalIdentifiers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function metadataMatches(left: PipeMetadataSnapshot, right: PipeMetadataSnapshot): boolean {
  return (
    left.id === right.id &&
    left.duplicate === right.duplicate &&
    equalIdentifiers(left.adds, right.adds) &&
    equalIdentifiers(left.after, right.after) &&
    equalIdentifiers(left.before, right.before) &&
    equalIdentifiers(left.conflicts, right.conflicts) &&
    equalIdentifiers(left.requires, right.requires)
  );
}

/**
 * @description Retrieves the frozen metadata associated with a registered
 * middleware function or a captured middleware entry. Other values, including
 * unregistered objects and functions, return undefined.
 * @param {unknown} value - Middleware function, captured entry, or other value to inspect.
 * @returns {PipeMetadataSnapshot | undefined} Registered metadata, or undefined if none exists.
 * - adds `readonly string[]` - Capability IDs provided by the middleware.
 * - after `readonly string[]` - Middleware IDs that must precede this middleware.
 * - before `readonly string[]` - Middleware IDs that must follow this middleware.
 * - conflicts `readonly string[]` - Middleware IDs incompatible with this middleware.
 * - duplicate `PipeDuplicatePolicy` - Effective duplicate policy, including the default 'reject'.
 * - id `string` - Registered middleware identifier.
 * - requires `readonly string[]` - Capability IDs required by the middleware.
 * @example
 * ```ts
 * const middleware = definePipeableMiddleware(
 *   (store) => store,
 *   { id: '@my-app/logging' },
 * );
 * const metadata = getPipeableMiddlewareMetadata(middleware);
 * console.log(metadata?.id); // '@my-app/logging'
 * console.log(getPipeableMiddlewareMetadata(null)); // undefined
 * ```
 */
export function getPipeableMiddlewareMetadata(value: unknown): PipeMetadataSnapshot | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }

  return capturedPipeMetadata.get(value) ?? pipeMiddlewareMetadata.get(value);
}

/**
 * @description Creates a fresh, frozen opaque entry associated with a registered
 * middleware function and its existing immutable metadata snapshot. Does not
 * invoke the middleware. Throws PipeConfigurationError with code
 * INVALID_METADATA if the argument is not a function or has no registered metadata.
 * @param {object} middleware - Function previously registered with definePipeableMiddleware.
 * @returns {object} A new opaque entry that can be resolved back to the middleware and inspected for metadata.
 * @example
 * ```ts
 * const middleware = definePipeableMiddleware(
 *   (store) => store,
 *   { id: '@my-app/logging' },
 * );
 * const entry = capturePipeableMiddleware(middleware);
 * console.log(getCapturedPipeMiddleware(entry) === middleware); // true
 * console.log(getPipeableMiddlewareMetadata(entry)?.id); // '@my-app/logging'
 * ```
 */
export function capturePipeableMiddleware(middleware: object): object {
  if (typeof middleware !== 'function') {
    invalidMetadata('Pipe middleware must be a function', []);
  }

  const metadata = pipeMiddlewareMetadata.get(middleware);
  if (metadata === undefined) {
    invalidMetadata('Pipe middleware must have registered metadata', []);
  }

  const entry = Object.freeze({});
  capturedPipeMiddleware.set(entry, middleware);
  capturedPipeMetadata.set(entry, metadata);
  return entry;
}

/**
 * @description Resolves an entry created by capturePipeableMiddleware to its
 * original middleware function. Returns an unrecognized object unchanged.
 * @param {object} entry - Captured middleware entry or object to pass through unchanged.
 * @returns {object} The captured middleware function, or entry itself if it is not a captured entry.
 * @example
 * ```ts
 * const middleware = definePipeableMiddleware(
 *   (store) => store,
 *   { id: '@my-app/logging' },
 * );
 * const entry = capturePipeableMiddleware(middleware);
 * console.log(getCapturedPipeMiddleware(entry) === middleware); // true
 *
 * const other = {};
 * console.log(getCapturedPipeMiddleware(other) === other); // true
 * ```
 */
export function getCapturedPipeMiddleware(entry: object): object {
  return capturedPipeMiddleware.get(entry) ?? entry;
}

/**
 * @description Registers an immutable metadata snapshot for a pipe middleware
 * function and returns that same function with its pipeable type information.
 *
 * Every middleware passed to `pipe.use(...)` must be registered with this
 * helper. The metadata declares the middleware's ID, capability requirements,
 * conflicts, and ordering constraints that the pipe builder validates.
 *
 * Registration validates nonblank identifiers, stable capability IDs, duplicate
 * IDs within each list, and self-references in relationship lists. Omitted lists
 * become empty snapshots and the duplicate policy defaults to 'reject'.
 * Registering the same function again is allowed only when the normalized
 * metadata matches, including list order. Invalid metadata, conflicting
 * registration, or a nonfunction middleware throws PipeConfigurationError with
 * code INVALID_METADATA. Metadata is stored externally rather than added as
 * runtime properties to the function.
 *
 * @typedef {PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>} MiddlewareMetadata
 * @typedef {PipeableMiddleware<PipeAnyMiddleware<Requires, Adds>, MiddlewareMetadata> | PipeableMiddleware<PipeMiddleware<State, Requires, Adds>, MiddlewareMetadata>} RegisteredMiddleware
 * @param {PipeAnyMiddleware<Requires, Adds> | PipeMiddleware<State, Requires, Adds>} middleware - Middleware function to register, either state-independent or specialized for State.
 * @param {MiddlewareMetadata} metadata - Middleware identity, capabilities, duplicate policy, and ordering constraints.
 * @param {Adds | undefined} [metadata.adds] - Capabilities provided by the middleware; omitted means none.
 * @param {After | undefined} [metadata.after] - Middleware IDs that this middleware must run after; must be unique and cannot reference its own ID.
 * @param {Before | undefined} [metadata.before] - Middleware IDs that this middleware must run before; must be unique and cannot reference its own ID.
 * @param {Conflicts | undefined} [metadata.conflicts] - Incompatible middleware IDs; must be unique and cannot reference its own ID.
 * @param {Duplicate | undefined} [metadata.duplicate] - Duplicate policy applied by the pipe builder; defaults to 'reject'.
 * @param {Id} metadata.id - Nonblank identifier for this middleware.
 * @param {Requires | undefined} [metadata.requires] - Capabilities required by the middleware; omitted means none.
 * @returns {RegisteredMiddleware} The original function with compile-time pipe metadata and state-compatibility brands.
 * - pipeMiddlewareMetadataBrand `RegisteredMiddleware[typeof pipeMiddlewareMetadataBrand]` - Compile-time metadata brand; not installed as a runtime property.
 * : pipeMiddlewareMetadataBrand.adds `Adds | undefined` - Declared provided capabilities.
 * : pipeMiddlewareMetadataBrand.after `After | undefined` - Declared predecessor IDs.
 * : pipeMiddlewareMetadataBrand.before `Before | undefined` - Declared successor IDs.
 * : pipeMiddlewareMetadataBrand.conflicts `Conflicts` - Conflict IDs retained by the pipeable metadata brand.
 * : pipeMiddlewareMetadataBrand.duplicate `Duplicate | undefined` - Declared duplicate policy.
 * : pipeMiddlewareMetadataBrand.id `Id` - Declared middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `Requires | undefined` - Declared required capabilities.
 * - pipeStateMismatchKindBrand `RegisteredMiddleware[typeof pipeStateMismatchKindBrand]` - Compile-time state-compatibility marker; not installed as a runtime property.
 * @example
 * ```ts
 * import { definePipeableMiddleware } from '@ilokesto/state/utils';
 *
 * const myMiddleware = definePipeableMiddleware(
 *   (store) => store,
 *   { id: '@my-app/middleware' },
 * );
 * ```
 */
export function definePipeableMiddleware<
  const Id extends string,
  const Requires extends readonly PipeCapability[] = readonly [],
  const Adds extends readonly PipeCapability[] = readonly [],
  const Duplicate extends PipeDuplicatePolicy = 'reject',
  const Conflicts extends readonly string[] = readonly string[],
  const Before extends readonly string[] = readonly string[],
  const After extends readonly string[] = readonly string[],
>(
  middleware: PipeAnyMiddleware<Requires, Adds>,
  metadata: PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>,
): PipeableMiddleware<
  PipeAnyMiddleware<Requires, Adds>,
  PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>
>;
/**
 * @description Registers an immutable metadata snapshot for a pipe middleware
 * function and returns that same function with its pipeable type information.
 *
 * Every middleware passed to `pipe.use(...)` must be registered with this
 * helper. The metadata declares the middleware's ID, capability requirements,
 * conflicts, and ordering constraints that the pipe builder validates.
 *
 * Registration validates nonblank identifiers, stable capability IDs, duplicate
 * IDs within each list, and self-references in relationship lists. Omitted lists
 * become empty snapshots and the duplicate policy defaults to 'reject'.
 * Registering the same function again is allowed only when the normalized
 * metadata matches, including list order. Invalid metadata, conflicting
 * registration, or a nonfunction middleware throws PipeConfigurationError with
 * code INVALID_METADATA. Metadata is stored externally rather than added as
 * runtime properties to the function.
 *
 * @typedef {PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>} MiddlewareMetadata
 * @typedef {PipeableMiddleware<PipeAnyMiddleware<Requires, Adds>, MiddlewareMetadata> | PipeableMiddleware<PipeMiddleware<State, Requires, Adds>, MiddlewareMetadata>} RegisteredMiddleware
 * @param {PipeAnyMiddleware<Requires, Adds> | PipeMiddleware<State, Requires, Adds>} middleware - Middleware function to register, either state-independent or specialized for State.
 * @param {MiddlewareMetadata} metadata - Middleware identity, capabilities, duplicate policy, and ordering constraints.
 * @param {Adds | undefined} [metadata.adds] - Capabilities provided by the middleware; omitted means none.
 * @param {After | undefined} [metadata.after] - Middleware IDs that this middleware must run after; must be unique and cannot reference its own ID.
 * @param {Before | undefined} [metadata.before] - Middleware IDs that this middleware must run before; must be unique and cannot reference its own ID.
 * @param {Conflicts | undefined} [metadata.conflicts] - Incompatible middleware IDs; must be unique and cannot reference its own ID.
 * @param {Duplicate | undefined} [metadata.duplicate] - Duplicate policy applied by the pipe builder; defaults to 'reject'.
 * @param {Id} metadata.id - Nonblank identifier for this middleware.
 * @param {Requires | undefined} [metadata.requires] - Capabilities required by the middleware; omitted means none.
 * @returns {RegisteredMiddleware} The original function with compile-time pipe metadata and state-compatibility brands.
 * - pipeMiddlewareMetadataBrand `RegisteredMiddleware[typeof pipeMiddlewareMetadataBrand]` - Compile-time metadata brand; not installed as a runtime property.
 * : pipeMiddlewareMetadataBrand.adds `Adds | undefined` - Declared provided capabilities.
 * : pipeMiddlewareMetadataBrand.after `After | undefined` - Declared predecessor IDs.
 * : pipeMiddlewareMetadataBrand.before `Before | undefined` - Declared successor IDs.
 * : pipeMiddlewareMetadataBrand.conflicts `Conflicts` - Conflict IDs retained by the pipeable metadata brand.
 * : pipeMiddlewareMetadataBrand.duplicate `Duplicate | undefined` - Declared duplicate policy.
 * : pipeMiddlewareMetadataBrand.id `Id` - Declared middleware identifier.
 * : pipeMiddlewareMetadataBrand.requires `Requires | undefined` - Declared required capabilities.
 * - pipeStateMismatchKindBrand `RegisteredMiddleware[typeof pipeStateMismatchKindBrand]` - Compile-time state-compatibility marker; not installed as a runtime property.
 * @example
 * ```ts
 * import { definePipeableMiddleware } from '@ilokesto/state/utils';
 *
 * const myMiddleware = definePipeableMiddleware(
 *   (store) => store,
 *   { id: '@my-app/middleware' },
 * );
 * ```
 */
export function definePipeableMiddleware<
  State,
  const Id extends string,
  const Requires extends readonly PipeCapability[] = readonly [],
  const Adds extends readonly PipeCapability[] = readonly [],
  const Duplicate extends PipeDuplicatePolicy = 'reject',
  const Conflicts extends readonly string[] = readonly string[],
  const Before extends readonly string[] = readonly string[],
  const After extends readonly string[] = readonly string[],
>(
  middleware: PipeMiddleware<State, Requires, Adds>,
  metadata: PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>,
): PipeableMiddleware<
  PipeMiddleware<State, Requires, Adds>,
  PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts, Before, After>
>;
export function definePipeableMiddleware(
  middleware: object,
  metadata: PipeMiddlewareMetadata,
): object {
  if (typeof middleware !== 'function') {
    invalidMetadata('Pipe middleware must be a function', []);
  }

  const snapshot = createMetadataSnapshot(metadata);
  const registered = pipeMiddlewareMetadata.get(middleware);
  if (registered !== undefined) {
    if (!metadataMatches(registered, snapshot)) {
      invalidMetadata('Pipe middleware cannot be registered with conflicting metadata', [
        registered.id,
        snapshot.id,
      ]);
    }
    return middleware;
  }

  pipeMiddlewareMetadata.set(middleware, snapshot);
  return middleware;
}
