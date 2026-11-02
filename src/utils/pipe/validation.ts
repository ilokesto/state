import { PipeConfigurationError } from './errors.js';
import { getPipeableMiddlewareMetadata } from './metadata.js';
import type { PipeMetadataSnapshot } from './metadata.js';
import { pipeRelationshipKeys } from './types.js';

type MiddlewareEdge = {
  /** Identifier of the middleware that must precede the destination. */
  readonly from: string;
  /** Identifier of the middleware that must follow the source. */
  readonly to: string;
};

function equalIdentifierSets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function equalMetadata(left: PipeMetadataSnapshot, right: PipeMetadataSnapshot): boolean {
  return (
    left.duplicate === right.duplicate &&
    equalIdentifierSets(left.adds, right.adds) &&
    equalIdentifierSets(left.after, right.after) &&
    equalIdentifierSets(left.before, right.before) &&
    equalIdentifierSets(left.conflicts, right.conflicts) &&
    equalIdentifierSets(left.requires, right.requires)
  );
}

function validateConflicts(metadata: readonly PipeMetadataSnapshot[]): void {
  const ids = new Set(metadata.map((item) => item.id));

  for (const item of metadata) {
    for (const conflict of item.conflicts) {
      if (ids.has(conflict)) {
        throw new PipeConfigurationError(
          'MIDDLEWARE_CONFLICT',
          `Pipe middleware ${item.id} conflicts with ${conflict}`,
          { id: item.id, ids: [item.id, conflict] },
        );
      }
    }
  }
}

function readMetadata(chain: readonly object[]): readonly PipeMetadataSnapshot[] {
  const metadata: PipeMetadataSnapshot[] = [];

  for (const middleware of chain) {
    const snapshot = getPipeableMiddlewareMetadata(middleware);
    if (snapshot === undefined) {
      throw new PipeConfigurationError(
        'INVALID_METADATA',
        'Pipe middleware must have registered metadata',
        { id: '', ids: [] },
      );
    }
    metadata.push(snapshot);
  }

  return metadata;
}

function validateDuplicateMetadata(metadata: readonly PipeMetadataSnapshot[]): void {
  const byId = new Map<string, PipeMetadataSnapshot[]>();

  for (const item of metadata) {
    const matches = byId.get(item.id);
    if (matches === undefined) {
      byId.set(item.id, [item]);
    } else {
      matches.push(item);
    }
  }

  for (const [id, matches] of byId) {
    const first = matches[0];
    if (first === undefined || matches.length < 2) {
      continue;
    }
    if (!matches.every((item) => item.duplicate === 'allow')) {
      throw new PipeConfigurationError(
        'DUPLICATE_MIDDLEWARE',
        `Pipe middleware ${id} is duplicated without every occurrence allowing duplicates`,
        { id, ids: [id] },
      );
    }
    if (!matches.every((item) => equalMetadata(first, item))) {
      throw new PipeConfigurationError(
        'DUPLICATE_MIDDLEWARE',
        `Pipe middleware ${id} has conflicting metadata`,
        { id, ids: [id] },
      );
    }
  }
}

function validateCapabilities(metadata: readonly PipeMetadataSnapshot[]): void {
  const available = new Set<string>();

  for (const item of metadata) {
    for (const capabilityId of item.requires) {
      if (!available.has(capabilityId)) {
        throw new PipeConfigurationError(
          'MISSING_CAPABILITY',
          `Pipe middleware ${item.id} requires unavailable capability ${capabilityId}`,
          { id: item.id, ids: [item.id, capabilityId] },
        );
      }
    }

    for (const capabilityId of item.adds) {
      if (available.has(capabilityId)) {
        throw new PipeConfigurationError(
          'DUPLICATE_CAPABILITY',
          `Pipe capability ${capabilityId} is added more than once`,
          { id: capabilityId, ids: [capabilityId] },
        );
      }
      available.add(capabilityId);
    }
  }
}

function createEdges(metadata: readonly PipeMetadataSnapshot[]): readonly MiddlewareEdge[] {
  const ids = new Set(metadata.map((item) => item.id));
  const edges: MiddlewareEdge[] = [];

  for (const item of metadata) {
    for (const relationship of pipeRelationshipKeys) {
      for (const target of item[relationship]) {
        if (ids.has(target)) {
          edges.push(
            relationship === 'before'
              ? { from: item.id, to: target }
              : { from: target, to: item.id },
          );
        }
      }
    }
  }

  return edges;
}

function findCycle(edges: readonly MiddlewareEdge[]): readonly string[] | undefined {
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    const targets = graph.get(edge.from);
    if (targets === undefined) {
      graph.set(edge.from, new Set([edge.to]));
    } else {
      targets.add(edge.to);
    }
  }

  const completed = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  function visit(id: string): readonly string[] | undefined {
    if (visiting.has(id)) {
      return [...path];
    }
    if (completed.has(id)) {
      return undefined;
    }

    visiting.add(id);
    path.push(id);
    for (const target of graph.get(id) ?? []) {
      const cycle = visit(target);
      if (cycle !== undefined) {
        return cycle;
      }
    }
    path.pop();
    visiting.delete(id);
    completed.add(id);
    return undefined;
  }

  for (const id of graph.keys()) {
    const cycle = visit(id);
    if (cycle !== undefined) {
      return cycle;
    }
  }

  return undefined;
}

function validateRelationshipOrder(metadata: readonly PipeMetadataSnapshot[]): void {
  const indexes = new Map<string, number[]>();

  for (const [index, item] of metadata.entries()) {
    const current = indexes.get(item.id);
    if (current === undefined) {
      indexes.set(item.id, [index]);
    } else {
      current.push(index);
    }
  }

  for (const [index, item] of metadata.entries()) {
    for (const relationship of pipeRelationshipKeys) {
      for (const target of item[relationship]) {
        for (const targetIndex of indexes.get(target) ?? []) {
          const isReversed = relationship === 'before'
            ? targetIndex <= index
            : targetIndex >= index;
          if (isReversed) {
            throw new PipeConfigurationError(
              'MIDDLEWARE_ORDER',
              `Pipe middleware ${item.id} must be declared ${relationship} ${target}`,
              { id: item.id, ids: [item.id, target] },
            );
          }
        }
      }
    }
  }
}

/**
 * @description Validates registered middleware metadata and the supplied execution
 * order without modifying or reordering the chain. Checks duplicate middleware
 * policies and metadata consistency, conflicts, capability availability and
 * uniqueness, relationship cycles, and before/after ordering. Required capabilities
 * must be provided by earlier middleware. Relationships to absent middleware are
 * ignored; when an identifier occurs multiple times, every occurrence must satisfy
 * its ordering relationships. An empty chain is valid.
 * @param {readonly object[]} chain - Middleware objects in execution order, each
 * with registered pipe metadata.
 * @throws {PipeConfigurationError} If metadata is missing, duplicates are not
 * permitted or have inconsistent metadata, middleware conflict, capabilities are
 * missing or added repeatedly, or relationships contain a cycle or violate order.
 * @example
 * ```ts
 * import { authenticationMiddleware, auditMiddleware } from './app-middlewares.js';
 *
 * // These application middleware objects already have registered pipe metadata.
 * // Authentication provides the capability required by auditing.
 * validatePipeMiddlewareChain([authenticationMiddleware, auditMiddleware]);
 * ```
 */
export function validatePipeMiddlewareChain(chain: readonly object[]): void {
  const metadata = readMetadata(chain);
  validateDuplicateMetadata(metadata);
  validateConflicts(metadata);
  validateCapabilities(metadata);
  const cycle = findCycle(createEdges(metadata));
  if (cycle !== undefined) {
    throw new PipeConfigurationError(
      'MIDDLEWARE_CYCLE',
      'Pipe middleware relationships contain a cycle',
      { id: cycle[0] ?? '', ids: cycle },
    );
  }
  validateRelationshipOrder(metadata);
}

/**
 * @description Validates the complete chain that would result from appending
 * next, without modifying chain or registering metadata. Revalidates existing
 * middleware as well as the proposed addition, applying the same metadata,
 * duplicate, conflict, capability, cycle, and ordering checks as
 * validatePipeMiddlewareChain.
 * @param {readonly object[]} chain - Existing middleware objects in execution
 * order, each with registered pipe metadata.
 * @param {object} next - Middleware object with registered pipe metadata to
 * validate as the final entry.
 * @throws {PipeConfigurationError} If the resulting chain has missing metadata,
 * invalid duplicates, conflicts, missing or duplicate capabilities, cyclic
 * relationships, or invalid relationship order.
 * @example
 * ```ts
 * import { authenticationMiddleware, auditMiddleware } from './app-middlewares.js';
 *
 * // Both objects already have registered pipe metadata.
 * const chain = [authenticationMiddleware];
 * validatePipeMiddlewareAppend(chain, auditMiddleware);
 * // Validation does not append the object; append only after it succeeds.
 * chain.push(auditMiddleware);
 * ```
 */
export function validatePipeMiddlewareAppend(
  chain: readonly object[],
  next: object,
): void {
  validatePipeMiddlewareChain([...chain, next]);
}
