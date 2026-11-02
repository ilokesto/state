export type PipeConfigurationErrorCode =
  | 'DUPLICATE_CAPABILITY'
  | 'DUPLICATE_MIDDLEWARE'
  | 'INVALID_METADATA'
  | 'INVALID_MIDDLEWARE_RESULT'
  | 'INVALID_STORE_INPUT'
  | 'MISSING_CAPABILITY'
  | 'MIDDLEWARE_CONFLICT'
  | 'MIDDLEWARE_CYCLE'
  | 'MIDDLEWARE_ORDER';

type PipeConfigurationErrorContext = {
  /** Primary identifier associated with the configuration failure. */
  readonly id: string;
  /** Identifiers associated with the configuration failure. */
  readonly ids: readonly string[];
};

/**
 * @description Represents a pipe configuration failure as a TypeError with a
 * machine-readable code, a primary identifier, and a frozen copy of related
 * identifiers.
 * @example
 * ```ts
 * const error = new PipeConfigurationError(
 *   'MISSING_CAPABILITY',
 *   'The persistence middleware requires the storage capability.',
 *   { id: 'persistence', ids: ['storage'] },
 * );
 * console.error(error.code, error.id, error.ids);
 * ```
 */
export class PipeConfigurationError extends TypeError {
  /** Machine-readable category of the configuration failure. */
  readonly code: PipeConfigurationErrorCode;
  /** Primary identifier associated with the configuration failure. */
  readonly id: string;
  /** Frozen copy of the identifiers supplied in the error context. */
  readonly ids: readonly string[];
  /** Error name identifying this pipe configuration error type. */
  readonly name = 'PipeConfigurationError';

  /**
   * @description Creates a configuration error with the supplied message and
   * context, copying and freezing the identifier array so subsequent changes to
   * the input array do not affect the error.
   * @param {PipeConfigurationErrorCode} code - Category of the configuration failure.
   * @param {string} message - Human-readable explanation passed to TypeError.
   * @param {PipeConfigurationErrorContext} context - Identifiers describing the failure.
   * @param {string} context.id - Primary identifier associated with the failure.
   * @param {readonly string[]} context.ids - Related identifiers to copy and freeze.
   * @example
   * ```ts
   * throw new PipeConfigurationError(
   *   'DUPLICATE_MIDDLEWARE',
   *   'Middleware identifier "logger" is registered more than once.',
   *   { id: 'logger', ids: ['logger', 'logger'] },
   * );
   * ```
   */
  constructor(
    code: PipeConfigurationErrorCode,
    message: string,
    context: PipeConfigurationErrorContext,
  ) {
    super(message);
    this.code = code;
    this.id = context.id;
    this.ids = Object.freeze([...context.ids]);
  }
}
