import type {
  PipeCapability,
  PipeMetadataCapabilities,
  PipeMiddlewareMetadata,
} from './metadata-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

declare const pipeCapabilityDiagnosticBrand: unique symbol;

/**
 * Context attached to a capability validation diagnostic.
 */
type PipeCapabilityValidationDetail<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = {
  /** Existing middleware metadata chain at the validation boundary. */
  readonly current: Current;
  /** Middleware metadata being checked for addition to the current chain. */
  readonly next: Next;
};

/**
 * Combines a diagnostic marker with its validation context and an optional brand.
 */
type PipeCapabilityDiagnostic<Marker extends string, Detail extends object> = {
  /** Diagnostic marker property whose value repeats its literal key. */
  readonly [Key in Marker]: Marker;
} & Detail & {
  /** Optional symbol-keyed brand identifying the diagnostic's marker type. */
  readonly [pipeCapabilityDiagnosticBrand]?: Marker;
};

/**
 * Diagnostic returned when a capability ID is added more than once in the
 * validated chain, including repeated additions within a single middleware.
 */
export type PipeDuplicateCapabilityDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeCapabilityDiagnostic<
  '__pipeDuplicateCapabilityError',
  PipeCapabilityValidationDetail<Current, Next>
>;

/**
 * Diagnostic returned when a middleware requires a capability ID that has not
 * been added by an earlier middleware in the validated chain.
 */
export type PipeMissingCapabilityDiagnostic<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeCapabilityDiagnostic<
  '__pipeMissingCapabilityError',
  PipeCapabilityValidationDetail<Current, Next>
>;

/** Extracts capability IDs from a middleware's additions or requirements. */
type PipeCapabilityIds<
  Metadata extends PipeMiddlewareMetadata,
  Key extends 'adds' | 'requires',
> = PipeMetadataCapabilities<Metadata, Key>[number]['id'];

/**
 * Checks a capability tuple for IDs already seen, accumulating each ID before
 * checking the remaining entries.
 */
type PipeHasDuplicateCapabilityIds<
  Capabilities extends readonly PipeCapability[],
  Seen extends string,
> = Capabilities extends readonly [
  infer First extends PipeCapability,
  ...infer Rest extends readonly PipeCapability[],
]
  ? First['id'] extends Seen
    ? true
    : PipeHasDuplicateCapabilityIds<Rest, Seen | First['id']>
  : false;

/**
 * Checks additions across the chain for duplicate capability IDs, including
 * duplicates within an individual middleware's additions.
 */
type PipeHasDuplicateCapabilityProblem<
  Chain extends PipeMetadataChain,
  Seen extends string = never,
> = Chain extends readonly [
  infer First extends PipeMiddlewareMetadata,
  ...infer Rest extends PipeMetadataChain,
]
  ? PipeHasDuplicateCapabilityIds<PipeMetadataCapabilities<First, 'adds'>, Seen> extends true
    ? true
    : PipeHasDuplicateCapabilityProblem<Rest, Seen | PipeCapabilityIds<First, 'adds'>>
  : false;

/**
 * Checks requirements against capabilities added by earlier middleware.
 * A middleware's own additions become available only to subsequent middleware.
 */
type PipeHasMissingCapabilityProblem<
  Chain extends PipeMetadataChain,
  Available extends string = never,
> = Chain extends readonly [
  infer First extends PipeMiddlewareMetadata,
  ...infer Rest extends PipeMetadataChain,
]
  ? Exclude<PipeCapabilityIds<First, 'requires'>, Available> extends never
    ? PipeHasMissingCapabilityProblem<Rest, Available | PipeCapabilityIds<First, 'adds'>>
    : true
  : false;

/**
 * Validates capability additions and requirements in Chain.
 * Duplicate additions take precedence over missing requirements. A failure
 * carries Current and Next as diagnostic context; success resolves to unknown.
 */
export type PipeCapabilityChainValidation<
  Chain extends PipeMetadataChain,
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = PipeHasDuplicateCapabilityProblem<Chain> extends true
  ? PipeDuplicateCapabilityDiagnostic<Current, Next>
  : PipeHasMissingCapabilityProblem<Chain> extends true
    ? PipeMissingCapabilityDiagnostic<Current, Next>
    : unknown;
