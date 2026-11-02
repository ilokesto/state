import type {
  PipeDuplicatePolicy,
  PipeMetadataCapabilities,
  PipeMiddlewareMetadata,
  PipeRelationshipKey,
} from './metadata-types.js';
import type { PipeDiagnostic, PipeValidationDetail } from './validation-diagnostic-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

export type PipeDuplicateMiddlewareDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeDiagnostic<
  '__pipeDuplicateMiddlewareError',
  PipeValidationDetail<Current, Next>
>;

export type PipeMiddlewareConflictDiagnostic<
  Middleware extends string = string,
  Conflict extends string = string,
> = {
  /** Marker identifying a middleware conflict diagnostic. */
  readonly __pipeMiddlewareConflictError: '__pipeMiddlewareConflictError';
  /** Identifier of a conflicting middleware present in the chain. */
  readonly conflict: Conflict;
  /** Identifier of the middleware declaring the conflict. */
  readonly middleware: Middleware;
};

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

type PipeCapabilityIds<
  Metadata extends PipeMiddlewareMetadata,
  Key extends 'adds' | 'requires',
> = PipeMetadataCapabilities<Metadata, Key>[number]['id'];

type PipeDuplicateValue<Metadata extends PipeMiddlewareMetadata> = Metadata extends {
  readonly duplicate: infer Duplicate extends PipeDuplicatePolicy;
}
  ? Duplicate
  : 'reject';

type PipeConflictIds<Metadata extends PipeMiddlewareMetadata> = Extract<
  Metadata['conflicts'],
  readonly string[]
>[number];

type PipeMetadataSignature<Metadata extends PipeMiddlewareMetadata> = {
  /** Union of capability identifiers provided by the middleware. */
  readonly adds: PipeCapabilityIds<Metadata, 'adds'>;
  /** Union of literal middleware identifiers that must precede this middleware. */
  readonly after: PipeRelationshipIds<Metadata, 'after'>;
  /** Union of literal middleware identifiers that must follow this middleware. */
  readonly before: PipeRelationshipIds<Metadata, 'before'>;
  /** Union of middleware identifiers declared incompatible with this middleware. */
  readonly conflicts: PipeConflictIds<Metadata>;
  /** Duplicate policy, defaulting to 'reject' when not explicitly declared. */
  readonly duplicate: PipeDuplicateValue<Metadata>;
  /** Identifier used to match middleware entries when checking duplicates. */
  readonly id: PipeMetadataId<Metadata>;
  /** Union of capability identifiers required by the middleware. */
  readonly requires: PipeCapabilityIds<Metadata, 'requires'>;
};

type PipeConflictForMetadata<
  Metadata extends PipeMiddlewareMetadata,
  PresentIds extends string,
> = Extract<PipeConflictIds<Metadata>, PresentIds> extends infer Conflict extends string
  ? [Conflict] extends [never]
    ? never
    : PipeMiddlewareConflictDiagnostic<PipeMetadataId<Metadata>, Conflict>
  : never;

type PipeConflictForMetadataUnion<
  Metadata extends PipeMiddlewareMetadata,
  PresentIds extends string,
> = Metadata extends PipeMiddlewareMetadata
  ? PipeConflictForMetadata<Metadata, PresentIds>
  : never;

export type PipeConflictForChain<Chain extends PipeMetadataChain> =
  PipeConflictForMetadataUnion<Chain[number], PipeMetadataIds<Chain>>;

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

type PipeHasId<Chain extends PipeMetadataChain, Id extends string> = [
  Extract<PipeMetadataIds<Chain>, Id>,
] extends [never]
  ? false
  : true;

type PipeMetadataEquivalent<
  Left extends PipeMiddlewareMetadata,
  Right extends PipeMiddlewareMetadata,
> = [PipeMetadataSignature<Left>] extends [PipeMetadataSignature<Right>]
  ? [PipeMetadataSignature<Right>] extends [PipeMetadataSignature<Left>]
    ? true
    : false
  : false;

type PipeMetadataAllAllow<Metadata extends PipeMiddlewareMetadata> = Exclude<
  PipeDuplicateValue<Metadata>,
  'allow'
> extends never
  ? true
  : false;

type PipeMetadataAllEquivalentTo<
  Baseline extends PipeMiddlewareMetadata,
  Candidates extends PipeMiddlewareMetadata,
> = false extends (Candidates extends PipeMiddlewareMetadata
  ? PipeMetadataEquivalent<Baseline, Candidates>
  : never)
  ? false
  : true;

export type PipeHasDuplicateProblem<Chain extends PipeMetadataChain> =
  Chain extends readonly [
    infer First extends PipeMiddlewareMetadata,
    ...infer Rest extends PipeMetadataChain,
  ]
    ? PipeHasId<Rest, PipeMetadataId<First>> extends true
      ? PipeMetadataAllAllow<PipeMetadataWithId<Chain, PipeMetadataId<First>>> extends true
        ? PipeMetadataAllEquivalentTo<
            First,
            PipeMetadataWithId<Rest, PipeMetadataId<First>>
          > extends true
          ? PipeHasDuplicateProblem<Rest>
          : true
        : true
      : PipeHasDuplicateProblem<Rest>
    : false;
