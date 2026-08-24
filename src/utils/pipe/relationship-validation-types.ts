import type { PipeMiddlewareMetadata, PipeRelationshipKey } from './metadata-types.js';
import type { PipeDiagnostic, PipeValidationDetail } from './validation-diagnostic-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

export type PipeMiddlewareOrderDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeDiagnostic<
  '__pipeMiddlewareOrderError',
  PipeValidationDetail<Current, Next>
>;

export type PipeMiddlewareCycleDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeDiagnostic<
  '__pipeMiddlewareCycleError',
  PipeValidationDetail<Current, Next>
>;

type PipeMetadataId<Metadata extends PipeMiddlewareMetadata> = Metadata['id'];

type PipeMetadataIds<Chain extends PipeMetadataChain> = PipeMetadataId<Chain[number]>;

type PipeRelationshipIds<
  Metadata extends PipeMiddlewareMetadata,
  Key extends PipeRelationshipKey,
> = Extract<Metadata[Key], readonly string[]> extends infer Relationships extends readonly string[]
  ? string extends Relationships[number]
    ? never
    : Relationships[number]
  : never;

type PipeMetadataWithIdFromUnion<
  Metadata extends PipeMiddlewareMetadata,
  Id extends string,
> = Metadata extends PipeMiddlewareMetadata
  ? Metadata['id'] extends Id
    ? Metadata
    : never
  : never;

type PipeMetadataWithId<
  Chain extends PipeMetadataChain,
  Id extends string,
> = PipeMetadataWithIdFromUnion<Chain[number], Id>;

type PipeAfterDependents<
  Metadata extends PipeMiddlewareMetadata,
  Target extends string,
> = Metadata extends PipeMiddlewareMetadata
  ? Target extends PipeRelationshipIds<Metadata, 'after'>
    ? PipeMetadataId<Metadata>
    : never
  : never;

type PipeOutgoingIds<Chain extends PipeMetadataChain, Id extends string> = Extract<
  | PipeRelationshipIds<PipeMetadataWithId<Chain, Id>, 'before'>
  | PipeAfterDependents<Chain[number], Id>,
  PipeMetadataIds<Chain>
>;

type PipeCycleFromTargets<
  Chain extends PipeMetadataChain,
  Targets extends string,
  Seen extends readonly string[],
> = Targets extends string
  ? Targets extends Seen[number]
    ? true
    : PipeHasCycleFrom<Chain, Targets, [...Seen, Targets]>
  : false;

type PipeHasCycleFrom<
  Chain extends PipeMetadataChain,
  Id extends string,
  Seen extends readonly string[],
> = true extends PipeCycleFromTargets<Chain, PipeOutgoingIds<Chain, Id>, Seen>
  ? true
  : false;

type PipeHasCycleForId<Chain extends PipeMetadataChain, Id extends string> = Id extends string
  ? PipeHasCycleFrom<Chain, Id, [Id]>
  : never;

export type PipeHasCycle<Chain extends PipeMetadataChain> = true extends PipeHasCycleForId<
  Chain,
  PipeMetadataIds<Chain>
>
  ? true
  : false;

type PipeHasReversedBefore<
  Metadata extends PipeMiddlewareMetadata,
  Previous extends PipeMetadataChain,
> = [Extract<PipeRelationshipIds<Metadata, 'before'>, PipeMetadataIds<Previous>>] extends [never]
  ? false
  : true;

type PipeHasReversedAfter<
  Metadata extends PipeMiddlewareMetadata,
  Previous extends PipeMetadataChain,
> = [PipeAfterDependents<Previous[number], PipeMetadataId<Metadata>>] extends [never]
  ? false
  : true;

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
