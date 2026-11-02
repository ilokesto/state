import type { PipeMiddlewareMetadata } from './metadata-types.js';

declare const pipeMiddlewareMetadataBrand: unique symbol;

/**
 * A middleware type augmented with compile-time metadata and a discriminator
 * for pipe-state or persistence-decoder state mismatches.
 *
 * These branded fields describe type-level information; this type declaration
 * does not create runtime properties.
 */
export type PipeableMiddleware<
  Middleware extends object,
  Metadata extends PipeMiddlewareMetadata,
  StateMismatchKind extends 'pipe' | 'persist-decoder' = 'pipe',
> = Middleware & {
  /** Compile-time middleware metadata with a required, non-nullable conflicts field. */
  readonly [pipeMiddlewareMetadataBrand]: Metadata & {
    /** Conflict information with null and undefined excluded from its type. */
    readonly conflicts: NonNullable<Metadata['conflicts']>;
  };
  /** Identifies whether state mismatches concern piping or persistence decoding. */
  readonly [pipeStateMismatchKindBrand]: StateMismatchKind;
};

declare const pipeStateMismatchKindBrand: unique symbol;
