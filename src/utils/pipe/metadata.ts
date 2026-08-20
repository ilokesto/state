import { PipeConfigurationError } from './errors.js';
import type {
  PipeCapability,
  PipeDuplicatePolicy,
  PipeMiddlewareMetadata,
} from './metadata-types.js';
import type { PipeableMiddleware } from './pipeable-types.js';
import type { PipeAnyMiddleware, PipeMiddleware } from './types.js';

export type PipeMetadataSnapshot = {
  readonly adds: readonly string[];
  readonly after: readonly string[];
  readonly before: readonly string[];
  readonly conflicts: readonly string[];
  readonly duplicate: PipeDuplicatePolicy;
  readonly id: string;
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

export function getPipeableMiddlewareMetadata(value: unknown): PipeMetadataSnapshot | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return undefined;
  }

  return capturedPipeMetadata.get(value) ?? pipeMiddlewareMetadata.get(value);
}

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

export function getCapturedPipeMiddleware(entry: object): object {
  return capturedPipeMiddleware.get(entry) ?? entry;
}

export function definePipeableMiddleware<
  const Id extends string,
  const Requires extends readonly PipeCapability[] = readonly [],
  const Adds extends readonly PipeCapability[] = readonly [],
  const Duplicate extends PipeDuplicatePolicy = 'reject',
  const Conflicts extends readonly string[] = readonly string[],
>(
  middleware: PipeAnyMiddleware<Requires, Adds>,
  metadata: PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts>,
): PipeableMiddleware<
  PipeAnyMiddleware<Requires, Adds>,
  PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts>
>;
export function definePipeableMiddleware<
  State,
  const Id extends string,
  const Requires extends readonly PipeCapability[] = readonly [],
  const Adds extends readonly PipeCapability[] = readonly [],
  const Duplicate extends PipeDuplicatePolicy = 'reject',
  const Conflicts extends readonly string[] = readonly string[],
>(
  middleware: PipeMiddleware<State, Requires, Adds>,
  metadata: PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts>,
): PipeableMiddleware<
  PipeMiddleware<State, Requires, Adds>,
  PipeMiddlewareMetadata<Id, Requires, Adds, Duplicate, Conflicts>
>;
/**
 * Register metadata on a pipe middleware function.
 *
 * Every middleware passed to `pipe.use(...)` must be registered with this
 * helper. The metadata declares the middleware's ID, capability requirements,
 * conflicts, and ordering constraints that the pipe builder validates.
 *
 * @param middleware - The middleware function to tag.
 * @param metadata - Pipe metadata describing ID, capabilities, conflicts, and ordering.
 * @returns The same middleware function, now tagged with metadata.
 *
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
