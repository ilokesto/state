import type { PipeMiddlewareMetadata } from './metadata-types.js';
import type { PipeMetadataChain } from './validation-shared-types.js';

declare const pipeDiagnosticBrand: unique symbol;

/**
 * A diagnostic combining marker-named fields with contextual detail and an
 * optional symbol brand.
 */
export type PipeDiagnostic<Marker extends string, Detail extends object> = {
  /** Identifies the diagnostic using each marker as both its key and value. */
  readonly [Key in Marker]: Marker;
} & Detail & {
  /** Associates the diagnostic with its marker without requiring a brand value. */
  readonly [pipeDiagnosticBrand]?: Marker;
};

/** Provides the metadata involved in validating the next middleware in a pipe. */
export type PipeValidationDetail<
  Current extends PipeMetadataChain,
  Next extends PipeMiddlewareMetadata,
> = {
  /** Metadata chain accumulated before the next middleware is validated. */
  readonly current: Current;
  /** Metadata of the middleware being validated against the current chain. */
  readonly next: Next;
};
