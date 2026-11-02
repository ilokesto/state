import type { PipeMiddlewareMetadata, PipeRelationshipKey } from './metadata-types.js';
import type { PipeDiagnostic, PipeValidationDetail } from './validation-diagnostic-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

/**
 * A middleware-order diagnostic carrying the validation details for the current
 * chain and the next middleware.
 */
export type PipeMiddlewareOrderDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeDiagnostic<
  '__pipeMiddlewareOrderError',
  PipeValidationDetail<Current, Next>
>;

/**
 * A relationship-cycle diagnostic carrying the validation details for the
 * current chain and the next middleware.
 */
export type PipeMiddlewareCycleDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeDiagnostic<
  '__pipeMiddlewareCycleError',
  PipeValidationDetail<Current, Next>
>;

/** Extracts the identifier type from middleware metadata. */
type PipeMetadataId<Metadata extends PipeMiddlewareMetadata> = Metadata['id'];

/** Collects the union of middleware identifier types in a chain. */
type PipeMetadataIds<Chain extends PipeMetadataChain> = PipeMetadataId<Chain[number]>;

/**
 * Extracts literal identifier types from the selected relationship array.
 * Returns `never` when its element type includes unrestricted `string`, so
 * unknown identifiers do not create speculative ordering edges.
 */
type PipeRelationshipIds<
  Metadata extends PipeMiddlewareMetadata,
  Key extends PipeRelationshipKey,
> = Extract<Metadata[Key], readonly string[]> extends infer Relationships extends readonly string[]
  ? string extends Relationships[number]
    ? never
    : Relationships[number]
  : never;

/**
 * Filters a metadata union to members whose identifier type is assignable to
 * the requested identifier type.
 */
type PipeMetadataWithIdFromUnion<
  Metadata extends PipeMiddlewareMetadata,
  Id extends string,
> = Metadata extends PipeMiddlewareMetadata
  ? Metadata['id'] extends Id
    ? Metadata
    : never
  : never;

/** Selects chain metadata whose identifier type matches the requested type. */
type PipeMetadataWithId<
  Chain extends PipeMetadataChain,
  Id extends string,
> = PipeMetadataWithIdFromUnion<Chain[number], Id>;

/**
 * Collects identifiers of metadata members whose `after` relationships include
 * the target identifier.
 */
type PipeAfterDependents<
  Metadata extends PipeMiddlewareMetadata,
  Target extends string,
> = Metadata extends PipeMiddlewareMetadata
  ? Target extends PipeRelationshipIds<Metadata, 'after'>
    ? PipeMetadataId<Metadata>
    : never
  : never;

/**
 * Finds identifiers that must follow the given middleware: its explicit
 * `before` targets and middleware declaring `after` it. Only identifiers
 * present in the chain are retained.
 */
type PipeOutgoingIds<Chain extends PipeMetadataChain, Id extends string> = Extract<
  | PipeRelationshipIds<PipeMetadataWithId<Chain, Id>, 'before'>
  | PipeAfterDependents<Chain[number], Id>,
  PipeMetadataIds<Chain>
>;

/**
 * Traverses each target independently, reporting `true` for a target already
 * on the current path or for a cycle reachable through that target.
 */
type PipeCycleFromTargets<
  Chain extends PipeMetadataChain,
  Targets extends string,
  Seen extends readonly string[],
> = Targets extends string
  ? Targets extends Seen[number]
    ? true
    : PipeHasCycleFrom<Chain, Targets, [...Seen, Targets]>
  : false;

/**
 * Reports whether any outgoing relationship from the current identifier leads
 * to an identifier already on the traversal path.
 */
type PipeHasCycleFrom<
  Chain extends PipeMetadataChain,
  Id extends string,
  Seen extends readonly string[],
> = true extends PipeCycleFromTargets<Chain, PipeOutgoingIds<Chain, Id>, Seen>
  ? true
  : false;

/**
 * Starts a separate cycle traversal for each identifier, initially marking
 * that identifier as visited.
 */
type PipeHasCycleForId<Chain extends PipeMetadataChain, Id extends string> = Id extends string
  ? PipeHasCycleFrom<Chain, Id, [Id]>
  : never;

/**
 * Resolves to `true` when the chain's known `before` and `after` relationships
 * contain a directed cycle, including a self-reference; otherwise resolves to
 * `false`. Relationships to identifiers outside the chain are ignored.
 */
export type PipeHasCycle<Chain extends PipeMetadataChain> = true extends PipeHasCycleForId<
  Chain,
  PipeMetadataIds<Chain>
>
  ? true
  : false;

/**
 * Reports whether the current middleware declares that it must precede an
 * identifier already present in the processed prefix.
 */
type PipeHasReversedBefore<
  Metadata extends PipeMiddlewareMetadata,
  Previous extends PipeMetadataChain,
> = [Extract<PipeRelationshipIds<Metadata, 'before'>, PipeMetadataIds<Previous>>] extends [never]
  ? false
  : true;

/**
 * Reports whether middleware in the processed prefix declares that it must
 * follow the current middleware.
 */
type PipeHasReversedAfter<
  Metadata extends PipeMiddlewareMetadata,
  Previous extends PipeMetadataChain,
> = [PipeAfterDependents<Previous[number], PipeMetadataId<Metadata>>] extends [never]
  ? false
  : true;

/**
 * Scans a metadata tuple in order and resolves to `true` if a known `before`
 * or `after` relationship contradicts that order; otherwise resolves to
 * `false`. `Previous` supplies an already-processed prefix and defaults to an
 * empty tuple. Relationships to absent identifiers do not cause an error.
 */
export type PipeHasOrderProblem<
  Chain extends PipeMetadataChain,
  Previous extends PipeMetadataChain = readonly [],
> = Chain extends readonly [
  infer First extends PipeMiddlewareMetadata,
  ...infer Rest extends PipeMetadataChain,
]
  ? PipeHasReversedBefore<First, Previous> extends true
    ? true
    : PipeHasReversedAfter<First, Previous> extends true
      ? true
      : PipeHasOrderProblem<Rest, [...Previous, First]>
  : false;
